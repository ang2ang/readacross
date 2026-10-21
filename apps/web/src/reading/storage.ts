import type { DocumentRecord, TranslationRecord } from './types';
import { DAY, STORAGE_BUDGET, documentBytes, jsonBytes, retentionPlan } from './policy';

const DATABASE = 'readacross-reading';
const capacityError = (error: unknown) => error instanceof Error && (error.name === 'QuotaExceededError' || error.message.includes('storage is full'));
let database: Promise<IDBDatabase> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function request<T>(operation: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        operation.onsuccess = () => resolve(operation.result);
        operation.onerror = () => reject(operation.error || new Error('Local storage failed.'));
    });
}

function openDatabase(): Promise<IDBDatabase> {
    if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
        let blocked = false;
        const operation = indexedDB.open(DATABASE, 1);
        operation.onupgradeneeded = () => {
            const db = operation.result;
            db.createObjectStore('documents', { keyPath: 'id' });
            db.createObjectStore('files');
            const translations = db.createObjectStore('translations', { keyPath: 'id' });
            translations.createIndex('documentId', 'documentId');
            db.createObjectStore('meta');
        };
        operation.onsuccess = () => {
            const db = operation.result;
            if (blocked) { db.close(); return; }
            db.onversionchange = () => { db.close(); database = undefined; };
            resolve(db);
        };
        operation.onerror = () => { database = undefined; reject(operation.error); };
        operation.onblocked = () => { blocked = true; reject(new Error('Close other ReadAcross tabs to update local storage.')); };
    }).catch(error => { database = undefined; throw error; });
    return database;
}

async function storageVersion(tx: IDBTransaction, id: string) {
    const meta = tx.objectStore('meta');
    const [cleared, removed] = await Promise.all([
        request<string | undefined>(meta.get('cleared')),
        request<string | undefined>(meta.get(`removed:${id}`)),
    ]);
    return `${cleared || ''}/${removed || ''}`;
}

async function read<T>(work: (tx: IDBTransaction) => Promise<T>) {
    // A restore must include completed writes queued before it in this tab.
    await queue.catch(() => undefined);
    return transaction('readonly', work);
}

async function transaction<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>) {
    const db = await openDatabase();
    const tx = db.transaction(['documents', 'files', 'translations', 'meta'], mode);
    const completed = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('Local storage write failed.'));
    });
    try {
        const result = await work(tx);
        await completed;
        return result;
    } catch (error) {
        try { tx.abort(); } catch { /* The transaction may already have finished. */ }
        await completed.catch(() => undefined);
        throw error;
    }
}

// Serialise writes within this tab; readwrite transactions also arbitrate other tabs.
function write<T>(work: (tx: IDBTransaction, free: number) => Promise<T>) {
    const operation = queue.catch(() => undefined).then(async () => {
        let free = Infinity;
        try {
            const estimate = await navigator.storage?.estimate();
            if (estimate?.quota !== undefined && estimate.usage !== undefined) free = Math.max(0, estimate.quota - estimate.usage);
        } catch { /* Quota checks are advisory; the committed write remains authoritative. */ }
        return transaction('readwrite', tx => work(tx, free));
    });
    queue = operation;
    return operation;
}

async function applyRetention(tx: IDBTransaction, records: DocumentRecord[], protectedId: string | null,
    previousBytes: number, free: number) {
    const now = Date.now();
    const lastSweep = await request<number | undefined>(tx.objectStore('meta').get('lastSweep'));
    const checkExpiry = !lastSweep || now - lastSweep >= DAY;
    const [keys, values] = await Promise.all([
        request<IDBValidKey[]>(tx.objectStore('meta').getAllKeys()),
        request<unknown[]>(tx.objectStore('meta').getAll()),
    ]);
    const metadata = keys.map((key, index) => [key, values[index]]);
    const previousMetadataBytes = jsonBytes(metadata);
    if (checkExpiry) {
        const sweep = metadata.find(item => item[0] === 'lastSweep');
        if (sweep) sweep[1] = now; else metadata.push(['lastSweep', now]);
    }
    const metadataBytes = jsonBytes(metadata);
    const budget = Math.min(STORAGE_BUDGET, previousBytes + previousMetadataBytes + free) - metadataBytes;
    const result = retentionPlan(records, protectedId, now, budget, checkExpiry);
    if (!result.fits) throw new Error('Local reading storage is full. Export your translations or clear local records.');
    for (const id of result.removed) tx.objectStore('files').delete(id);
    for (const record of result.records) tx.objectStore('documents').put(record);
    if (checkExpiry) tx.objectStore('meta').put(now, 'lastSweep');
    return { ...result, bytes: result.bytes + metadataBytes };
}

export const readingStorage = {
    async recent() {
        return read(async tx => {
            const records = await request<DocumentRecord[]>(tx.objectStore('documents').getAll());
            return records.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 5);
        });
    },
    async load(id: string) {
        return read(async tx => {
            const document = await request<DocumentRecord | undefined>(tx.objectStore('documents').get(id));
            const translations = await request<TranslationRecord[]>(tx.objectStore('translations').index('documentId').getAll(id));
            return { document, translations, version: await storageVersion(tx, id) };
        });
    },
    async file(id: string) {
        return read(tx => request<Blob | undefined>(tx.objectStore('files').get(id)));
    },
    open(record: DocumentRecord, file: File) {
        const attempt = (translationOnly: boolean) => write(async (tx, free) => {
            const version = await storageVersion(tx, record.id);
            if (record.storageVersion !== undefined && record.storageVersion !== version) throw new Error('Local record was deleted. Reselect the file to save it again.');
            const documents = tx.objectStore('documents');
            const existing = await request<DocumentRecord[]>(documents.getAll());
            const previousBytes = existing.reduce((total, item) => total + documentBytes(item), 0);
            const old = existing.find(item => item.id === record.id);
            const current = { ...(old || record), name: file.name, lastOpenedAt: record.lastOpenedAt, storageVersion: version };
            const records = existing.filter(item => item.id !== current.id);
            const nonFileBytes = records.reduce((total, item) => total + documentBytes({ ...item, fileBytes: 0 }), 0)
                + documentBytes({ ...current, fileBytes: 0 });
            const budget = Math.min(STORAGE_BUDGET, previousBytes + free);
            // An impossible incoming file must not cause pointless eviction of older files.
            const retainFile = !translationOnly && file.size + nonFileBytes <= budget;
            current.fileBytes = retainFile ? file.size : 0;
            records.push(current);
            const result = await applyRetention(tx, records, current.id, previousBytes, free);
            if (retainFile) tx.objectStore('files').put(file, current.id);
            else tx.objectStore('files').delete(current.id);
            return result.records.find(item => item.id === current.id)!;
        });
        return attempt(false).catch(error => { if (capacityError(error)) return attempt(true); throw error; });
    },
    saveTranslation(fallback: DocumentRecord, record: TranslationRecord) {
        const attempt = (translationOnly: boolean) => write(async (tx, free) => {
            const version = await storageVersion(tx, fallback.id);
            if ((fallback.storageVersion || '/') !== version) throw new Error('Local record was deleted. Reselect the file to save it again.');
            const records = await request<DocumentRecord[]>(tx.objectStore('documents').getAll());
            const previousBytes = records.reduce((total, item) => total + documentBytes(item), 0);
            const existing = await request<TranslationRecord | undefined>(tx.objectStore('translations').get(record.id));
            const document = records.find(item => item.id === fallback.id) || { ...fallback, fileBytes: 0, translationBytes: 0, translationCount: 0 };
            Object.assign(document, { position: fallback.position, fontSize: fallback.fontSize, pdfFitWidth: fallback.pdfFitWidth,
                translationScroll: fallback.translationScroll, storageVersion: version });
            if (translationOnly) document.fileBytes = 0;
            document.translationBytes += jsonBytes(record) - (existing ? jsonBytes(existing) : 0);
            document.translationCount += existing ? 0 : 1;
            const result = await applyRetention(tx, [...records.filter(item => item.id !== document.id), document], document.id, previousBytes, free);
            if (translationOnly) tx.objectStore('files').delete(document.id);
            tx.objectStore('translations').put(record);
            return result.records.find(item => item.id === document.id)!;
        });
        return attempt(false).catch(error => { if (capacityError(error)) return attempt(true); throw error; });
    },
    update(id: string, patch: Partial<Pick<DocumentRecord, 'position' | 'fontSize' | 'pdfFitWidth' | 'translationScroll'>>, version?: string) {
        return write(async (tx, free) => {
            if (version !== undefined && version !== await storageVersion(tx, id)) return;
            const records = await request<DocumentRecord[]>(tx.objectStore('documents').getAll());
            const previousBytes = records.reduce((total, item) => total + documentBytes(item), 0);
            const document = records.find(item => item.id === id);
            if (document) {
                Object.assign(document, patch);
                await applyRetention(tx, records, id, previousBytes, free);
            }
        });
    },
    maintain(protectedId: string | null) {
        return write(async (tx, free) => {
            const records = await request<DocumentRecord[]>(tx.objectStore('documents').getAll());
            const bytes = records.reduce((total, item) => total + documentBytes(item), 0);
            return (await applyRetention(tx, records, protectedId, bytes, free)).bytes;
        });
    },
    remove(id?: string) {
        return write(async tx => {
            if (!id) {
                for (const name of ['documents', 'files', 'translations', 'meta']) tx.objectStore(name).clear();
                const version = crypto.randomUUID();
                tx.objectStore('meta').put(version, 'cleared');
                return `${version}/`;
            } else {
                tx.objectStore('meta').put(crypto.randomUUID(), `removed:${id}`);
                tx.objectStore('documents').delete(id);
                tx.objectStore('files').delete(id);
                const keys = await request<IDBValidKey[]>(tx.objectStore('translations').index('documentId').getAllKeys(id));
                for (const key of keys) tx.objectStore('translations').delete(key);
                return storageVersion(tx, id);
            }
        });
    },
};
