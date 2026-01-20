import { useState, useRef } from 'react';
import { Settings, Minus, Plus, Type } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import { PDFViewer } from './PDFViewer';
import { EpubViewer } from './EpubViewer';
import { SettingsModal } from '../settings/SettingsModal';
import { TranslationPanel } from '../translation/TranslationPanel';

export const ReaderLayout: React.FC = () => {
    const { file, fileType, setFile } = useFileStore();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const [isTranslationOpen, setIsTranslationOpen] = useState(false);
    const [fontSize, setFontSize] = useState(100); // percentage: 100 = default
    const fileInputRef = useRef<HTMLInputElement>(null);


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleTranslateSelection = () => {
        let text = window.getSelection()?.toString();
        if (!text || text.trim().length === 0) {
            // Try getting from store (Epub)
            text = useFileStore.getState().selection;
        }

        // Always open the translation panel, even if no text is selected
        // User can select text and click translate within the panel
        setSelectedText(text && text.trim().length > 0 ? text : '');
        setIsTranslationOpen(true);
    };

    const handleFontSizeChange = (delta: number) => {
        setFontSize(prev => Math.min(150, Math.max(50, prev + delta)));
    };

    return (
        <div className="h-screen flex flex-col">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.epub"
                className="hidden"
            />

            {/* Header */}
            <header className="h-14 border-b border-slate-200 bg-white flex items-center px-4 justify-between shrink-0 z-50 shadow-sm">
                <div className="font-semibold text-slate-700 truncate max-w-sm flex items-center gap-2">
                    <span className="bg-slate-100 text-slate-500 text-xs px-1.5 py-0.5 rounded uppercase tracking-wider">{fileType}</span>
                    <span className="truncate">{file?.name}</span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Font Size Controls */}
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                        <button
                            onClick={() => handleFontSizeChange(-10)}
                            disabled={fontSize <= 50}
                            className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            title="Decrease font size"
                        >
                            <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-medium text-slate-600 w-12 text-center flex items-center justify-center gap-0.5 select-none">
                            <Type className="w-3 h-3" />
                            {fontSize}%
                        </span>
                        <button
                            onClick={() => handleFontSizeChange(10)}
                            disabled={fontSize >= 150}
                            className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            title="Increase font size"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="h-6 w-px bg-slate-200" />

                    {/* Translate Button */}
                    <button
                        onClick={handleTranslateSelection}
                        className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
                            <path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
                        </svg>
                        Translate
                    </button>

                    {/* Divider */}
                    <div className="h-6 w-px bg-slate-200" />

                    {/* Settings Button */}
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors cursor-pointer"
                        title="Settings"
                    >
                        <Settings className="w-5 h-5" />
                    </button>

                    {/* Upload Button */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 text-sm text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors font-medium border border-slate-200 cursor-pointer"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Upload
                    </button>
                </div>
            </header>

            {/* Main Content Area with Sidebar */}
            <div className="flex-1 flex overflow-hidden">
                {/* Reader Content */}
                <div className="flex-1 overflow-auto bg-slate-100 flex justify-center">
                    <div className="w-full max-w-5xl h-full shadow-sm bg-white">
                        {fileType === 'pdf' && <PDFViewer fontSize={fontSize} />}
                        {fileType === 'epub' && <EpubViewer fontSize={fontSize} />}
                    </div>
                </div>

                {/* Translation Sidebar */}
                <TranslationPanel
                    originalText={selectedText || ''}
                    onClose={() => setIsTranslationOpen(false)}
                    isOpen={isTranslationOpen}
                    getLatestSelection={() => {
                        let text = window.getSelection()?.toString();
                        if (!text || text.trim().length === 0) {
                            text = useFileStore.getState().selection;
                        }
                        return text || '';
                    }}
                />
            </div>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    );
};
