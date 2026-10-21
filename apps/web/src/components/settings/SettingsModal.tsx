import React, { useState } from 'react';
import { ReadingStorageSettings } from './ReadingStorageSettings';
import { useSettingsStore } from '../../store/useSettingsStore';
import { type PromptStyle, type Provider, type CustomPrompt } from '@readacross/core';
import { X, Settings, Key, Server, MessageSquare, Languages, Thermometer, Plus, Trash2, Edit2, Check, BookOpen } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface LocalSettings {
    provider: Provider;
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    targetLanguage: string;
    promptStyle: PromptStyle;
    customPrompts: CustomPrompt[];
    selectedCustomPromptId: string | null;
}

// Example prompts for user reference
const EXAMPLE_PROMPTS = [
    {
        name: '学术翻译',
        prompt: `您是一位专业的学术翻译专家。请将以下内容翻译成目标语言，确保：
1. 保持学术术语的准确性和专业性
2. 使用正式的学术语言风格
3. 保留原文的逻辑结构和论证层次
4. 对专业术语可在首次出现时附加英文原文`
    },
    {
        name: '文学翻译',
        prompt: `您是一位富有文采的文学翻译家。请将以下内容翻译成目标语言，注重：
1. 保持原作的文学韵味和修辞风格
2. 注重遣词造句的优美流畅
3. 适当本地化文化典故和习语
4. 保留原文的情感色彩和意境`
    },
    {
        name: '技术文档',
        prompt: `您是一位技术文档翻译专家。请将以下内容翻译成目标语言，要求：
1. 保持技术术语的一致性和准确性
2. 使用清晰简洁的说明性语言
3. 保留代码片段、变量名和命令不翻译
4. 确保操作步骤和指令的明确性`
    },
    {
        name: '通俗易懂',
        prompt: `您是一位善于深入浅出的翻译专家。请将以下内容翻译成通俗易懂的目标语言，要求：
1. 将复杂概念用简单词汇解释
2. 使用日常生活中的例子来类比
3. 避免过于专业的术语，必要时加以解释
4. 保持内容的趣味性和可读性`
    }
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => isOpen ? <SettingsDialog onClose={onClose} /> : null;

const SettingsDialog: React.FC<Pick<SettingsModalProps, 'onClose'>> = ({ onClose }) => {
    const settings = useSettingsStore();

    // Local state for draft settings (only saved on Done)
    const [draft, setDraft] = useState<LocalSettings>({
        provider: settings.provider,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: settings.temperature,
        targetLanguage: settings.targetLanguage,
        promptStyle: settings.promptStyle,
        customPrompts: settings.customPrompts,
        selectedCustomPromptId: settings.selectedCustomPromptId,
    });

    // State for editing prompt
    const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingContent, setEditingContent] = useState('');

    const handleSave = () => {
        // Apply all changes to the store
        settings.setProvider(draft.provider);
        settings.setApiKey(draft.apiKey);
        settings.setBaseUrl(draft.baseUrl);
        settings.setModel(draft.model);
        settings.setTemperature(draft.temperature);
        settings.setTargetLanguage(draft.targetLanguage);
        settings.setPromptStyle(draft.promptStyle);

        // Sync custom prompts: find added, updated, and deleted
        const currentIds = new Set(settings.customPrompts.map(p => p.id));
        const draftIds = new Set(draft.customPrompts.map(p => p.id));

        // Delete removed prompts
        for (const p of settings.customPrompts) {
            if (!draftIds.has(p.id)) {
                settings.deleteCustomPrompt(p.id);
            }
        }

        // Add new prompts or update existing ones
        for (const p of draft.customPrompts) {
            if (!currentIds.has(p.id)) {
                // This is a new prompt (added in draft)
                settings.addCustomPrompt({ name: p.name, prompt: p.prompt });
            } else {
                const existing = settings.customPrompts.find(ep => ep.id === p.id);
                if (existing && (existing.name !== p.name || existing.prompt !== p.prompt)) {
                    settings.updateCustomPrompt(p.id, { name: p.name, prompt: p.prompt });
                }
            }
        }

        // Update selected prompt
        settings.selectCustomPrompt(draft.selectedCustomPromptId);

        onClose();
    };

    const handleCancel = () => {
        // Discard changes and close
        onClose();
    };

    const handleProviderChange = (newProvider: Provider) => {
        setDraft(d => {
            const defaultBaseUrl = newProvider === 'hosted'
                ? '/api/openai'
                : newProvider === 'deepseek'
                    ? 'https://api.deepseek.com'
                    : newProvider === 'openai'
                        ? 'https://api.openai.com/v1'
                        : 'http://localhost:11434/v1';
            const defaultModel = newProvider === 'hosted'
                ? 'qwen3.5:9b'
                : newProvider === 'deepseek'
                    ? 'deepseek-chat'
                    : newProvider === 'openai'
                        ? 'gpt-4o'
                        : 'qwen2.5:7b';
            return {
                ...d,
                provider: newProvider,
                apiKey: settings.keys[newProvider] ?? '',
                baseUrl: settings.baseUrls[newProvider] ?? defaultBaseUrl,
                model: settings.models[newProvider] ?? defaultModel,
            };
        });
    };

    const handleAddPrompt = () => {
        const newPrompt: CustomPrompt = {
            id: `prompt_draft_${crypto.randomUUID()}`,
            name: `Custom ${draft.customPrompts.length + 1}`,
            prompt: '',
        };
        setDraft(d => ({
            ...d,
            customPrompts: [...d.customPrompts, newPrompt],
            selectedCustomPromptId: newPrompt.id,
        }));
        setEditingPromptId(newPrompt.id);
        setEditingName(newPrompt.name);
        setEditingContent(newPrompt.prompt);
    };

    const handleDeletePrompt = (id: string) => {
        setDraft(d => {
            const newPrompts = d.customPrompts.filter(p => p.id !== id);
            return {
                ...d,
                customPrompts: newPrompts,
                selectedCustomPromptId: d.selectedCustomPromptId === id
                    ? (newPrompts.length > 0 ? newPrompts[0].id : null)
                    : d.selectedCustomPromptId,
            };
        });
        if (editingPromptId === id) {
            setEditingPromptId(null);
        }
    };

    const handleSelectPrompt = (id: string) => {
        setDraft(d => ({ ...d, selectedCustomPromptId: id }));
        const prompt = draft.customPrompts.find(p => p.id === id);
        if (prompt) {
            setEditingPromptId(id);
            setEditingName(prompt.name);
            setEditingContent(prompt.prompt);
        }
    };

    const handleSaveEditingPrompt = () => {
        if (!editingPromptId) return;
        setDraft(d => ({
            ...d,
            customPrompts: d.customPrompts.map(p =>
                p.id === editingPromptId ? { ...p, name: editingName, prompt: editingContent } : p
            ),
        }));
    };

    const handleApplyExample = (example: typeof EXAMPLE_PROMPTS[0]) => {
        if (editingPromptId) {
            setEditingName(example.name);
            setEditingContent(example.prompt);
            // Also immediately update the draft
            setDraft(d => ({
                ...d,
                customPrompts: d.customPrompts.map(p =>
                    p.id === editingPromptId ? { ...p, name: example.name, prompt: example.prompt } : p
                ),
            }));
        } else {
            // Create a new prompt with the example
            const newPrompt: CustomPrompt = {
                id: `prompt_draft_${crypto.randomUUID()}`,
                name: example.name,
                prompt: example.prompt,
            };
            setDraft(d => ({
                ...d,
                customPrompts: [...d.customPrompts, newPrompt],
                selectedCustomPromptId: newPrompt.id,
            }));
            setEditingPromptId(newPrompt.id);
            setEditingName(newPrompt.name);
            setEditingContent(newPrompt.prompt);
        }
    };

    const updateEditingPrompt = (name: string, content: string) => {
        setEditingName(name); setEditingContent(content);
        setDraft(current => ({ ...current, customPrompts: current.customPrompts.map(prompt =>
            prompt.id === editingPromptId ? { ...prompt, name, prompt: content } : prompt) }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div role="dialog" aria-modal="true" aria-label="Translation settings" data-reader-modal className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onKeyDown={event => {
                    if (event.key === 'Escape') { event.stopPropagation(); handleCancel(); return; }
                    if (event.key !== 'Tab') return;
                    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')]
                        .filter(element => element.getClientRects().length);
                    const first = items[0]; const last = items.at(-1);
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
                }}>
                {/* Header - Fixed */}
                <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <Settings className="w-5 h-5 text-slate-600" />
                        Translation Settings
                    </div>
                    <button autoFocus aria-label="Close settings" onClick={handleCancel} className="p-1 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    <ReadingStorageSettings />
                    <div className="space-y-4">
                        <label className="block text-sm font-medium text-slate-700">Provider</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                aria-pressed={draft.provider === 'deepseek'}
                                className={`min-h-10 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${draft.provider === 'deepseek' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                                onClick={() => handleProviderChange('deepseek')}
                            >
                                DeepSeek
                            </button>
                            <button
                                aria-pressed={draft.provider === 'openai'}
                                className={`min-h-10 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${draft.provider === 'openai' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                                onClick={() => handleProviderChange('openai')}
                            >
                                OpenAI
                            </button>
                            <button
                                aria-pressed={draft.provider === 'ollama'}
                                className={`min-h-10 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${draft.provider === 'ollama' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                                onClick={() => handleProviderChange('ollama')}
                            >
                                Ollama
                            </button>
                            <button
                                aria-pressed={draft.provider === 'local'}
                                className={`min-h-10 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${draft.provider === 'local' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                                onClick={() => handleProviderChange('local')}
                            >
                                Local LLM
                            </button>
                        </div>
                        {draft.provider === 'local' && (
                            <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
                                Connect to your own local model server, for example Ollama at <code>http://192.168.1.20:11434</code>. The app will automatically use the OpenAI-compatible <code>/v1</code> endpoint.
                            </p>
                        )}
                        {draft.provider === 'ollama' && (
                            <p className="text-xs text-violet-700 bg-violet-50 px-3 py-2 rounded-lg border border-violet-100">
                                Uses the <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline">Ollama Cloud API</a> directly. Create an API key at <a href="https://ollama.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline">ollama.com/settings/keys</a>. Free tier available.
                            </p>
                        )}
                    </div>

                    {/* API Key — hidden for local provider */}
                    {draft.provider !== 'local' && (
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
                    )}

                    {/* Base URL */}
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
                            <BookOpen className="w-4 h-4 text-slate-400" />
                            Model
                        </label>
                        <input
                            type="text"
                            value={draft.model}
                            onChange={(e) => setDraft(d => ({ ...d, model: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            placeholder={draft.provider === 'hosted' ? 'qwen3.5:9b' : draft.provider === 'deepseek' ? 'deepseek-chat' : draft.provider === 'openai' ? 'gpt-4o' : draft.provider === 'ollama' ? 'deepseek-v4-flash' : 'qwen2.5:7b'}
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
                            value={draft.promptStyle === 'Custom' && draft.selectedCustomPromptId
                                ? `custom:${draft.selectedCustomPromptId}`
                                : draft.promptStyle}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value.startsWith('custom:')) {
                                    const promptId = value.replace('custom:', '');
                                    setDraft(d => ({ ...d, promptStyle: 'Custom', selectedCustomPromptId: promptId }));
                                } else {
                                    setDraft(d => ({ ...d, promptStyle: value as PromptStyle }));
                                }
                            }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                        >
                            <option value="General">General (Balanced)</option>
                            <option value="Academic">Academic (Formal)</option>
                            <option value="Philosophical">Philosophical (Nuanced)</option>
                            <option value="Create">Creative (Literary)</option>
                            {draft.customPrompts.length > 0 && (
                                <optgroup label="My Custom Prompts">
                                    {draft.customPrompts.map(p => (
                                        <option key={p.id} value={`custom:${p.id}`}>
                                            {p.name}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                            <option value="Custom">+ Manage Custom Prompts...</option>
                        </select>
                    </div>

                    {draft.promptStyle === 'Custom' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            {/* Custom Prompts List */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-600">My Prompts</span>
                                <button
                                    onClick={handleAddPrompt}
                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    New Prompt
                                </button>
                            </div>

                            {draft.customPrompts.length > 0 ? (
                                <div className="space-y-1.5">
                                    {draft.customPrompts.map(prompt => (
                                        <div
                                            key={prompt.id}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${draft.selectedCustomPromptId === prompt.id
                                                ? 'bg-blue-50 border-blue-200'
                                                : 'border-slate-200 hover:bg-slate-50'
                                                }`}
                                            onClick={() => handleSelectPrompt(prompt.id)}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-medium text-slate-700 truncate block">{prompt.name}</span>
                                                <span className="text-xs text-slate-400 truncate block">{prompt.prompt.slice(0, 40)}...</span>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeletePrompt(prompt.id);
                                                }}
                                                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-slate-400 text-sm bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    No custom prompts yet. Click "New Prompt" or select an example below.
                                </div>
                            )}

                            {/* Prompt Editor */}
                            {editingPromptId && (
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <Edit2 className="w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={editingName}
                                            onChange={(e) => updateEditingPrompt(e.target.value, editingContent)}
                                            placeholder="Prompt name..."
                                            className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        />
                                        <button
                                            onClick={() => {
                                                handleSaveEditingPrompt();
                                                setEditingPromptId(null);
                                            }}
                                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                                        >
                                            <Check className="w-3 h-3" />
                                            Save
                                        </button>
                                    </div>
                                    <textarea
                                        value={editingContent}
                                        onChange={(e) => updateEditingPrompt(editingName, e.target.value)}
                                        placeholder="Enter your custom system prompt here...

Example: 您是一位专业的翻译专家，请...

Tip: Describe the translation style, tone, and any special requirements."
                                        className="w-full h-32 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm resize-none"
                                    />
                                </div>
                            )}

                            {/* Example Prompts */}
                            <div className="pt-2 border-t border-slate-100">
                                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Prompt Examples</span>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    {EXAMPLE_PROMPTS.map((example, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleApplyExample(example)}
                                            className="px-3 py-2 text-left text-xs border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors"
                                        >
                                            <span className="font-medium text-slate-700 block">{example.name}</span>
                                            <span className="text-slate-400 truncate block">{example.prompt.slice(0, 30)}...</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
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
