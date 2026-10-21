export interface RelativeRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type SourceLocator =
    | { type: 'pdf'; page: number; x?: number; y?: number; anchor?: 'center'; quote?: string; rects?: RelativeRect[] }
    | { type: 'epub'; cfi: string; endCfi?: string; quote?: string; section?: number };

export interface SourceSnapshot {
    text: string;
    locator: SourceLocator;
}

export interface ReaderBridge {
    readSource: () => Promise<SourceSnapshot>;
    getLocation: () => SourceLocator | null;
    navigate: (locator: SourceLocator) => Promise<'range' | void>;
    highlight: (locator: SourceLocator | null) => void;
}

export interface TranslationSettings {
    provider: string;
    model: string;
    targetLanguage: string;
    promptStyle: string;
    temperature: number;
    systemPrompt: string;
    endpointHash: string;
}

export interface TranslationRecord {
    id: string;
    documentId?: string;
    originalText: string;
    translation: string;
    createdAt: string;
    scope: 'selection' | 'page';
    locator?: SourceLocator;
    settings: TranslationSettings;
}

export interface DocumentRecord {
    id: string;
    name: string;
    type: 'pdf' | 'epub';
    lastOpenedAt: number;
    position: SourceLocator | null;
    fontSize: number;
    pdfFitWidth?: boolean;
    translationScroll: number;
    fileBytes: number;
    translationBytes: number;
    translationCount: number;
    storageVersion?: string;
}

export type SaveStatus = 'loading' | 'saved' | 'translations-only' | 'unsaved';

export function locationLabel(locator?: SourceLocator | null): string {
    if (!locator) return '';
    return locator.type === 'pdf' ? `Page ${locator.page}` : `EPUB${locator.section === undefined ? '' : ` · Section ${locator.section + 1}`}`;
}
