import React, { useState, useEffect } from 'react';
import { useSettingsStore, type PromptStyle, type Provider } from '../../store/useSettingsStore';
import { X, Settings, Key, Server, MessageSquare, Languages, Thermometer } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface LocalSettings {
    provider: Provider;
    apiKey: string;
    baseUrl: string;
    temperature: number;
    targetLanguage: string;
    promptStyle: PromptStyle;
    customPrompt: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const settings = useSettingsStore();

    // Local state for draft settings (only saved on Done)
    const [draft, setDraft] = useState<LocalSettings>({
        provider: settings.provider,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        temperature: settings.temperature,
        targetLanguage: settings.targetLanguage,
        promptStyle: settings.promptStyle,
        customPrompt: settings.customPrompt,
    });

    // Reset draft to current settings when modal opens
    useEffect(() => {
        if (isOpen) {
            setDraft({
                provider: settings.provider,
                apiKey: settings.apiKey,
                baseUrl: settings.baseUrl,
                temperature: settings.temperature,
                targetLanguage: settings.targetLanguage,
                promptStyle: settings.promptStyle,
                customPrompt: settings.customPrompt,
            });
        }
    }, [isOpen, settings.provider, settings.apiKey, settings.baseUrl, settings.temperature, settings.targetLanguage, settings.promptStyle, settings.customPrompt]);

    const handleSave = () => {
        // Apply all changes to the store
        settings.setProvider(draft.provider);
        settings.setApiKey(draft.apiKey);
        settings.setBaseUrl(draft.baseUrl);
        settings.setTemperature(draft.temperature);
        settings.setTargetLanguage(draft.targetLanguage);
        settings.setPromptStyle(draft.promptStyle);
        settings.setCustomPrompt(draft.customPrompt);
        onClose();
    };

    const handleCancel = () => {
        // Discard changes and close
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header - Fixed */}
                <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <Settings className="w-5 h-5 text-slate-600" />
                        Translation Settings
                    </div>
                    <button onClick={handleCancel} className="p-1 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    <div className="space-y-4">
                        <label className="block text-sm font-medium text-slate-700">Provider</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${draft.provider === 'deepseek' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                                onClick={() => setDraft(d => ({ ...d, provider: 'deepseek' }))}
                            >
                                DeepSeek
                            </button>
                            <button
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${draft.provider === 'openai' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                                onClick={() => setDraft(d => ({ ...d, provider: 'openai' }))}
                            >
                                OpenAI
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <Key className="w-4 h-4 text-slate-400" />
                            API Key
                        </label>
                        <input
                            type="password"
                            placeholder="sk-..."
                            value={draft.apiKey}
                            onChange={(e) => setDraft(d => ({ ...d, apiKey: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        <p className="text-xs text-slate-500">Stored locally in your browser.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <Server className="w-4 h-4 text-slate-400" />
                            Base URL
                        </label>
                        <input
                            type="text"
                            value={draft.baseUrl}
                            onChange={(e) => setDraft(d => ({ ...d, baseUrl: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <Thermometer className="w-4 h-4 text-slate-400" />
                            Temperature
                            <span className="ml-auto text-blue-600 font-semibold">{draft.temperature.toFixed(1)}</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={draft.temperature}
                            onChange={(e) => setDraft(d => ({ ...d, temperature: parseFloat(e.target.value) }))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <p className="text-xs text-slate-500">Lower = more deterministic, Higher = more creative</p>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <Languages className="w-4 h-4 text-slate-400" />
                            Target Language
                        </label>
                        <select
                            value={draft.targetLanguage}
                            onChange={(e) => setDraft(d => ({ ...d, targetLanguage: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                        >
                            <option value="简体中文">简体中文</option>
                            <option value="English">English</option>
                            <option value="日本語">日本語</option>
                            <option value="Français">Français</option>
                            <option value="Deutsch">Deutsch</option>
                            <option value="Português">Português</option>
                            <option value="繁體中文">繁體中文</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <MessageSquare className="w-4 h-4 text-slate-400" />
                            Translation Style
                        </label>
                        <select
                            value={draft.promptStyle}
                            onChange={(e) => setDraft(d => ({ ...d, promptStyle: e.target.value as PromptStyle }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                        >
                            <option value="General">General (Balanced)</option>
                            <option value="Academic">Academic (Formal)</option>
                            <option value="Philosophical">Philosophical (Nuanced)</option>
                            <option value="Create">Creative (Literary)</option>
                            <option value="Custom">Custom Prompt</option>
                        </select>
                    </div>

                    {draft.promptStyle === 'Custom' && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                            <textarea
                                value={draft.customPrompt}
                                onChange={(e) => setDraft(d => ({ ...d, customPrompt: e.target.value }))}
                                placeholder="Enter system prompt..."
                                className="w-full h-24 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                            />
                        </div>
                    )}
                </div>

                {/* Footer - Fixed */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
