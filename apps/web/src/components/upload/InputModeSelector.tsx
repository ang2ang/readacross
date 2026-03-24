import React from 'react';
import { Upload, FileText, Image } from 'lucide-react';

type InputMode = 'file' | 'text' | 'image';

interface InputModeSelectorProps {
    activeMode: InputMode;
    onModeChange: (mode: InputMode) => void;
}

export const InputModeSelector: React.FC<InputModeSelectorProps> = ({ activeMode, onModeChange }) => {
    const tabs: { mode: InputMode; label: string; icon: React.ReactNode }[] = [
        { mode: 'text', label: 'Paste Text', icon: <FileText className="w-4 h-4" /> },
        { mode: 'file', label: 'Upload File', icon: <Upload className="w-4 h-4" /> },
        { mode: 'image', label: 'Paste Image', icon: <Image className="w-4 h-4" /> },
    ];

    return (
        <div className="flex justify-center mb-6">
            <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
                {tabs.map(({ mode, label, icon }) => (
                    <button
                        key={mode}
                        onClick={() => onModeChange(mode)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeMode === mode
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                    >
                        {icon}
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
};
