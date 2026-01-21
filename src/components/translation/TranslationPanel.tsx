import React, { useState, useRef, useEffect } from 'react';
import { X, Play, Loader2, Sparkles, PanelRightClose, Trash2, ChevronDown, ChevronRight, Square } from 'lucide-react';
import OpenAI from 'openai';
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
    getLatestSelection?: () => string;
}

export const TranslationPanel: React.FC<TranslationPanelProps> = ({ onClose, isOpen, getLatestSelection }) => {
    const settings = useSettingsStore();
    const getPageText = useFileStore(state => state.getPageText);
    const [history, setHistory] = useState<TranslationEntry[]>([]);
    const [currentTranslation, setCurrentTranslation] = useState('');
    const [currentOriginalText, setCurrentOriginalText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const scrollRef = useRef<HTMLDivElement>(null);
    const entryIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Auto-scroll to bottom when new translation is added
    useEffect(() => {
        if (scrollRef.current && (currentTranslation || history.length > 0)) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [currentTranslation, history.length]);

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
            return;
        }

        if (!settings.apiKey) {
            setError('Please configure API Key in settings first.');
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
            const client = new OpenAI({
                apiKey: settings.apiKey,
                baseURL: settings.baseUrl,
                dangerouslyAllowBrowser: true
            });

            let systemPrompt = '';
            const targetLang = settings.targetLanguage;
            const formatInstruction = ` IMPORTANT: Preserve the original text's formatting structure - keep paragraph breaks, list items (use • for bullets), section headers, and any other structural elements intact. The translation should mirror the source text's layout so users can easily match translated content with the original.`;
            switch (settings.promptStyle) {
                case 'Academic': systemPrompt = `You are an academic translator. Translate the following text into ${targetLang}, maintaining formal tone and technical accuracy.${formatInstruction}`; break;
                case 'Philosophical': systemPrompt = `You are a translator of philosophical works. Translate the text into ${targetLang} preserving nuances, concepts, and the depth of the original thought.${formatInstruction}`; break;
                case 'Create': systemPrompt = `You are a literary translator. Translate the text into ${targetLang} with a focus on style, flow, and artistic expression.${formatInstruction}`; break;
                case 'Custom': systemPrompt = settings.customPrompt + formatInstruction; break;
                case 'General': default: systemPrompt = `You are a professional translator. Translate the following text into ${targetLang}. Maintain clarity and accuracy.${formatInstruction}`; break;
            }

            let fullTranslation = '';
            const response = await client.chat.completions.create({
                model: settings.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: textToTranslate }
                ],
                stream: true,
            }, { signal: controller.signal });

            for await (const chunk of response) {
                const content = chunk.choices[0]?.delta?.content || '';
                fullTranslation += content;
                setCurrentTranslation(fullTranslation);
            }

            // Add to history after completion
            const newEntry: TranslationEntry = {
                id: ++entryIdRef.current,
                originalText: textToTranslate,
                translation: fullTranslation,
                timestamp: new Date(),
            };
            setHistory(prev => [...prev, newEntry]);
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
                // Preserve paragraph structure: normalize multiple spaces to single space,
                // but keep line breaks to maintain the original formatting
                const cleanText = pageText
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
                    <button
                        onClick={handleTranslatePage}
                        disabled={isLoading || !getPageText}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Translate current page"
                    >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Page
                    </button>
                    <div className="w-px h-4 bg-blue-200 mx-1" />
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
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
                            <p className="whitespace-pre-wrap leading-relaxed text-slate-800 text-sm">{entry.translation}</p>
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
                            value={settings.promptStyle}
                            onChange={(e) => settings.setPromptStyle(e.target.value as any)}
                            className="appearance-none text-xs text-slate-600 font-medium pl-2 pr-6 py-1.5 bg-white rounded-md border border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-colors"
                        >
                            <option value="General">General</option>
                            <option value="Academic">Academic</option>
                            <option value="Create">Creative</option>
                            <option value="Philosophical">Philosophical</option>
                            <option value="Custom">Custom</option>
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <span className="text-xs text-slate-400">
                        {settings.model}
                    </span>
                </div>
                <button
                    onClick={() => isLoading ? handleStop() : handleTranslate()}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-all ${isLoading
                        ? 'bg-rose-50 text-rose-500 border border-rose-100 hover:bg-rose-100'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200/50'
                        }`}
                >
                    {isLoading ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                    {isLoading ? 'Stop Translation' : 'Translate'}
                </button>
            </div>
        </div>
    );
};

