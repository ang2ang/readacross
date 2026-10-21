import { useI18n } from '../../i18n/useI18n';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import { useReadingStore } from '../../store/useReadingStore';
import { quoteText } from '../../reading/policy';
import { PDF_BASE_WIDTH, pdfPageWidth, pdfCenterAnchor, pdfCenterScroll } from '../../reading/pdf-layout';
import { pdfNamedLinkPage } from '../../reading/pdf-links';
import type { ReaderBridge, RelativeRect, SourceLocator } from '../../reading/types';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
type PDFDocument = Parameters<NonNullable<ComponentProps<typeof Document>['onLoadSuccess']>>[0];

export function PDFViewer({ fontSize = 100 }: { fontSize?: number }) {
    const { t } = useI18n();
    const file = useFileStore(state => state.file);
    const ready = useReadingStore(state => state.ready);
    const fitWidth = useReadingStore(state => state.pdfFitWidth);
    const [pdf, setPdf] = useState<PDFDocument | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [available, setAvailable] = useState(800);
    const [highlight, setHighlight] = useState<RelativeRect[]>([]);
    const [linkNotice, setLinkNotice] = useState<string | null>(null);
    const scroll = useRef<HTMLDivElement>(null);
    const paper = useRef<HTMLDivElement>(null);
    const page = useRef(1);
    const restored = useRef(false);
    const pending = useRef<{ location: SourceLocator; resolve?: () => void } | null>(null);
    const programmatic = useRef(false);
    const highlightVersion = useRef(0);
    const rendered = useRef({ page: 0, width: 0 });
    const desired = useRef({ page: 1, width: 800 });
    const availableRef = useRef(800);
    const lastLocation = useRef<SourceLocator>({ type: 'pdf', page: 1, y: 0 });
    const linkNavigation = useRef<((target: number) => void) | null>(null);
    const namedLinks = useRef(new Map<string, string>());
    const linkRequest = useRef(0);
    const width = pdfPageWidth(available, fontSize, fitWidth);
    const sourceText = useCallback(async (pageNumber: number) => {
        if (!pdf) return '';
        const source = await pdf.getPage(pageNumber);
        const content = await source.getTextContent();
        return content.items.map(item => 'str' in item ? item.str : '').join(' ');
    }, [pdf]);
    const getLocation = useCallback((): SourceLocator => {
        if (!paper.current || !scroll.current) return lastLocation.current;
        const bounds = paper.current.getBoundingClientRect();
        const viewport = scroll.current.getBoundingClientRect();
        const previous = lastLocation.current;
        const center = previous.type === 'pdf' && previous.page === page.current && previous.anchor === 'center' ? previous : null;
        return { type: 'pdf', page: page.current, anchor: 'center',
            x: pdfCenterAnchor(viewport.left, scroll.current.clientWidth, bounds.left, bounds.width, center?.x),
            y: pdfCenterAnchor(viewport.top, scroll.current.clientHeight, bounds.top, bounds.height, center?.y) };
    }, []);
    const showHighlight = useCallback(async (locator: SourceLocator | null) => {
        const version = ++highlightVersion.current;
        setHighlight([]);
        if (locator?.type !== 'pdf' || locator.page !== page.current || !locator.rects || !locator.quote) return;
        try {
            const text = await sourceText(locator.page);
            if (version === highlightVersion.current && quoteText(text).includes(quoteText(locator.quote))) setHighlight(locator.rects);
        } catch { /* Destroyed or unreadable pages cannot be highlighted precisely. */ }
    }, [sourceText]);
    const applyPending = useCallback(() => {
        const target = pending.current;
        if (!target || target.location.type !== 'pdf' || target.location.page !== page.current
            || rendered.current.page !== page.current || rendered.current.width !== desired.current.width) return;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (pending.current !== target || !scroll.current || !paper.current
                || rendered.current.page !== page.current || rendered.current.width !== desired.current.width) return;
            const locator = target.location;
            if (locator.type !== 'pdf') return;
            const { height: pageHeight, width: pageWidth } = paper.current.getBoundingClientRect();
            const top = locator.rects?.length ? Math.max(0, locator.rects[0].y * pageHeight - scroll.current.clientHeight * 0.2) : (locator.y || 0) * pageHeight;
            const left = locator.rects?.length ? Math.max(0, locator.rects[0].x * pageWidth - scroll.current.clientWidth * 0.15) : (locator.x || 0) * pageWidth;
            scroll.current.scrollTop = locator.anchor === 'center' && !locator.rects?.length
                ? pdfCenterScroll(locator.y || 0, pageHeight, scroll.current.clientHeight) : top + (top ? 24 : 0);
            scroll.current.scrollLeft = locator.anchor === 'center' && !locator.rects?.length
                ? pdfCenterScroll(locator.x ?? 0.5, pageWidth, scroll.current.clientWidth) : left + (left ? 24 : 0);
            lastLocation.current = getLocation();
            void showHighlight(locator);
            pending.current = null;
            programmatic.current = false;
            target.resolve?.();
        }));
    }, [getLocation, showHighlight]);
    const navigate = async (source: SourceLocator) => {
        linkRequest.current++;
        setLinkNotice(null);
        let locator = source;
        if (locator.type === 'pdf' && locator.rects?.length && locator.quote) {
            try {
                if (!quoteText(await sourceText(locator.page)).includes(quoteText(locator.quote))) locator = { type: 'pdf', page: locator.page };
            } catch { locator = { type: 'pdf', page: locator.page }; }
        }
        await new Promise<void>(resolve => {
            if (locator.type !== 'pdf' || !pdf) { resolve(); return; }
            const targetPage = Math.max(1, Math.min(pdf.numPages, locator.page));
            pending.current?.resolve?.();
            programmatic.current = true;
            pending.current = { location: { ...locator, page: targetPage }, resolve };
            const samePage = targetPage === page.current && rendered.current.page === targetPage;
            page.current = targetPage; setPageNumber(targetPage);
            if (samePage) applyPending();
        });
        if (locator !== source) return 'range' as const;
    };
    const goToPage = (target: number) => {
        if (!pdf) return;
        useReadingStore.getState().userNavigated();
        const next = Math.max(1, Math.min(pdf.numPages, target));
        const revision = useReadingStore.getState().revision;
        void navigate({ type: 'pdf', page: next, y: 0 }).then(() => {
            if (useReadingStore.getState().revision === revision) useReadingStore.getState().reportPosition(getLocation());
        });
    };
    // Document retains its first link callback, created before pdf has loaded.
    // Dispatch through the committed handler so links use the current document.
    useLayoutEffect(() => {
        linkNavigation.current = goToPage;
        return () => { linkNavigation.current = null; };
    });
    const followNamedLink = (event: React.MouseEvent) => {
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('.annotationLayer a[data-element-id]');
        const name = namedLinks.current.get(anchor?.dataset.elementId || '');
        if (!pdf || name === undefined) return;
        event.preventDefault(); event.stopPropagation();
        const request = ++linkRequest.current;
        const revision = useReadingStore.getState().revision;
        const active = () => request === linkRequest.current && revision === useReadingStore.getState().revision;
        setLinkNotice(null);
        void pdfNamedLinkPage(pdf, name).then(target => {
            if (!active()) return;
            if (target) linkNavigation.current?.(target);
            else setLinkNotice('This link’s destination is missing from the PDF.');
        }).catch(() => { if (active()) setLinkNotice('This PDF link could not be opened.'); });
    };

    useEffect(() => {
        const element = scroll.current;
        if (!element) return;
        const observer = new ResizeObserver(entries => {
            // ResizeObserver's content box already excludes the container padding.
            const next = Math.max(1, entries[0].contentRect.width);
            if (Math.abs(availableRef.current - next) <= 1) return;
            if (paper.current && !pending.current) {
                pending.current = { location: lastLocation.current };
                programmatic.current = true;
            }
            availableRef.current = next;
            setAvailable(next);
            requestAnimationFrame(applyPending);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [applyPending]);
    useLayoutEffect(() => {
        if (desired.current.width !== width && paper.current && restored.current && !pending.current) {
            pending.current = { location: lastLocation.current };
            programmatic.current = true;
        }
        desired.current = { page: pageNumber, width };
    }, [width, pageNumber]);
    useEffect(() => {
        useReadingStore.getState().setPdfFitPercent(Math.round(available / PDF_BASE_WIDTH * 100));
    }, [available]);
    useEffect(() => () => { highlightVersion.current++; linkRequest.current++; pending.current?.resolve?.(); }, []);
    useEffect(() => {
        const capture = () => {
            const value = window.getSelection();
            if (!value?.rangeCount || !value.toString().trim()) return;
            const range = value.getRangeAt(0);
            if (!paper.current?.contains(range.commonAncestorContainer)) return;
            const bounds = paper.current.getBoundingClientRect();
            const rects: RelativeRect[] = [...range.getClientRects()].filter(rect => rect.width && rect.height).map(rect => ({
                x: Math.max(0, (rect.left - bounds.left) / bounds.width), y: Math.max(0, (rect.top - bounds.top) / bounds.height),
                width: Math.min(1, rect.width / bounds.width), height: Math.min(1, rect.height / bounds.height),
            }));
            const text = value.toString().trim();
            const snapshot = { text, locator: { type: 'pdf' as const, page: page.current, quote: text, rects } };
            useReadingStore.getState().setSelection(snapshot);
            useFileStore.getState().setSelection(text);
        };
        document.addEventListener('selectionchange', capture);
        return () => document.removeEventListener('selectionchange', capture);
    }, []);
    useEffect(() => {
        if (!pdf) return;
        const bridge: ReaderBridge = {
            getLocation,
            readSource: async () => {
                const current = page.current;
                return { text: await sourceText(current), locator: { type: 'pdf', page: current } };
            },
            navigate,
            highlight: locator => { void showHighlight(locator); },
        };
        useReadingStore.getState().setBridge(bridge);
        useFileStore.getState().setGetPageText(async () => (await bridge.readSource()).text);
        return () => {
            if (useReadingStore.getState().bridge === bridge) useReadingStore.getState().setBridge(null);
            useFileStore.getState().setGetPageText(null);
        };
        // The bridge reads mutable viewer refs; it is registered once per PDF.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdf]);
    useEffect(() => {
        if (!ready || !pdf || restored.current) return;
        restored.current = true;
        const location = useReadingStore.getState().document?.position;
        if (location?.type === 'pdf') queueMicrotask(() => { void navigate(location); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, pdf]);
    useEffect(() => {
        const key = (event: KeyboardEvent) => {
            if ((event.target as HTMLElement)?.closest('input,textarea,select,button,[role="menu"],[contenteditable="true"]') || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'ArrowLeft') { event.preventDefault(); goToPage(page.current - 1); }
            if (event.key === 'ArrowRight') { event.preventDefault(); goToPage(page.current + 1); }
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdf]);
    const userInput = () => { if (!programmatic.current) useReadingStore.getState().userNavigated(); };
    return <div className="flex flex-col h-full w-full min-w-0 bg-slate-100">
        <div className="flex flex-wrap items-center justify-center gap-2 py-2 px-2 bg-white border-b border-slate-200 shrink-0">
            <button disabled={!pdf || pageNumber <= 1} onClick={() => goToPage(page.current - 1)} className="flex items-center gap-1 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded disabled:opacity-40"><ChevronLeft className="w-4 h-4" /><span className="hidden sm:inline">{t("Previous")}</span></button>
            <input aria-label={t("Page number")} type="number" min={1} max={pdf?.numPages || 1} value={pageNumber} onChange={event => { const value = Number(event.target.value); if (pdf && value >= 1 && value <= pdf.numPages) goToPage(value); }} className="w-14 text-center text-sm border border-slate-200 rounded py-1" />
            <span className="text-sm text-slate-400">/ {pdf?.numPages || '…'}</span>
            <button disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => goToPage(page.current + 1)} className="flex items-center gap-1 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded disabled:opacity-40"><span className="hidden sm:inline">{t("Next")}</span><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => useReadingStore.getState().fitPdfWidth()} aria-pressed={fitWidth} className={`ml-2 px-2 py-1.5 border rounded text-xs ${fitWidth ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{t("Fit width")}</button>
        </div>
        {linkNotice && <p role="status" className="shrink-0 px-4 py-2 text-xs text-slate-600 bg-slate-50 border-b border-slate-200">{t(linkNotice)}</p>}
        <div ref={scroll} className="flex-1 min-h-0 overflow-auto p-6" onClickCapture={followNamedLink} onWheel={userInput} onTouchStart={userInput} onPointerDown={userInput}
            onScroll={() => { if (!programmatic.current && restored.current) { lastLocation.current = getLocation(); useReadingStore.getState().reportPosition(lastLocation.current); } }}>
            <div className="w-fit mx-auto">
                <Document file={file} onLoadSuccess={setPdf} loading={<div className="p-10 text-slate-500">{t("Loading PDF…")}</div>} error={<div className="p-10 text-red-600">{t("Failed to load PDF. Please select the file again.")}</div>}
                    onItemClick={({ pageNumber: target }) => { if (target) linkNavigation.current?.(target); }}>
                    <div ref={paper} className="relative shadow-lg bg-white" style={{ width }}>
                        <Page pageNumber={pageNumber} width={width} renderTextLayer renderAnnotationLayer
                            onGetAnnotationsSuccess={annotations => {
                                if (desired.current.page !== pageNumber) return;
                                namedLinks.current = new Map(annotations.filter(item => typeof item.dest === 'string')
                                    .map(item => [item.id, item.dest as string]));
                            }}
                            onRenderSuccess={() => {
                                if (desired.current.page !== pageNumber || desired.current.width !== width) return;
                                rendered.current = { page: pageNumber, width };
                                if (pending.current) applyPending();
                                else lastLocation.current = getLocation();
                            }} onRenderError={() => {
                                if (desired.current.page !== pageNumber || desired.current.width !== width) return;
                                pending.current?.resolve?.(); pending.current = null; programmatic.current = false;
                            }} />
                        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">{highlight.map((rect, index) => <span key={index} className="absolute bg-blue-400/25" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />)}</div>
                    </div>
                </Document>
            </div>
        </div>
    </div>;
}
