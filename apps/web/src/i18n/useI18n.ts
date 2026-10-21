import { useCallback } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import { localizedLocation, translate } from './messages';
import type { InterfaceLanguage } from './languages';
import type { SourceLocator } from '../reading/types';

export function useI18n(previewLanguage?: InterfaceLanguage) {
    const savedLanguage = useSettingsStore(state => state.interfaceLanguage);
    const language = previewLanguage ?? savedLanguage;
    const t = useCallback((message: string, values?: Record<string, string | number>) => translate(language, message, values), [language]);
    const locationLabel = useCallback((locator?: SourceLocator | null) => localizedLocation(language, locator), [language]);
    return { language, t, locationLabel };
}
