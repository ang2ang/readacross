import type { DocumentRecord, SourceLocator, TranslationRecord, TranslationSettings } from './types';

export const STORAGE_BUDGET = 100 * 1024 * 1024;
export const FILE_LIMIT = 5;
export const DAY = 24 * 60 * 60 * 1000;
export const FILE_TTL = 10 * DAY;

export const normalizeText = (text: string) => text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
export const quoteText = (text: string) => text.replace(/\s+/g, ' ').trim();
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export async function digest(value: string | ArrayBuffer): Promise<string> {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    const result = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function locatorIdentity(locator: SourceLocator | undefined): unknown {
    if (!locator) return null;
    if (locator.type === 'epub') return [locator.type, locator.cfi, locator.endCfi || ''];
    return [locator.type, locator.page, locator.quote ? locator.rects?.map(rect =>
        [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 1000) / 1000)) : null];
}

export function translationKey(documentId: string, scope: TranslationRecord['scope'], text: string,
    locator: SourceLocator | undefined, settings: TranslationSettings) {
    return digest(JSON.stringify([1, documentId, scope, normalizeText(text), locatorIdentity(locator), settings]));
}

export const documentBytes = (record: DocumentRecord) => jsonBytes(record) + record.fileBytes + record.translationBytes;

// Return a proposal first: callers must not evict anything if the write still cannot fit.
export function retentionPlan(records: DocumentRecord[], protectedId: string | null, now: number,
    budget = STORAGE_BUDGET, checkExpiry = true) {
    const copies = records.map(record => ({ ...record }));
    const removed = new Set<string>();
    const candidates = copies.filter(record => record.fileBytes && record.id !== protectedId)
        .sort((a, b) => a.lastOpenedAt - b.lastOpenedAt || a.id.localeCompare(b.id));
    const remove = (record: DocumentRecord) => { record.fileBytes = 0; removed.add(record.id); };
    if (checkExpiry) candidates.filter(record => now - record.lastOpenedAt > FILE_TTL).forEach(remove);
    for (const record of candidates) {
        if (copies.filter(item => item.fileBytes > 0).length <= FILE_LIMIT) break;
        if (record.fileBytes) remove(record);
    }
    for (const record of candidates) {
        if (copies.reduce((total, item) => total + documentBytes(item), 0) <= budget) break;
        if (record.fileBytes) remove(record);
    }
    const bytes = copies.reduce((total, record) => total + documentBytes(record), 0);
    return { records: copies, removed: [...removed], bytes, fits: bytes <= budget };
}

export function compareRecords(a: TranslationRecord, b: TranslationRecord) {
    const left = a.locator;
    const right = b.locator;
    if (left?.type === 'pdf' && right?.type === 'pdf' && left.page !== right.page) return left.page - right.page;
    if (left?.type === 'epub' && right?.type === 'epub') {
        const parts = (cfi: string) => (cfi.replace(/\[[^\]]*\]/g, '').match(/\d+/g) || []).map(Number);
        const l = parts(left.cfi); const r = parts(right.cfi);
        for (let index = 0; index < Math.min(l.length, r.length); index++) {
            if (l[index] !== r[index]) return l[index] - r[index];
        }
    }
    return a.createdAt.localeCompare(b.createdAt);
}

export function clampPanelWidth(width: number, available: number) {
    return Math.max(320, Math.min(width, 640, Math.max(320, available - 480)));
}
