import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Provider, PromptStyle, CustomPrompt } from '@readacross/core';

interface SettingsState {
    provider: Provider;
    apiKey: string;
    baseUrl: string;
    model: string;
    promptStyle: PromptStyle;
    customPrompts: CustomPrompt[];
    selectedCustomPromptId: string | null;
    targetLanguage: string;
    temperature: number;

    setApiKey: (key: string) => void;
    setBaseUrl: (url: string) => void;
    setProvider: (provider: Provider) => void;
    setModel: (model: string) => void;
    setPromptStyle: (style: PromptStyle) => void;
    setTargetLanguage: (language: string) => void;
    setTemperature: (temperature: number) => void;

    // Custom prompt management
    addCustomPrompt: (prompt: Omit<CustomPrompt, 'id'>) => void;
    updateCustomPrompt: (id: string, updates: Partial<Omit<CustomPrompt, 'id'>>) => void;
    deleteCustomPrompt: (id: string) => void;
    selectCustomPrompt: (id: string | null) => void;
    getActiveCustomPrompt: () => string;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set, get) => ({
            provider: 'deepseek',
            apiKey: '',
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-chat',
            promptStyle: 'General',
            customPrompts: [],
            selectedCustomPromptId: null,
            targetLanguage: '简体中文',
            temperature: 1.3,

            setApiKey: (apiKey) => set({ apiKey }),
            setBaseUrl: (baseUrl) => set({ baseUrl }),
            setProvider: (provider) => set({
                provider,
                baseUrl: provider === 'deepseek' ? 'https://api.deepseek.com' : provider === 'openai' ? 'https://api.openai.com/v1' : 'http://localhost:11434/v1',
                model: provider === 'deepseek' ? 'deepseek-chat' : provider === 'openai' ? 'gpt-4o' : 'qwen2.5:7b'
            }),
            setModel: (model) => set({ model }),
            setPromptStyle: (promptStyle) => set({ promptStyle }),
            setTargetLanguage: (targetLanguage) => set({ targetLanguage }),
            setTemperature: (temperature) => set({ temperature }),

            addCustomPrompt: (prompt) => set((state) => {
                const newPrompt: CustomPrompt = {
                    id: `prompt_${Date.now()}`,
                    ...prompt,
                };
                return {
                    customPrompts: [...state.customPrompts, newPrompt],
                    selectedCustomPromptId: newPrompt.id,
                };
            }),

            updateCustomPrompt: (id, updates) => set((state) => ({
                customPrompts: state.customPrompts.map((p) =>
                    p.id === id ? { ...p, ...updates } : p
                ),
            })),

            deleteCustomPrompt: (id) => set((state) => {
                const newPrompts = state.customPrompts.filter((p) => p.id !== id);
                return {
                    customPrompts: newPrompts,
                    selectedCustomPromptId:
                        state.selectedCustomPromptId === id
                            ? (newPrompts.length > 0 ? newPrompts[0].id : null)
                            : state.selectedCustomPromptId,
                };
            }),

            selectCustomPrompt: (id) => set({ selectedCustomPromptId: id }),

            getActiveCustomPrompt: () => {
                const state = get();
                if (state.promptStyle !== 'Custom' || !state.selectedCustomPromptId) {
                    return '';
                }
                const prompt = state.customPrompts.find((p) => p.id === state.selectedCustomPromptId);
                return prompt?.prompt ?? '';
            },
        }),
        {
            name: 'readacross-settings',
        }
    )
);
