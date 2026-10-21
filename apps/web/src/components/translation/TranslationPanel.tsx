import { useI18n } from '../../i18n/useI18n';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Check, ChevronDown, ChevronRight, Copy, Download, Loader2, MapPin, PanelRightClose, Play, Sparkles, Square, Trash2, X } from 'lucide-react';
import { buildSystemPrompt, translateText } from '@readacross/core';
import type { PromptStyle } from '@readacross/core';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useFileStore } from '../../store/useFileStore';
import { useReadingStore } from '../../store/useReadingStore';
import { compareRecords, digest, normalizeText, translationKey } from '../../reading/policy';
import { buildReadingMarkdown } from '../../reading/markdown';
import type { TranslationRecord, TranslationSettings } from '../../reading/types';

interface TranslationPanelProps {
    onClose: () => void;
    isOpen: boolean;
    autoTranslate?: boolean;
    onAutoTranslateConsumed?: () => void;
    getLatestSelection?: () => string;
}
interface Draft { revision: number; text: string; translation: string; loading: boolean }

export function TranslationPanel({ onClose, isOpen, autoTranslate, onAutoTranslateConsumed, getLatestSelection }: TranslationPanelProps) {
    const { t, locationLabel } = useI18n();
    const settings = useSettingsStore();
    const { file, inputMode, pastedText, images, selection, getPageText, newContentStart, clearNewContentStart } = useFileStore();
    const { revision, session, document: savedDocument, entries: savedEntries, ready, status, error: storageError, bridge } = useReadingStore();
    const [temporary, setTemporary] = useState<{ session: number; entries: TranslationRecord[] }>({ session, entries: [] });
    const [draft, setDraft] = useState<Draft | null>(null);
    const [failure, setFailure] = useState<{ revision: number; message: string } | null>(null);
    const [feedback, setFeedback] = useState<{ revision: number; message: string } | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [copied, setCopied] = useState('');
    const [exportOpen, setExportOpen] = useState(false);
    const [newOutput, setNewOutput] = useState({ session, value: false });
    const [windowSelection, setWindowSelection] = useState(false);
    const scroll = useRef<HTMLDivElement>(null);
    const exportArea = useRef<HTMLDivElement>(null);
    const exportButton = useRef<HTMLButtonElement>(null);
    const request = useRef<{ controller: AbortController; revision: number } | null>(null);
    const following = useRef(true);
    const restored = useRef<number | null>(null);
    const observedOutput = useRef({ session: -1, characters: 0, count: 0 });
    const activeDraft = draft?.revision === revision ? draft : null;
    const loading = !!activeDraft?.loading;
    const entries = file ? savedEntries : temporary.session === session ? temporary.entries : [];
    const history = [...entries].sort(compareRecords);
    const error = failure?.revision === revision ? failure.message : null;
    const info = feedback?.revision === revision ? feedback.message : null;
    const hasSelection = !!selection.trim() || windowSelection;

    useEffect(() => {
        const check = () => {
            const value = window.getSelection();
            const reader = document.getElementById('reader-content');
            setWindowSelection(!!(value?.toString().trim() && value.anchorNode && reader?.contains(value.anchorNode)));
        };
        document.addEventListener('selectionchange', check);
        return () => document.removeEventListener('selectionchange', check);
    }, []);
    useEffect(() => () => { request.current?.controller.abort(); request.current = null; }, [revision]);
    useEffect(() => {
        if (!exportOpen) return;
        const pointer = (event: PointerEvent) => {
            if (!exportArea.current?.contains(event.target as Node)) setExportOpen(false);
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { setExportOpen(false); exportButton.current?.focus(); }
        };
        document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', key);
        return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key); };
    }, [exportOpen]);
    useLayoutEffect(() => {
        if (!isOpen || !scroll.current || (file && !ready) || restored.current === session) return;
        scroll.current.scrollTop = savedDocument?.translationScroll || 0;
        following.current = scroll.current.scrollHeight - scroll.current.clientHeight - scroll.current.scrollTop < 80;
        restored.current = session;
        observedOutput.current = { session, characters: activeDraft?.translation.length || 0, count: entries.length };
    }, [isOpen, file, ready, savedDocument, session, activeDraft?.translation.length, entries.length]);
    useEffect(() => {
        if (!isOpen || restored.current !== session) return;
        const previous = observedOutput.current;
        const characters = activeDraft?.translation.length || 0;
        if (previous.session === session && previous.characters === characters && previous.count === entries.length) return;
        observedOutput.current = { session, characters, count: entries.length };
        const frame = requestAnimationFrame(() => {
            if (following.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
            else if (activeDraft?.translation || entries.length) setNewOutput({ session, value: true });
        });
        return () => cancelAnimationFrame(frame);
    }, [activeDraft?.translation, entries.length, isOpen, session]);

    const run = useCallback(async (scope: 'selection' | 'page') => {
        if (request.current || (file && !ready)) return;
        const controller = new AbortController();
        const task = { controller, revision };
        request.current = task;
        const valid = () => request.current === task && useReadingStore.getState().revision === revision && !controller.signal.aborted;
        setFailure(null); setFeedback(null);
        setDraft({ revision, text: '', translation: '', loading: true });
        let originalText = '';
        let fullTranslation = '';
        try {
            const snapshot = file ? scope === 'page' ? await bridge?.readSource() : useReadingStore.getState().selection : null;
            if (file) originalText = snapshot?.text || (scope === 'selection' ? selection : '');
            else if (scope === 'selection') originalText = getLatestSelection?.() || selection;
            else {
                originalText = await getPageText?.() || '';
                if (inputMode === 'text' && newContentStart !== null && pastedText) {
                    originalText = pastedText.slice(newContentStart); clearNewContentStart();
                }
            }
            if (!valid()) return;
            originalText = normalizeText(originalText);
            if (!originalText) throw new Error(scope === 'selection' ? 'Please select text in the original to translate.' : 'No text found on the current page.');
            setDraft({ revision, text: originalText, translation: '', loading: true });
            const systemPrompt = buildSystemPrompt(settings.promptStyle, settings.targetLanguage, settings.getActiveCustomPrompt());
            const configuration: TranslationSettings = { provider: settings.provider, model: settings.model,
                targetLanguage: settings.targetLanguage, promptStyle: settings.promptStyle, temperature: settings.temperature,
                systemPrompt, endpointHash: await digest(settings.baseUrl || '') };
            const id = file && savedDocument ? await translationKey(savedDocument.id, scope, originalText, snapshot?.locator, configuration) : crypto.randomUUID();
            if (!valid()) return;
            const cached = file ? useReadingStore.getState().entries.find(entry => entry.id === id) : null;
            if (cached) {
                const needsSave = useReadingStore.getState().unsavedEntries.includes(id);
                setDraft(null); setFeedback({ revision, message: needsSave ? 'Showing the existing translation.' : 'Showing the saved translation.' });
                if (needsSave) {
                    await useReadingStore.getState().addEntry(cached, revision);
                    if (!valid()) return;
                    setFeedback({ revision, message: useReadingStore.getState().unsavedEntries.includes(id)
                        ? 'Showing the existing translation · not saved.' : 'Showing the saved translation.' });
                }
                requestAnimationFrame(() => {
                    const element = document.getElementById(`translation-${cached.id}`);
                    if (element && scroll.current) scroll.current.scrollTop = element.offsetTop - scroll.current.offsetTop;
                });
                return;
            }
            if (!settings.apiKey && settings.provider !== 'local' && settings.provider !== 'hosted') throw new Error('Please configure an API key in settings first.');
            await translateText(originalText, { provider: settings.provider, apiKey: settings.apiKey, baseUrl: settings.baseUrl,
                model: settings.model, temperature: settings.temperature, systemPrompt, signal: controller.signal,
                onStream: chunk => {
                    if (!valid()) return;
                    fullTranslation += chunk;
                    setDraft({ revision, text: originalText, translation: fullTranslation, loading: true });
                } });
            if (!valid()) return;
            if (!fullTranslation.trim()) throw new Error('The model returned an empty translation. Please try again.');
            const entry: TranslationRecord = { id, documentId: file ? savedDocument?.id : undefined,
                originalText, translation: fullTranslation, createdAt: new Date().toISOString(), scope,
                locator: snapshot?.locator, settings: configuration };
            setDraft(null);
            if (file) await useReadingStore.getState().addEntry(entry, revision);
            else setTemporary(previous => ({ session, entries: [...(previous.session === session ? previous.entries : []), entry] }));
        } catch (cause) {
            if (request.current !== task || useReadingStore.getState().revision !== revision) return;
            setDraft(fullTranslation ? { revision, text: originalText, translation: fullTranslation, loading: false } : null);
            setFailure({ revision, message: controller.signal.aborted ? 'Translation stopped. Unfinished output was not saved.' : cause instanceof Error ? cause.message : 'Translation failed.' });
        } finally {
            if (request.current === task) request.current = null;
        }
    }, [file, ready, revision, bridge, selection, getLatestSelection, getPageText, inputMode, newContentStart, pastedText, clearNewContentStart, settings, savedDocument, session]);

    useEffect(() => {
        if (!file && autoTranslate && isOpen && getPageText && !loading) {
            onAutoTranslateConsumed?.();
            void run('page');
        }
    }, [file, autoTranslate, isOpen, getPageText, loading, onAutoTranslateConsumed, run]);

    const exportNote = () => buildReadingMarkdown(file?.name || (inputMode === 'text' ? 'Pasted Text' : `${images.length} Image OCR`),
        file ? savedDocument?.type.toUpperCase() || 'FILE' : inputMode === 'image' ? 'OCR' : 'Text', entries, savedDocument?.id);
    const exportMarkdown = async (download: boolean) => {
        setExportOpen(false);
        try {
            const note = exportNote();
            if (download) {
                const url = URL.createObjectURL(new Blob([note.markdown], { type: 'text/markdown;charset=utf-8' }));
                const anchor = document.createElement('a'); anchor.href = url; anchor.download = note.fileName; anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } else await navigator.clipboard.writeText(note.markdown);
            setFeedback({ revision, message: download ? 'Markdown downloaded.' : 'Markdown copied.' });
            setTimeout(() => setFeedback(null), 2500);
        } catch { setFailure({ revision, message: 'Could not export Markdown. Please try again.' }); }
    };
    const jumpToNew = () => {
        if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
        following.current = true; setNewOutput({ session, value: false });
    };
    return <div className="flex flex-col h-full w-full min-w-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-blue-50/60">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Sparkles className="w-4 h-4 text-blue-500" />{t("AI Translation")}</div>
            <div className="flex items-center gap-1">
                {!file && entries.length > 0 && <button aria-label={t("Clear temporary translations")} title={t("Clear temporary translations")} className="p-2 text-slate-400 hover:text-red-500" onClick={() => { setTemporary({ session, entries: [] }); setDraft(null); }}><Trash2 className="w-4 h-4" /></button>}
                <div className="relative" ref={exportArea}>
                    <button ref={exportButton} disabled={!entries.length} aria-haspopup="menu" aria-expanded={exportOpen}
                        className="flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50" onClick={() => setExportOpen(value => !value)}
                        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setExportOpen(true); requestAnimationFrame(() => exportArea.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()); } }}>{t("Export")}<ChevronDown className="w-3 h-3" /></button>
                    {exportOpen && <div role="menu" aria-label={t("Export completed translations")} className="absolute right-0 top-full mt-1 z-30 w-48 p-1 bg-white rounded-lg border border-slate-200 shadow-lg"
                        onKeyDown={event => {
                            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                            event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
                            const index = items.indexOf(document.activeElement as HTMLButtonElement);
                            items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
                        }}>
                        {file && <p className="px-2 py-1 text-[11px] text-slate-400">{t("Completed translations in this file")}</p>}
                        <button role="menuitem" onClick={() => void exportMarkdown(false)} className="w-full flex gap-2 items-center rounded px-2 py-2 text-xs text-slate-600 hover:bg-slate-50 focus:bg-slate-50"><Copy className="w-3.5 h-3.5" />{t("Copy Markdown")}</button>
                        <button role="menuitem" onClick={() => void exportMarkdown(true)} className="w-full flex gap-2 items-center rounded px-2 py-2 text-xs text-slate-600 hover:bg-slate-50 focus:bg-slate-50"><Download className="w-3.5 h-3.5" />{t("Download .md")}</button>
                    </div>}
                </div>
                <button data-close-translation onClick={onClose} aria-label={t("Close sidebar")} title={t("Close sidebar")} className="p-2 text-slate-400 hover:text-slate-600"><PanelRightClose className="w-4 h-4" /></button>
            </div>
        </div>
        {file && <div className="px-4 py-2 text-xs text-slate-400" role="status">{status === 'loading' ? t("Saving / restoring…") : status === 'saved' ? t("Saved on this device") : status === 'translations-only' ? t("Translations saved · original file not retained") : t("Not saved on this device")}{storageError && <p className="mt-1 text-amber-700">{t(storageError)}</p>}</div>}
        <div ref={scroll} className="flex-1 min-h-0 overflow-auto p-4 space-y-4 relative" onScroll={event => {
            const element = event.currentTarget;
            following.current = element.scrollHeight - element.clientHeight - element.scrollTop < 80;
            if (following.current) setNewOutput({ session, value: false });
            if (file && ready && restored.current === session) useReadingStore.getState().setTranslationScroll(element.scrollTop);
        }}>
            {history.map(entry => <div key={entry.id} id={`translation-${entry.id}`} tabIndex={entry.locator ? 0 : undefined} className="space-y-2 outline-offset-4 focus-visible:outline-blue-400"
                onMouseEnter={() => bridge?.highlight(entry.locator || null)} onMouseLeave={() => bridge?.highlight(null)}
                onFocus={() => bridge?.highlight(entry.locator || null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) bridge?.highlight(null); }}>
                <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 w-full min-w-0 text-left" onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })}>
                    {expanded.has(entry.id) ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{entry.locator && `${locationLabel(entry.locator)} · `}{entry.originalText.slice(0, 70)}</span>
                </button>
                {expanded.has(entry.id) && <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">{entry.originalText}</div>}
                <div className="p-4 rounded-lg bg-blue-50/60 border border-blue-100 text-slate-800">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{entry.translation}</p>
                    <div className="flex justify-end gap-2 mt-2 text-xs text-slate-400">
                        <button aria-label={t("Copy translation")} title={t("Copy translation")} className="p-1.5 hover:text-blue-600 focus-visible:text-blue-600" onClick={async () => {
                            try { await navigator.clipboard.writeText(entry.translation); setCopied(entry.id); setTimeout(() => setCopied(''), 2000); }
                            catch { setFailure({ revision, message: 'Could not copy the translation.' }); }
                        }}>{copied === entry.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}</button>
                        {entry.locator && <button className="flex gap-1 items-center hover:text-blue-600" onClick={() => {
                            void useReadingStore.getState().locate(entry.locator!);
                            if (window.innerWidth < 1024) onClose();
                        }}><MapPin className="w-3 h-3" />{t("Locate source")}</button>}
                    </div>
                </div>
            </div>)}
            {activeDraft && <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap break-words">
                {activeDraft.translation || <span className="flex gap-2 items-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin" />{t("Translating…")}</span>}
                {!activeDraft.loading && <p className="mt-2 text-xs text-amber-700">{t("Incomplete · not saved or exported")}</p>}
            </div>}
            {error && <div role="alert" className="flex gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3"><X className="w-4 h-4 shrink-0" />{t(error)}</div>}
            {info && <p role="status" className="text-xs text-emerald-700">{t(info)}</p>}
            {!entries.length && !activeDraft && !error && <p className="py-12 text-center text-sm text-slate-400">{t("Select text or translate the current page.")}</p>}
        </div>
        {newOutput.session === session && newOutput.value && <button onClick={jumpToNew} className="mx-auto mb-2 px-3 py-1.5 text-xs rounded-full border border-blue-100 bg-white text-blue-600 shadow-sm flex items-center gap-1">{t("New translation")}<ArrowDown className="w-3 h-3" /></button>}
        <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <select aria-label={t("Translation style")} className="min-w-0 max-w-[60%] text-xs py-1 px-2 border border-slate-200 rounded bg-white text-slate-600"
                    value={settings.promptStyle === 'Custom' && settings.selectedCustomPromptId ? `custom:${settings.selectedCustomPromptId}` : settings.promptStyle}
                    onChange={event => { const value = event.target.value; if (value.startsWith('custom:')) { settings.setPromptStyle('Custom'); settings.selectCustomPrompt(value.slice(7)); } else settings.setPromptStyle(value as PromptStyle); }}>
                    <option value="General">{t("General")}</option><option value="Academic">{t("Academic")}</option><option value="Create">{t("Creative")}</option><option value="Philosophical">{t("Philosophical")}</option>
                    {settings.customPrompts.map(prompt => <option key={prompt.id} value={`custom:${prompt.id}`}>{prompt.name}</option>)}
                </select><span className="text-xs text-slate-400 truncate">{settings.model}</span>
            </div>
            {loading ? <button onClick={() => request.current?.controller.abort()} className="w-full flex justify-center items-center gap-2 rounded-lg py-2 text-sm text-rose-600 bg-rose-50 border border-rose-100"><Square className="w-3.5 h-3.5" />{t("Stop")}</button>
                : <div className="flex gap-2">
                    <button disabled={!hasSelection || !!(file && !ready)} onClick={() => void run('selection')} className="flex-1 flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 bg-white disabled:opacity-40"><Play className="w-3.5 h-3.5" />{t("Selection")}</button>
                    <button disabled={file ? !ready || !bridge : !getPageText} onClick={() => void run('page')} className="flex-1 flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg bg-blue-600 text-sm text-white disabled:opacity-40"><Play className="w-3.5 h-3.5" />{file && savedDocument?.type === 'epub' ? t("Current view") : t("Page")}</button>
                </div>}
        </div>
    </div>;
}
