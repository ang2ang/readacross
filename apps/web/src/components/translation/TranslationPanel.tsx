import React, { useState, useRef, useEffect } from 'react';
import { X, Play, Loader2, Sparkles, PanelRightClose, Trash2, ChevronDown, ChevronRight, Square, Copy, Check } from 'lucide-react';
import { translateText, buildSystemPrompt } from '@readacross/core';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useFileStore } from '../../store/useFileStore';

interface TranslationEntry {
    id: number;
    originalText: string;
    translation: string;
    timestamp: Date;
}

interface TranslationPanelProps {
    originalText: string;
    onClose: () => void;
    isOpen: boolean;
    autoTranslate?: boolean;
    onAutoTranslateConsumed?: () => void;
    getLatestSelection?: () => string;
}

export const TranslationPanel: React.FC<TranslationPanelProps> = ({ onClose, isOpen, autoTranslate, onAutoTranslateConsumed, getLatestSelection }) => {
    const settings = useSettingsStore();
    const getPageText = useFileStore(state => state.getPageText);
    const selection = useFileStore(state => state.selection);
    const newContentStart = useFileStore(state => state.newContentStart);
    const clearNewContentStart = useFileStore(state => state.clearNewContentStart);
    const pastedText = useFileStore(state => state.pastedText);
    const inputMode = useFileStore(state => state.inputMode);
    const [history, setHistory] = useState<TranslationEntry[]>([]);
    const [currentTranslation, setCurrentTranslation] = useState('');
    const [currentOriginalText, setCurrentOriginalText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const scrollRef = useRef<HTMLDivElement>(null);
    const entryIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [hasSelection, setHasSelection] = useState(false);

    // Listen for selection changes to update button state in real-time
    // Only consider selections within the reader area (not the translation panel)
    useEffect(() => {
        const checkSelection = () => {
            const storeSelection = useFileStore.getState().selection;

            // Check if window selection is within the reader content (not translation panel)
            let windowSelectionValid = false;
            const windowSelection = window.getSelection();
            if (windowSelection && windowSelection.toString().trim().length > 0) {
                const anchorNode = windowSelection.anchorNode;
                if (anchorNode) {
                    // Check if selection is within reader-content area
                    const readerContent = document.getElementById('reader-content');
                    if (readerContent && readerContent.contains(anchorNode)) {
                        windowSelectionValid = true;
                    }
                }
            }

            setHasSelection(storeSelection.trim().length > 0 || windowSelectionValid);
        };

        // Check initially
        checkSelection();

        // Listen for selection changes
        document.addEventListener('selectionchange', checkSelection);
        return () => document.removeEventListener('selectionchange', checkSelection);
    }, []);

    // Also update when store selection changes
    useEffect(() => {
        const windowSelection = window.getSelection();
        let windowSelectionValid = false;
        if (windowSelection && windowSelection.toString().trim().length > 0) {
            const anchorNode = windowSelection.anchorNode;
            if (anchorNode) {
                const readerContent = document.getElementById('reader-content');
                if (readerContent && readerContent.contains(anchorNode)) {
                    windowSelectionValid = true;
                }
            }
        }
        setHasSelection(selection.trim().length > 0 || windowSelectionValid);
    }, [selection]);

    const handleCopy = async (text: string, id: number) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    // Auto-scroll to bottom when new translation is added
    useEffect(() => {
        if (scrollRef.current && (currentTranslation || history.length > 0)) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [currentTranslation, history.length]);

    // Auto-translate when entering from paste flow
    useEffect(() => {
        if (autoTranslate && isOpen && getPageText && !isLoading) {
            onAutoTranslateConsumed?.();
            // Small delay to ensure getPageText is set up
            const timer = setTimeout(() => {
                handleTranslatePage();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [autoTranslate, isOpen, getPageText]);

    const toggleExpand = (id: number) => {
        setExpandedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleTranslate = async (text?: string) => {
        // Get the latest selection when clicking Translate if no specific text provided
        const textToTranslate = text || (getLatestSelection ? getLatestSelection() : '');

        if (!textToTranslate || textToTranslate.trim().length === 0) {
            setError(text ? 'Could not extract page text.' : 'Please select text to translate.');
            setIsLoading(false);
            return;
        }

        if (!settings.apiKey && settings.provider !== 'local' && settings.provider !== 'hosted') {
            setError('Please configure API Key in settings first.');
            setIsLoading(false);
            return;
        }

        setCurrentOriginalText(textToTranslate);
        setIsLoading(true);
        setError(null);
        setCurrentTranslation('');

        // Create new AbortController
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const systemPrompt = buildSystemPrompt(
                settings.promptStyle,
                settings.targetLanguage,
                settings.getActiveCustomPrompt()
            );

            let fullTranslation = '';
            
            await translateText(textToTranslate, {
                provider: settings.provider,
                apiKey: settings.apiKey,
                baseUrl: settings.baseUrl,
                model: settings.model,
                temperature: settings.temperature,
                systemPrompt,
                signal: controller.signal,
                onStream: (chunk) => {
                    fullTranslation += chunk;
                    setCurrentTranslation(fullTranslation);
                }
            });

            // Only add to history if not aborted
            if (!controller.signal.aborted) {
                const newEntry: TranslationEntry = {
                    id: ++entryIdRef.current,
                    originalText: textToTranslate,
                    translation: fullTranslation,
                    timestamp: new Date(),
                };
                setHistory(prev => [...prev, newEntry]);
            }
            setCurrentTranslation('');
            setCurrentOriginalText('');

        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                setError('Translation stopped by user.');
            } else {
                setError(err.message || 'Translation failed');
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    const handleTranslatePage = async () => {
        if (!getPageText) {
            setError('Unable to extract page content from this viewer.');
            return;
        }

        setIsLoading(true);
        try {
            const pageText = await getPageText();
            if (pageText && pageText.trim().length > 0) {
                let textToTranslate = pageText;

                // If there's newly appended content (in text mode), only translate the new part
                if (inputMode === 'text' && newContentStart !== null && pastedText) {
                    const newContent = pastedText.slice(newContentStart);
                    if (newContent.trim().length > 0) {
                        textToTranslate = newContent;
                    }
                    // Clear the marker after using it
                    clearNewContentStart();
                }

                // Preserve paragraph structure: normalize multiple spaces to single space,
                // but keep line breaks to maintain the original formatting
                const cleanText = textToTranslate
                    .replace(/[ \t]+/g, ' ')  // Normalize horizontal whitespace only
                    .replace(/\n{3,}/g, '\n\n')  // Limit consecutive newlines to 2
                    .trim();
                await handleTranslate(cleanText);
            } else {
                setError('No text found on the current page.');
                setIsLoading(false);
            }
        } catch (err) {
            setError('Failed to extract page text.');
            setIsLoading(false);
        }
    };

    const clearHistory = () => {
        setHistory([]);
        setCurrentTranslation('');
        setCurrentOriginalText('');
        setError(null);
    };

    if (!isOpen) return null;

    return (
        <div className="w-96 h-full bg-white border-l border-slate-200 flex flex-col shadow-xl shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-2 font-semibold text-slate-700">
                    <Sparkles className="w-5 h-5 text-blue-500" />
                    AI Translation
                </div>
                <div className="flex items-center gap-1">
                    {history.length > 0 && (
                        <button
                            onClick={clearHistory}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Clear history"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Close sidebar"
                    >
                        <PanelRightClose className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Content - Translation History */}
            <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
                {/* Translation History */}
                {history.map((entry) => (
                    <div key={entry.id} className="space-y-2">
                        {/* Collapsible Original Text */}
                        <button
                            onClick={() => toggleExpand(entry.id)}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            {expandedIds.has(entry.id) ? (
                                <ChevronDown className="w-3 h-3" />
                            ) : (
                                <ChevronRight className="w-3 h-3" />
                            )}
                            <span className="truncate max-w-[300px]">
                                {entry.originalText.slice(0, 50)}{entry.originalText.length > 50 ? '...' : ''}
                            </span>
                        </button>

                        {/* Expanded Original Text */}
                        {expandedIds.has(entry.id) && (
                            <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600 border border-slate-200 leading-relaxed">
                                {entry.originalText}
                            </div>
                        )}

                        {/* Translation Result */}
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100 relative group">
                            <p className="whitespace-pre-wrap leading-relaxed text-slate-800 text-sm pr-8">{entry.translation}</p>
                            <button
                                onClick={() => handleCopy(entry.translation, entry.id)}
                                className="absolute top-2 right-2 p-1.5 rounded-md bg-white/80 hover:bg-white border border-slate-200 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all"
                                title="Copy translation"
                            >
                                {copiedId === entry.id ? (
                                    <Check className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                )}
                            </button>
                        </div>
                    </div>
                ))}

                {/* Current Translation in Progress */}
                {(isLoading || currentTranslation) && (
                    <div className="space-y-2">
                        <div className="text-xs text-slate-400 truncate max-w-[300px]">
                            {currentOriginalText.slice(0, 50)}{currentOriginalText.length > 50 ? '...' : ''}
                        </div>
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
                            {currentTranslation ? (
                                <p className="whitespace-pre-wrap leading-relaxed text-slate-800 text-sm">{currentTranslation}</p>
                            ) : (
                                <div className="flex items-center gap-2 text-slate-400">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span className="text-sm">Translating...</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200 flex items-start gap-2">
                        <X className="w-4 h-4 mt-0.5 shrink-0" />
                        {error}
                    </div>
                )}

                {/* Empty state */}
                {history.length === 0 && !currentTranslation && !error && !isLoading && (
                    <div className="flex-1 flex items-center justify-center py-12">
                        <div className="text-center text-slate-400">
                            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Select text and click "Translate"</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="relative">
                        <select
                            value={settings.promptStyle === 'Custom' && settings.selectedCustomPromptId
                                ? `custom:${settings.selectedCustomPromptId}`
                                : settings.promptStyle}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value.startsWith('custom:')) {
                                    const promptId = value.replace('custom:', '');
                                    settings.setPromptStyle('Custom');
                                    settings.selectCustomPrompt(promptId);
                                } else {
                                    settings.setPromptStyle(value as any);
                                }
                            }}
                            className="appearance-none text-xs text-slate-600 font-medium pl-2 pr-6 py-1.5 bg-white rounded-md border border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-colors"
                        >
                            <option value="General">General</option>
                            <option value="Academic">Academic</option>
                            <option value="Create">Creative</option>
                            <option value="Philosophical">Philosophical</option>
                            {settings.customPrompts.length > 0 && settings.customPrompts.map(p => (
                                <option key={p.id} value={`custom:${p.id}`}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <span className="text-xs text-slate-400">
                        {settings.model}
                    </span>
                </div>
                {isLoading ? (
                    <button
                        onClick={handleStop}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-all bg-rose-50 text-rose-500 border border-rose-100 hover:bg-rose-100"
                    >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        Stop
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleTranslate()}
                            disabled={!hasSelection}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-all ${hasSelection
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200/50'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                }`}
                        >
                            <Play className="w-4 h-4 fill-current" />
                            Selection
                        </button>
                        <button
                            onClick={handleTranslatePage}
                            disabled={!getPageText}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-all ${!getPageText
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200/50'
                                }`}
                        >
                            <Play className="w-4 h-4 fill-current" />
                            Page
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
