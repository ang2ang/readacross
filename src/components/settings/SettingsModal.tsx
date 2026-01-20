import React from 'react';
import { useSettingsStore, type PromptStyle } from '../../store/useSettingsStore';
import { X, Settings, Key, Server, MessageSquare, Languages } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const settings = useSettingsStore();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <Settings className="w-5 h-5 text-slate-600" />
                        Translation Settings
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="space-y-4">
                        <label className="block text-sm font-medium text-slate-700">Provider</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${settings.provider === 'deepseek' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                                onClick={() => settings.setProvider('deepseek')}
                            >
                                DeepSeek
                            </button>
                            <button
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${settings.provider === 'openai' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                                onClick={() => settings.setProvider('openai')}
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
                            value={settings.apiKey}
                            onChange={(e) => settings.setApiKey(e.target.value)}
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
                            value={settings.baseUrl}
                            onChange={(e) => settings.setBaseUrl(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <Languages className="w-4 h-4 text-slate-400" />
                            Target Language
                        </label>
                        <select
                            value={settings.targetLanguage}
                            onChange={(e) => settings.setTargetLanguage(e.target.value)}
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
                            value={settings.promptStyle}
                            onChange={(e) => settings.setPromptStyle(e.target.value as PromptStyle)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                        >
                            <option value="General">General (Balanced)</option>
                            <option value="Academic">Academic (Formal)</option>
                            <option value="Philosophical">Philosophical (Nuanced)</option>
                            <option value="Create">Creative (Literary)</option>
                            <option value="Custom">Custom Prompt</option>
                        </select>
                    </div>

                    {settings.promptStyle === 'Custom' && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                            <textarea
                                value={settings.customPrompt}
                                onChange={(e) => settings.setCustomPrompt(e.target.value)}
                                placeholder="Enter system prompt..."
                                className="w-full h-24 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                            />
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
