import { Languages } from 'lucide-react';
import { LANGUAGES } from '../../i18n/languages';
import type { InterfaceLanguage } from '../../i18n/languages';
import { useI18n } from '../../i18n/useI18n';

export function LanguageSelector({ language, onChange, compact = false }: {
    language: InterfaceLanguage;
    onChange: (language: InterfaceLanguage) => void;
    compact?: boolean;
}) {
    const { t } = useI18n();
    return <label className={`flex items-center gap-2 text-sm font-medium text-slate-700 ${compact ? 'rounded-lg border border-slate-200 bg-white/80 px-2 focus-within:border-slate-500' : ''}`}>
        <Languages aria-hidden="true" className="w-4 h-4 shrink-0 text-slate-500" />
        <span className={compact ? 'sr-only' : ''}>{t('Interface language')}</span>
        <select value={language} onChange={event => onChange(event.target.value as InterfaceLanguage)}
            className={`min-h-10 rounded-lg bg-white text-sm text-slate-700 focus:outline-none focus:ring-0 ${compact ? 'px-1' : 'ml-auto border border-slate-200 px-3 focus:border-slate-500'}`}>
            {LANGUAGES.map(option => <option key={option.code} value={option.code} lang={option.code}>{option.name}</option>)}
        </select>
    </label>;
}
