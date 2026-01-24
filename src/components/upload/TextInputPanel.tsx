import React, { useState, useRef, useEffect } from 'react';
import { FileText, Clipboard, ArrowRight } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';

export const TextInputPanel: React.FC = () => {
    const setPastedText = useFileStore((state) => state.setPastedText);
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const handlePasteFromClipboard = async () => {
        try {
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText) {
                setText(clipboardText);
            }
        } catch (err) {
            console.error('Failed to read from clipboard:', err);
        }
    };

    const handleSubmit = () => {
        if (text.trim()) {
            setPastedText(text.trim());
        }
    };

    const characterCount = text.length;

    return (
        <div className="w-full max-w-2xl mx-auto p-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-2 text-slate-700 font-medium">
                        <FileText className="w-4 h-4" />
                        Paste Text
                    </div>
                    <button
                        onClick={handlePasteFromClipboard}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                        <Clipboard className="w-3.5 h-3.5" />
                        Paste from Clipboard
                    </button>
                </div>

                {/* Textarea */}
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste or type text here for translation..."
                    className="w-full h-64 p-4 text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none text-sm leading-relaxed"
                />

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                    <span className="text-xs text-slate-400">
                        {characterCount.toLocaleString()} characters
                    </span>
                    <button
                        onClick={handleSubmit}
                        disabled={!text.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Start Translation
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Hint */}
            <p className="text-center text-sm text-slate-400 mt-4">
                Tip: Use Ctrl+V (⌘+V on Mac) to paste directly into the text area
            </p>
        </div>
    );
};
