import { useI18n } from '../../i18n/useI18n';
import React from 'react';
import { Upload, FileText, Image } from 'lucide-react';

type InputMode = 'file' | 'text' | 'image';

interface InputModeSelectorProps {
    activeMode: InputMode;
    onModeChange: (mode: InputMode) => void;
}

export const InputModeSelector: React.FC<InputModeSelectorProps> = ({ activeMode, onModeChange }) => {
    const { t } = useI18n();
    const tabs: { mode: InputMode; label: string; compactLabel: string; icon: React.ReactNode }[] = [
        { mode: 'text', label: 'Paste Text', compactLabel: 'Text', icon: <FileText className="w-4 h-4 shrink-0" /> },
        { mode: 'file', label: 'Upload File', compactLabel: 'File', icon: <Upload className="w-4 h-4 shrink-0" /> },
        { mode: 'image', label: 'Paste Image', compactLabel: 'Image', icon: <Image className="w-4 h-4 shrink-0" /> },
    ];

    return (
        <div className="flex justify-center mb-6">
            <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
                {tabs.map(({ mode, label, compactLabel, icon }) => (
                    <button
                        key={mode}
                        aria-label={t(label)}
                        onClick={() => onModeChange(mode)}
                        className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${activeMode === mode
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                    >
                        {icon}
                        <span className="hidden sm:inline">{t(label)}</span>
                        <span className="sm:hidden">{t(compactLabel)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};
