import { useI18n } from '../../i18n/useI18n';
import { useState, useRef, useEffect, useCallback } from 'react';
import { EpubView } from 'react-reader';
import { EpubCFI } from 'epubjs';
import type { Rendition, Contents, Location } from 'epubjs';
import { ChevronLeft, ChevronRight, List, X } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import { useReadingStore } from '../../store/useReadingStore';
import { quoteText } from '../../reading/policy';
import type { ReaderBridge, SourceLocator, SourceSnapshot } from '../../reading/types';

interface TocItem { label: string; href: string; subitems?: TocItem[] }

function resizeAt(rendition: Rendition, width: number, height: number, target?: string) {
    // EPUB.js supports a destination argument that its bundled typings omit.
    const resize = rendition.resize as (width: number, height: number, target?: string) => void;
    resize.call(rendition, Math.round(width), Math.round(height), target);
}

export function EpubViewer({ fontSize = 100 }: { fontSize?: number }) {
    const { t } = useI18n();
    const file = useFileStore(state => state.file);
    const ready = useReadingStore(state => state.ready);
    const savedPosition = useReadingStore(state => state.document?.position);
    const [location, setLocation] = useState<string | number | null>(null);
    const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
    const [toc, setToc] = useState<TocItem[]>([]);
    const [showToc, setShowToc] = useState(false);
    const [navigationError, setNavigationError] = useState<string | null>(null);
    const renditionRef = useRef<Rendition | null>(null);
    const readerPane = useRef<HTMLDivElement>(null);
    const attached = useRef(false);
    const current = useRef<Location | null>(null);
    const highlighted = useRef<string | null>(null);
    const highlightVersion = useRef(0);
    const bridgeRef = useRef<ReaderBridge | null>(null);
    const active = useRef(true);
    const fontRef = useRef(fontSize);
    const navigationVersion = useRef(0);
    const destination = useRef<{ target: string; section: number; anchor: string | null; cfi: boolean } | null>(null);
    const cancelNavigation = useCallback(() => {
        navigationVersion.current++;
        destination.current = null;
    }, []);
    useEffect(() => {
        let cancelled = false;
        if (file) void file.arrayBuffer().then(data => { if (!cancelled) setBookData(data); });
        return () => { cancelled = true; };
    }, [file]);

    useEffect(() => {
        const pane = readerPane.current;
        if (!pane) return;
        let previous = '';
        const observer = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            const size = `${Math.round(width)}:${Math.round(height)}`;
            if (width > 0 && height > 0 && size !== previous) {
                previous = size;
                const rendition = renditionRef.current;
                if (rendition && attached.current) resizeAt(rendition, width, height,
                    destination.current?.target || current.current?.start.cfi);
            }
        });
        observer.observe(pane);
        return () => observer.disconnect();
    }, [bookData, ready]);

    const getLocation = (): SourceLocator | null => {
        const value = current.current?.start;
        return value ? { type: 'epub', cfi: value.cfi, section: value.index } : null;
    };
    const destinationReached = (value: Location, rendition: Rendition) => {
        const target = destination.current;
        if (!target) return true;
        if (value.start.index !== target.section) return false;
        if (target.cfi) {
            const cfi = new EpubCFI();
            return cfi.compare(value.start.cfi, target.target) <= 0 && cfi.compare(target.target, value.end.cfi) <= 0;
        }
        if (!target.anchor) return value.start.displayed.page === 1;
        const pane = readerPane.current?.getBoundingClientRect();
        if (!pane) return false;
        return (rendition.getContents() as unknown as Contents[]).some(contents => {
            const element = contents.document.getElementById(target.anchor!);
            const frame = contents.window.frameElement?.getBoundingClientRect();
            if (!element || !frame) return false;
            return [...element.getClientRects()].some(rect => rect.height > 0
                && frame.left + rect.left >= pane.left - 2 && frame.left + rect.left < pane.right
                && frame.top + rect.top >= pane.top - 2 && frame.top + rect.top < pane.bottom);
        });
    };
    const displayTarget = async (target: string, afterLayout = false) => {
        const rendition = renditionRef.current;
        if (!rendition) return;
        const version = ++navigationVersion.current;
        destination.current = null;
        const section = rendition.book.spine.get(target);
        if (!section) throw new Error('This EPUB section is unavailable.');
        const hash = target.indexOf('#');
        const intent = { target, section: section.index, cfi: target.startsWith('epubcfi('),
            anchor: hash < 0 ? null : decodeURIComponent(target.slice(hash + 1)) || null };
        destination.current = intent;
        setNavigationError(null);
        // Closing the TOC changes the reader width. Let that layout commit first;
        // any intervening resize must use this destination rather than the old CFI.
        try {
            let resolved = target;
            const anchor = intent.anchor;
            if (anchor) {
                await section.load(rendition.book.load.bind(rendition.book));
                const doc = section.document;
                const element = doc.getElementById(anchor);
                if (!element) throw new Error('This EPUB anchor is unavailable.');
                const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                let text = walker.nextNode();
                while (text && !text.textContent?.trim()) text = walker.nextNode();
                if (text) {
                    const range = doc.createRange(); range.setStart(text, 0); range.collapse(true);
                    resolved = new EpubCFI(range, section.cfiBase).toString();
                }
            }
            if (!active.current || version !== navigationVersion.current || renditionRef.current !== rendition) return;
            destination.current = { ...intent, target: resolved, cfi: resolved.startsWith('epubcfi(') };
            if (afterLayout) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            if (!active.current || version !== navigationVersion.current || renditionRef.current !== rendition) return;
            const bounds = readerPane.current?.getBoundingClientRect();
            if (bounds && attached.current) resizeAt(rendition, bounds.width, bounds.height, resolved);
            await rendition.display(resolved);
            // EPUB.js applies theme overrides after its first layout. Reposition
            // once that reflow has committed, especially at non-default font sizes.
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            if (active.current && version === navigationVersion.current && renditionRef.current === rendition) {
                await rendition.display(resolved);
            }
        } catch (error) {
            if (version === navigationVersion.current) destination.current = null;
            throw error;
        }
    };
    const showHighlight = async (locator: SourceLocator | null) => {
        const rendition = renditionRef.current;
        const version = ++highlightVersion.current;
        if (!rendition) return;
        if (highlighted.current) rendition.annotations.remove(highlighted.current, 'highlight');
        highlighted.current = null;
        if (locator?.type !== 'epub' || !locator.quote) return;
        try {
            const range = rendition.getRange(locator.cfi);
            // getRange only resolves a range in an already displayed chapter. Never navigate on hover.
            if (!range || quoteText(range.toString()) !== quoteText(locator.quote)) return;
            if (version !== highlightVersion.current || !active.current) return;
            rendition.annotations.highlight(locator.cfi, {}, undefined, 'readacross-source', { fill: '#60a5fa', 'fill-opacity': '0.25' });
            highlighted.current = locator.cfi;
        } catch { /* Invalid or unloaded CFI falls back to section navigation. */ }
    };
    const navigate = async (locator: SourceLocator) => {
        const rendition = renditionRef.current;
        if (!rendition || locator.type !== 'epub') return;
        let fallback = false;
        try {
            if (locator.quote) {
                const range = await rendition.book.getRange(locator.cfi);
                if (quoteText(range.toString()) !== quoteText(locator.quote)) throw new Error('Selection no longer matches.');
            }
            const start = new EpubCFI(locator.cfi); start.collapse(true);
            await displayTarget(start.toString());
        } catch {
            // Section-level fallback is intentionally less precise.
            const section = locator.section !== undefined ? rendition.book.spine.get(locator.section) : undefined;
            if (!section) throw new Error('This saved section is unavailable.');
            fallback = true;
            await displayTarget(section.href);
        }
        if (active.current) await showHighlight(fallback ? null : locator);
        if (fallback) return 'range' as const;
    };
    const readSource = async (): Promise<SourceSnapshot> => {
        const rendition = renditionRef.current;
        const value = current.current;
        if (!rendition || !value) throw new Error('The current EPUB view is still loading.');
        const locator: SourceLocator = { type: 'epub', cfi: value.start.cfi, endCfi: value.end.cfi, section: value.start.index };
        try {
            const start = await rendition.book.getRange(value.start.cfi);
            const end = await rendition.book.getRange(value.end.cfi);
            if (start.startContainer.ownerDocument === end.endContainer.ownerDocument) {
                const range = start.startContainer.ownerDocument!.createRange();
                range.setStart(start.startContainer, start.startOffset);
                range.setEnd(end.endContainer, end.endOffset);
                if (range.toString().trim()) return { text: range.toString().trim(), locator };
            }
        } catch { /* Retain the existing visible-element extraction fallback. */ }
        const contents = rendition.getContents() as unknown as Contents[];
        const texts: string[] = [];
        const viewport = readerPane.current?.getBoundingClientRect();
        for (const content of contents) {
            const frame = content.window.frameElement?.getBoundingClientRect();
            if (!frame || !viewport) continue;
            content.document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,dd').forEach(element => {
                const boxes = [...element.getClientRects()];
                if (boxes.length && boxes.every(rect => rect.width > 0 && rect.height > 0
                    && frame.left + rect.left >= viewport.left - 10 && frame.left + rect.right <= viewport.right + 10
                    && frame.top + rect.top >= viewport.top - 10 && frame.top + rect.bottom <= viewport.bottom + 10)) {
                    const text = element.textContent?.trim();
                    if (text && !texts.includes(text)) texts.push(text);
                }
            });
        }
        return { text: texts.join('\n\n'), locator };
    };
    const locationChanged = (cfi: string | number) => setLocation(cfi);
    const tocChanged = (items: TocItem[]) => setToc(items);
    const goToChapter = (href: string) => {
        useReadingStore.getState().userNavigated();
        const version = navigationVersion.current + 1;
        void displayTarget(href, true).catch(() => {
            if (active.current && navigationVersion.current === version) setNavigationError('This EPUB section could not be opened.');
        });
        setShowToc(false);
    };
    const handlePrev = () => {
        cancelNavigation(); setNavigationError(null);
        useReadingStore.getState().userNavigated();
        void renditionRef.current?.prev();
    };
    const handleNext = () => {
        cancelNavigation(); setNavigationError(null);
        useReadingStore.getState().userNavigated();
        void renditionRef.current?.next();
    };
    const keydown = (event?: KeyboardEvent) => {
        if (!event) return;
        if ((event.target as HTMLElement)?.closest('input,textarea,select,button,[role="menu"],[contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); handlePrev(); }
        if (event.key === 'ArrowRight') { event.preventDefault(); handleNext(); }
    };
    const getRendition = (rendition: Rendition) => {
        renditionRef.current = rendition;
        attached.current = false;
        const initialTarget = savedPosition?.type === 'epub' ? savedPosition.cfi : null;
        const initialVersion = navigationVersion.current;
        if (initialTarget) rendition.once('rendered', () => {
            // The first layout precedes theme overrides. Restore the saved CFI
            // after those styles commit, unless the user has already navigated.
            requestAnimationFrame(() => {
                if (active.current && renditionRef.current === rendition && navigationVersion.current === initialVersion) {
                    void displayTarget(initialTarget).catch(() => {
                        if (active.current && renditionRef.current === rendition) setNavigationError('This EPUB position could not be restored.');
                    });
                }
            });
        });
        rendition.on('attached', () => {
            if (!active.current || renditionRef.current !== rendition || !readerPane.current) return;
            attached.current = true;
            const { width, height } = readerPane.current.getBoundingClientRect();
            rendition.resize(Math.round(width), Math.round(height));
        });
        rendition.themes.fontSize(`${fontRef.current}%`);
        rendition.on('relocated', (value: Location) => {
            if (!active.current || renditionRef.current !== rendition || !destinationReached(value, rendition)) return;
            destination.current = null;
            current.current = value;
            const position = getLocation();
            if (position) useReadingStore.getState().reportPosition(position);
        });
        rendition.on('selected', (cfi: string, contents: Contents) => {
            const text = contents.window.getSelection()?.toString().trim();
            if (!text) return;
            const locator: SourceLocator = { type: 'epub', cfi, quote: text, section: contents.sectionIndex };
            useFileStore.getState().setSelection(text);
            useReadingStore.getState().setSelection({ text, locator });
        });
        rendition.hooks.content.register((contents: Contents) => {
            const manual = () => useReadingStore.getState().userNavigated();
            contents.document.addEventListener('wheel', manual, { passive: true });
            contents.document.addEventListener('touchstart', manual, { passive: true });
            contents.document.addEventListener('pointerdown', manual, { passive: true });
        });
        const bridge: ReaderBridge = { getLocation, readSource, navigate, highlight: locator => { void showHighlight(locator); } };
        bridgeRef.current = bridge;
        useReadingStore.getState().setBridge(bridge);
        useFileStore.getState().setGetPageText(async () => (await bridge.readSource()).text);
    };
    useEffect(() => {
        active.current = true;
        window.addEventListener('keydown', keydown);
        return () => {
            active.current = false;
            cancelNavigation();
            window.removeEventListener('keydown', keydown);
            if (useReadingStore.getState().bridge === bridgeRef.current) useReadingStore.getState().setBridge(null);
            useFileStore.getState().setGetPageText(null);
            renditionRef.current = null; attached.current = false;
        };
        // The keyboard handler reads only the rendition ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cancelNavigation]);
    useEffect(() => {
        fontRef.current = fontSize;
        const rendition = renditionRef.current;
        if (!rendition) return;
        rendition.themes.fontSize(`${fontSize}%`);
        // Read the latest intent after reflow, since a TOC click may have happened
        // since the font changed. Never replay a CFI captured before that click.
        const frame = requestAnimationFrame(() => {
            const target = destination.current?.target || current.current?.start.cfi;
            if (target && active.current && renditionRef.current === rendition) void rendition.display(target).catch(() => {
                if (active.current) setNavigationError('This EPUB position could not be restored.');
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [fontSize]);

    if (!bookData || !ready) return <div className="p-10 text-center">{t("Reading file...")}</div>;

    const renderToc = (items: TocItem[], depth = 0): React.ReactNode => <ul className={depth ? 'pl-4 space-y-0.5' : 'space-y-0.5'}>
        {items.map((item, index) => <li key={`${item.href}-${index}`}>
            <button onClick={() => goToChapter(item.href)} title={item.label} data-epub-href={item.href}
                className={`w-full text-left px-4 transition-colors truncate hover:bg-slate-100 ${depth ? 'py-1.5 text-xs text-slate-500' : 'py-2 text-sm text-slate-700'}`}>{item.label}</button>
            {!!item.subitems?.length && renderToc(item.subitems, depth + 1)}
        </li>)}
    </ul>;

    return (
        <div className="h-full w-full min-w-0 bg-slate-50 relative flex flex-col">
            {/* Navigation Bar */}
            <div className="flex items-center justify-center gap-4 py-2 bg-white border-b border-slate-200 shrink-0 z-20 relative">
                {/* TOC Toggle Button */}
                <button
                    onClick={() => setShowToc(!showToc)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer select-none ${showToc ? 'bg-blue-100 text-blue-600' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                    title={t("Table of Contents")}
                >
                    <List className="w-4 h-4" />
                    {t("TOC")}
                </button>

                <div className="h-4 w-px bg-slate-200" />

                <button
                    onClick={handlePrev}
                    className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors cursor-pointer select-none"
                >
                    <ChevronLeft className="w-4 h-4" /> {t("Previous")}
                </button>
                <button
                    onClick={handleNext}
                    className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors cursor-pointer select-none"
                >
                    {t("Next")} <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            {navigationError && <p role="status" className="shrink-0 px-4 py-2 text-xs text-slate-600 border-b border-slate-200">{t(navigationError)}</p>}

            {/* Main Content Area */}
            <div className="flex-1 relative overflow-hidden flex">
                {/* TOC Sidebar */}
                {showToc && (
                    <div className="w-72 bg-white border-r border-slate-200 overflow-y-auto shrink-0 z-10">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 sticky top-0">
                            <span className="text-sm font-semibold text-slate-700">{t("Table of Contents")}</span>
                            <button
                                onClick={() => setShowToc(false)}
                                aria-label={t("Close table of contents")}
                                className="p-1 hover:bg-slate-200 rounded transition-colors"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>
                        <nav className="py-2" aria-label={t("Table of contents")}>
                            {toc.length === 0 ? (
                                <p className="px-4 py-3 text-sm text-slate-400">{t("No table of contents available")}</p>
                            ) : (
                                renderToc(toc)
                            )}
                        </nav>
                    </div>
                )}

                {/* Reader Content */}
                <div ref={readerPane} className="flex-1 min-w-0 relative overflow-hidden h-full">
                    <EpubView
                        url={bookData}
                        location={location ?? (savedPosition?.type === 'epub' ? savedPosition.cfi : 0)}
                        locationChanged={locationChanged}
                        tocChanged={tocChanged}
                        getRendition={getRendition}
                        handleKeyPress={keydown}
                        loadingView={<div className="absolute inset-0 flex items-center justify-center text-slate-400">{t("Loading...")}</div>}
                        epubOptions={{
                            flow: 'paginated',
                            manager: 'default',
                            allowScriptedContent: true,
                            spread: 'none',
                        }}
                        epubViewStyles={{
                            viewHolder: {
                                height: '100%',
                                overflow: 'hidden',
                            },
                            view: {
                                height: '100%',
                            },
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
