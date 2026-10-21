import { create } from 'zustand';
import { digest } from '../reading/policy';
import { readingStorage } from '../reading/storage';
import type { DocumentRecord, ReaderBridge, SaveStatus, SourceLocator, SourceSnapshot, TranslationRecord } from '../reading/types';

interface ReadingState {
    session: number;
    revision: number;
    document: DocumentRecord | null;
    entries: TranslationRecord[];
    unsavedEntries: string[];
    ready: boolean;
    status: SaveStatus;
    error: string | null;
    recent: DocumentRecord[];
    usage: number;
    fontSize: number;
    pdfFitWidth: boolean;
    pdfFitPercent: number;
    bridge: ReaderBridge | null;
    selection: SourceSnapshot | null;
    returnLocation: SourceLocator | null;
    locationNotice: string | null;
    open: (file: File) => Promise<void>;
    close: () => void;
    refresh: () => Promise<void>;
    setBridge: (bridge: ReaderBridge | null) => void;
    setSelection: (selection: SourceSnapshot | null) => void;
    reportPosition: (position: SourceLocator) => void;
    userNavigated: () => void;
    setFontSize: (size: number) => void;
    fitPdfWidth: () => void;
    setPdfFitPercent: (percent: number) => void;
    setTranslationScroll: (top: number) => void;
    addEntry: (entry: TranslationRecord, revision: number) => Promise<void>;
    locate: (locator: SourceLocator) => Promise<void>;
    goBack: () => Promise<void>;
    remove: (id?: string) => Promise<void>;
}

let refreshVersion = 0;
let updateTimer: ReturnType<typeof setTimeout> | undefined;
type ReadingPatch = Partial<Pick<DocumentRecord, 'position' | 'fontSize' | 'pdfFitWidth' | 'translationScroll'>>;
let pendingUpdate: { id: string; version?: string; patch: ReadingPatch } | null = null;
const message = (error: unknown) => error instanceof Error ? error.message : 'Local reading storage is unavailable.';
const statusFor = (record: DocumentRecord): SaveStatus => record.fileBytes ? 'saved' : record.translationCount ? 'translations-only' : 'unsaved';

function flushUpdate() {
    clearTimeout(updateTimer);
    const update = pendingUpdate;
    pendingUpdate = null;
    if (update) void readingStorage.update(update.id, update.patch, update.version).catch(error => {
        if (useReadingStore.getState().document?.id === update.id) useReadingStore.setState({ status: 'unsaved', error: message(error) });
    });
}

function persistPatch(patch: ReadingPatch) {
    const record = useReadingStore.getState().document;
    if (!record || !useReadingStore.getState().ready) return;
    if (pendingUpdate && pendingUpdate.id !== record.id) flushUpdate();
    pendingUpdate = { id: record.id, version: record.storageVersion, patch: { ...pendingUpdate?.patch, ...patch } };
    useReadingStore.setState({ document: { ...record, ...patch } });
    clearTimeout(updateTimer);
    updateTimer = setTimeout(flushUpdate, 400);
}

export const useReadingStore = create<ReadingState>((set, get) => ({
    session: 0, revision: 0, document: null, entries: [], unsavedEntries: [], ready: false, status: 'unsaved', error: null,
    recent: [], usage: 0, fontSize: 100, pdfFitWidth: true, pdfFitPercent: 100, bridge: null, selection: null, returnLocation: null, locationNotice: null,
    open: async file => {
        flushUpdate();
        const revision = get().revision + 1;
        const session = get().session + 1;
        set({ session, revision, document: null, entries: [], unsavedEntries: [], ready: false,
            status: 'loading', error: null, fontSize: 100, pdfFitWidth: true, pdfFitPercent: 100, bridge: null, selection: null, returnLocation: null, locationNotice: null });
        let fallback: DocumentRecord | undefined;
        try {
            const id = await digest(await file.arrayBuffer());
            if (get().session !== session) return;
            fallback = { id, name: file.name, type: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub',
                lastOpenedAt: Date.now(), position: null, fontSize: 100, translationScroll: 0,
                fileBytes: 0, translationBytes: 0, translationCount: 0 };
            const loaded = await readingStorage.load(id);
            if (get().session !== session) return;
            fallback.storageVersion = loaded.version;
            // Loading existing translations does not depend on the configured model or key.
            const restored = loaded.document || fallback;
            set({ document: restored, entries: loaded.translations, ready: true,
                fontSize: restored.fontSize, pdfFitWidth: restored.pdfFitWidth ?? restored.fontSize === 100 });
            // Clearing during identity lookup must not re-save the original afterwards.
            if (get().revision !== revision) { set({ status: statusFor(restored) }); return; }
            const document = await readingStorage.open(fallback, file);
            if (get().revision !== revision) return;
            const current = get().document!;
            set({ document: { ...document, position: current.position, fontSize: get().fontSize, pdfFitWidth: get().pdfFitWidth,
                translationScroll: current.translationScroll }, status: get().unsavedEntries.length ? get().status : statusFor(document),
                error: get().unsavedEntries.length ? get().error : document.fileBytes ? null : 'Original file not retained. Reselect it next time; completed translations can still be saved.' });
            await get().refresh();
        } catch (error) {
            if (get().session !== session) return;
            if (get().revision !== revision && get().ready) return;
            set({ document: get().document || fallback || null, ready: true, status: 'unsaved', error: message(error) });
        }
    },
    close: () => {
        flushUpdate();
        set({ session: get().session + 1, revision: get().revision + 1, document: null, entries: [], unsavedEntries: [], ready: false,
            status: 'unsaved', error: null, fontSize: 100, pdfFitWidth: true, pdfFitPercent: 100, bridge: null, selection: null, returnLocation: null, locationNotice: null });
    },
    refresh: async () => {
        const version = ++refreshVersion;
        try {
            const usage = await readingStorage.maintain(get().document?.id || null);
            const recent = await readingStorage.recent();
            if (version === refreshVersion) set({ recent, usage });
        } catch (error) { if (version === refreshVersion) set({ error: message(error) }); }
    },
    setBridge: bridge => set({ bridge }),
    setSelection: selection => set({ selection }),
    reportPosition: position => {
        if (!get().returnLocation) persistPatch({ position });
    },
    userNavigated: () => set({ returnLocation: null, locationNotice: null }),
    setFontSize: fontSize => {
        set({ fontSize, pdfFitWidth: false });
        persistPatch({ fontSize, ...(get().document?.type === 'pdf' ? { pdfFitWidth: false } : {}) });
    },
    fitPdfWidth: () => { set({ pdfFitWidth: true }); persistPatch({ pdfFitWidth: true }); },
    setPdfFitPercent: pdfFitPercent => { if (get().pdfFitPercent !== pdfFitPercent) set({ pdfFitPercent }); },
    setTranslationScroll: translationScroll => persistPatch({ translationScroll }),
    addEntry: async (entry, revision) => {
        if (get().revision !== revision) return;
        set({ entries: [...get().entries.filter(item => item.id !== entry.id), entry],
            unsavedEntries: [...get().unsavedEntries.filter(id => id !== entry.id), entry.id], status: 'loading' });
        const document = get().document;
        if (!document) { set({ status: 'unsaved' }); return; }
        try {
            const saved = await readingStorage.saveTranslation(document, entry);
            if (get().revision !== revision) return;
            // Position may have changed while IndexedDB was committing.
            const current = get().document!;
            const unsavedEntries = get().unsavedEntries.filter(id => id !== entry.id);
            set({ document: { ...saved, position: current.position, fontSize: current.fontSize, pdfFitWidth: current.pdfFitWidth,
                translationScroll: current.translationScroll }, unsavedEntries, status: unsavedEntries.length ? 'unsaved' : statusFor(saved),
                error: unsavedEntries.length ? 'Some translations are not saved. Export them or free local storage.'
                    : saved.fileBytes ? null : 'Translations saved; reselect the original file next time.' });
            await get().refresh();
        } catch (error) {
            if (get().revision === revision) set({ status: 'unsaved', error: message(error) });
        }
    },
    locate: async locator => {
        const { bridge, returnLocation, revision } = get();
        if (!bridge) return;
        if (!returnLocation) {
            const position = bridge.getLocation();
            if (position) { persistPatch({ position }); set({ returnLocation: position }); }
        }
        set({ locationNotice: null });
        try {
            const result = await bridge.navigate(locator);
            if (get().revision === revision && result === 'range') set({ locationNotice: 'Exact selection unavailable · showing its page or section.' });
        }
        catch { if (get().revision === revision) set({ error: 'Exact source location is unavailable. Try the saved page or section.' }); }
    },
    goBack: async () => {
        const { bridge, returnLocation, revision } = get();
        if (!bridge || !returnLocation) return;
        try {
            await bridge.navigate(returnLocation);
            if (get().revision !== revision) return;
            set({ returnLocation: null, locationNotice: null });
            persistPatch({ position: returnLocation });
        } catch { if (get().revision === revision) set({ error: 'Could not return to the previous reading position.' }); }
    },
    remove: async id => {
        const active = !id || get().document?.id === id;
        const previousStatus = get().status;
        const revision = get().revision + (active ? 1 : 0);
        if (active) {
            flushUpdate();
            set({ revision });
        }
        try {
            const storageVersion = await readingStorage.remove(id);
            if (active && get().revision === revision) {
                set({ entries: [], unsavedEntries: [], status: 'unsaved', returnLocation: null, locationNotice: null,
                    document: get().document ? { ...get().document!, storageVersion, fileBytes: 0, translationBytes: 0, translationCount: 0 } : null,
                    error: 'Local records cleared.' });
            }
        } catch (error) {
            if (active && get().revision === revision) set({ status: previousStatus === 'loading' ? 'unsaved' : previousStatus });
            throw error;
        }
        await get().refresh();
    },
}));

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushUpdate);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushUpdate(); });
}
