import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PromptStyle = 'General' | 'Academic' | 'Create' | 'Philosophical' | 'Custom';

interface SettingsState {
    provider: 'deepseek' | 'openai';
    apiKey: string;
    baseUrl: string;
    model: string;
    promptStyle: PromptStyle;
    customPrompt: string;
    targetLanguage: string;

    setApiKey: (key: string) => void;
    setBaseUrl: (url: string) => void;
    setProvider: (provider: 'deepseek' | 'openai') => void;
    setModel: (model: string) => void;
    setPromptStyle: (style: PromptStyle) => void;
    setCustomPrompt: (prompt: string) => void;
    setTargetLanguage: (language: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            provider: 'deepseek',
            apiKey: '',
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-chat',
            promptStyle: 'General',
            customPrompt: '',
            targetLanguage: '简体中文',

            setApiKey: (apiKey) => set({ apiKey }),
            setBaseUrl: (baseUrl) => set({ baseUrl }),
            setProvider: (provider) => set({
                provider,
                baseUrl: provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1',
                model: provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o'
            }),
            setModel: (model) => set({ model }),
            setPromptStyle: (promptStyle) => set({ promptStyle }),
            setCustomPrompt: (customPrompt) => set({ customPrompt }),
            setTargetLanguage: (targetLanguage) => set({ targetLanguage }),
        }),
        {
            name: 'readacross-settings',
        }
    )
);
