import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Type, ImageIcon, Clipboard, Loader2 } from 'lucide-react';
import Tesseract from 'tesseract.js';

interface QuickPasteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPasteText: (text: string) => void;
    onPasteImage: (imageUrl: string, extractedText: string | null) => void;
    currentMode: 'text' | 'image';
}

export const QuickPasteModal: React.FC<QuickPasteModalProps> = ({
    isOpen,
    onClose,
    onPasteText,
    onPasteImage,
    currentMode
}) => {
    const [text, setText] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [ocrProgress, setOcrProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    // Handle paste event for image mode
    useEffect(() => {
        if (!isOpen || currentMode !== 'image') return;

        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        const url = URL.createObjectURL(file);
                        setImageUrl(url);
                    }
                    break;
                }
            }
        };

        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [isOpen, currentMode]);

    const handlePasteFromClipboard = useCallback(async () => {
        try {
            if (currentMode === 'text') {
                const clipText = await navigator.clipboard.readText();
                if (clipText) {
                    setText(clipText);
                }
            } else {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const imageType = item.types.find(t => t.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        const url = URL.createObjectURL(blob);
                        setImageUrl(url);
                        break;
                    }
                }
            }
        } catch (err) {
            console.error('Failed to read clipboard:', err);
        }
    }, [currentMode]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setImageUrl(url);
        }
    };

    const handleSubmit = async () => {
        if (currentMode === 'text') {
            if (text.trim()) {
                onPasteText(text.trim());
                resetAndClose();
            }
        } else if (imageUrl) {
            setIsProcessing(true);
            try {
                // Run OCR
                const result = await Tesseract.recognize(imageUrl, 'eng+chi_sim', {
                    logger: (m) => {
                        if (m.status === 'recognizing text') {
                            setOcrProgress(Math.round(m.progress * 100));
                        }
                    }
                });
                const extractedText = result.data.text.trim() || null;
                onPasteImage(imageUrl, extractedText);
                resetAndClose();
            } catch (err) {
                console.error('OCR failed:', err);
                onPasteImage(imageUrl, null);
                resetAndClose();
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const resetAndClose = () => {
        setText('');
        setImageUrl(null);
        setIsProcessing(false);
        setOcrProgress(0);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={resetAndClose}>
            <div
                role="dialog" aria-modal="true" aria-label="Add more content" data-reader-modal
                className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800">Add More</h3>
                        <span className="flex items-center gap-1 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                            {currentMode === 'text' ? <Type className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                            {currentMode === 'text' ? 'Text' : 'Image'}
                        </span>
                    </div>
                    <button onClick={resetAndClose} className="p-1 hover:bg-slate-100 rounded transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {currentMode === 'text' ? (
                        <div className="space-y-3">
                            <textarea
                                value={text}
                                onChange={e => setText(e.target.value)}
                                placeholder="Paste or type text here..."
                                className="w-full h-40 p-3 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                autoFocus
                            />
                            <button
                                onClick={handlePasteFromClipboard}
                                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                            >
                                <Clipboard className="w-4 h-4" />
                                Paste from clipboard
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {imageUrl ? (
                                <div className="relative">
                                    <img src={imageUrl} alt="Preview" className="w-full max-h-48 object-contain rounded-lg border border-slate-200" />
                                    <button
                                        onClick={() => setImageUrl(null)}
                                        className="absolute top-2 right-2 p-1 bg-white/90 hover:bg-white rounded-full shadow"
                                    >
                                        <X className="w-4 h-4 text-slate-600" />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    ref={dropZoneRef}
                                    onClick={() => fileInputRef.current?.click()}
                                    className="h-40 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    tabIndex={0}
                                >
                                    <ImageIcon className="w-8 h-8 text-slate-400" />
                                    <span className="text-sm text-slate-500">Press ⌘V to paste, or click to upload</span>
                                </div>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <button
                                onClick={handlePasteFromClipboard}
                                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                            >
                                <Clipboard className="w-4 h-4" />
                                Paste from clipboard
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                    <button
                        onClick={resetAndClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isProcessing || (currentMode === 'text' ? !text.trim() : !imageUrl)}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                OCR {ocrProgress}%
                            </>
                        ) : (
                            'Add'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
