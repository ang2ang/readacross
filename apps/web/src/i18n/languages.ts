// Both selectors use the same languages and native names. Target values retain
// their existing format so saved settings and translation requests still match.
export const LANGUAGES = [
    { code: 'zh-CN', name: '简体中文', target: '简体中文' },
    { code: 'en', name: 'English', target: 'English' },
    { code: 'ja', name: '日本語', target: '日本語' },
    { code: 'fr', name: 'Français', target: 'Français' },
    { code: 'de', name: 'Deutsch', target: 'Deutsch' },
    { code: 'pt', name: 'Português', target: 'Português' },
    { code: 'zh-TW', name: '繁體中文', target: '繁體中文' },
] as const;

export type InterfaceLanguage = typeof LANGUAGES[number]['code'];

export function isInterfaceLanguage(value: unknown): value is InterfaceLanguage {
    return LANGUAGES.some(language => language.code === value);
}

export const defaultTargetLanguage = (language: InterfaceLanguage): string =>
    language === 'zh-CN' || language === 'zh-TW' ? 'English' : '简体中文';
