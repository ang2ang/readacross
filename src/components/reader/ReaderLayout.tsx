import { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, Minus, Plus, Type, Home, PlusCircle } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import { PDFViewer } from './PDFViewer';
import { EpubViewer } from './EpubViewer';
import { TextViewer } from './TextViewer';
import { ImageTextViewer } from './ImageTextViewer';
import { SettingsModal } from '../settings/SettingsModal';
import { TranslationPanel } from '../translation/TranslationPanel';
import { FileUploader } from '../upload/FileUploader';
import { QuickPasteModal } from '../common/QuickPasteModal';
import { Toast } from '../common/Toast';
import Tesseract from 'tesseract.js';

export const ReaderLayout: React.FC = () => {
    const { file, fileType, inputMode, pastedText, images, pendingAutoTranslate, canUndo, setFile, reset, setPendingAutoTranslate, appendText, appendImage, undo, clearUndo } = useFileStore();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const [isTranslationOpen, setIsTranslationOpen] = useState(false);
    const [fontSize, setFontSize] = useState(100);
    const [shouldAutoTranslate, setShouldAutoTranslate] = useState(false);
    const [isQuickPasteOpen, setIsQuickPasteOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Determine if we have content to display
    const hasContent = file || pastedText || images.length > 0;

    // Reset font size when entering reader with new content
    useEffect(() => {
        if (hasContent) {
            setFontSize(100);
        }
    }, [file, pastedText, images]);

    // Auto-open translation panel and trigger translation when pendingAutoTranslate is set
    useEffect(() => {
        if (pendingAutoTranslate && hasContent) {
            setIsTranslationOpen(true);
            setShouldAutoTranslate(true);
            setPendingAutoTranslate(false);
        }
    }, [pendingAutoTranslate, hasContent, setPendingAutoTranslate]);

    // Keyboard shortcut: Ctrl/Cmd + V to quick paste
    const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
        // Skip if modal is open (let normal paste work in textarea)
        if (isQuickPasteOpen) return;

        // Only handle paste for text/image modes, not for file mode
        if ((e.metaKey || e.ctrlKey) && e.key === 'v' && (inputMode === 'text' || inputMode === 'image')) {
            // Prevent default paste behavior
            e.preventDefault();

            try {
                if (inputMode === 'text') {
                    // Paste text
                    const text = await navigator.clipboard.readText();
                    if (text && text.trim()) {
                        appendText(text.trim());
                        setToastMessage('Text added');
                    }
                } else if (inputMode === 'image') {
                    // Paste image
                    const items = await navigator.clipboard.read();
                    for (const item of items) {
                        const imageType = item.types.find(t => t.startsWith('image/'));
                        if (imageType) {
                            const blob = await item.getType(imageType);
                            const url = URL.createObjectURL(blob);
                            // Run OCR
                            try {
                                const result = await Tesseract.recognize(url, 'eng+chi_sim');
                                const extractedText = result.data.text.trim() || null;
                                appendImage({ url, extractedText });
                                setToastMessage('Image added');
                            } catch {
                                appendImage({ url, extractedText: null });
                                setToastMessage('Image added (OCR failed)');
                            }
                            break;
                        }
                    }
                }
            } catch (err) {
                console.error('Paste failed:', err);
            }
        }
    }, [inputMode, appendText, appendImage, isQuickPasteOpen]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleTranslateSelection = () => {
        let text = window.getSelection()?.toString();
        if (!text || text.trim().length === 0) {
            text = useFileStore.getState().selection;
        }
        setSelectedText(text && text.trim().length > 0 ? text : '');
        setIsTranslationOpen(true);
    };

    const handleFontSizeChange = (delta: number) => {
        setFontSize(prev => Math.min(150, Math.max(50, prev + delta)));
    };

    const handleGoHome = () => {
        reset();
    };

    const handleQuickPasteText = (text: string) => {
        appendText(text);
        setToastMessage('Text added');
    };

    const handleQuickPasteImage = (imageUrl: string, extractedText: string | null) => {
        appendImage({ url: imageUrl, extractedText });
        setToastMessage('Image added');
    };

    const handleUndo = () => {
        undo();
        setToastMessage(null);
    };

    const handleToastClose = () => {
        setToastMessage(null);
        clearUndo();
    };

    const getContentLabel = () => {
        if (fileType) return fileType.toUpperCase();
        if (inputMode === 'text') return 'TEXT';
        if (inputMode === 'image') return 'IMAGE';
        return '';
    };

    const getContentName = () => {
        if (file) return file.name;
        if (inputMode === 'text') return 'Pasted Text';
        if (inputMode === 'image') return `${images.length} Image${images.length > 1 ? 's' : ''}`;
        return '';
    };

    // Show FileUploader if no content
    if (!hasContent) {
        return <FileUploader />;
    }

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
                    <span className="bg-slate-100 text-slate-500 text-xs px-1.5 py-0.5 rounded uppercase tracking-wider">{getContentLabel()}</span>
                    <span className="truncate">{getContentName()}</span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Quick Add Button - only for text/image modes */}
                    {(inputMode === 'text' || inputMode === 'image') && (
                        <>
                            <button
                                onClick={() => setIsQuickPasteOpen(true)}
                                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all bg-green-50 text-green-600 hover:bg-green-100 cursor-pointer"
                                title="Add more content (Ctrl+V)"
                            >
                                <PlusCircle className="w-4 h-4" />
                                Add
                            </button>
                            <div className="h-6 w-px bg-slate-200" />
                        </>
                    )}

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

                    {/* Home Button */}
                    <button
                        onClick={handleGoHome}
                        className="flex items-center gap-1.5 text-sm text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors font-medium border border-slate-200 cursor-pointer"
                        title="Back to Home"
                    >
                        <Home className="w-4 h-4" />
                        New
                    </button>
                </div>
            </header>

            {/* Main Content Area with Sidebar */}
            <div className="flex-1 flex overflow-hidden">
                {/* Reader Content */}
                <div id="reader-content" className="flex-1 overflow-auto bg-slate-100 flex justify-center">
                    <div className="w-full max-w-5xl h-full shadow-sm bg-white">
                        {fileType === 'pdf' && <PDFViewer fontSize={fontSize} />}
                        {fileType === 'epub' && <EpubViewer fontSize={fontSize} />}
                        {inputMode === 'text' && pastedText && <TextViewer fontSize={fontSize} />}
                        {inputMode === 'image' && images.length > 0 && <ImageTextViewer fontSize={fontSize} />}
                    </div>
                </div>

                {/* Translation Sidebar */}
                <TranslationPanel
                    originalText={selectedText || ''}
                    onClose={() => setIsTranslationOpen(false)}
                    isOpen={isTranslationOpen}
                    autoTranslate={shouldAutoTranslate}
                    onAutoTranslateConsumed={() => setShouldAutoTranslate(false)}
                    getLatestSelection={() => {
                        // For EPUB, selection is stored in store since iframe selection isn't accessible
                        const storeSelection = useFileStore.getState().selection;
                        if (storeSelection && storeSelection.trim().length > 0) {
                            return storeSelection;
                        }
                        // Fallback to window selection for PDF/Text
                        const windowSelection = window.getSelection()?.toString() || '';
                        return windowSelection;
                    }}
                />
            </div>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

            {/* Quick Paste Modal */}
            <QuickPasteModal
                isOpen={isQuickPasteOpen}
                onClose={() => setIsQuickPasteOpen(false)}
                onPasteText={handleQuickPasteText}
                onPasteImage={handleQuickPasteImage}
                currentMode={inputMode === 'image' ? 'image' : 'text'}
            />

            {/* Toast with Undo */}
            {toastMessage && (
                <Toast
                    message={toastMessage}
                    onUndo={canUndo ? handleUndo : undefined}
                    onClose={handleToastClose}
                />
            )}
        </div>
    );
};
