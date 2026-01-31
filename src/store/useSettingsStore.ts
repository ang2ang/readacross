import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Provider = 'deepseek' | 'openai';
export type PromptStyle = 'General' | 'Academic' | 'Create' | 'Philosophical' | 'Custom';

interface SettingsState {
    provider: Provider;
    apiKey: string;
    baseUrl: string;
    model: string;
    promptStyle: PromptStyle;
    customPrompt: string;
    targetLanguage: string;
    temperature: number;

    setApiKey: (key: string) => void;
    setBaseUrl: (url: string) => void;
    setProvider: (provider: Provider) => void;
    setModel: (model: string) => void;
    setPromptStyle: (style: PromptStyle) => void;
    setCustomPrompt: (prompt: string) => void;
    setTargetLanguage: (language: string) => void;
    setTemperature: (temperature: number) => void;
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
            temperature: 1.3,

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
            setTemperature: (temperature) => set({ temperature }),
        }),
        {
            name: 'readacross-settings',
        }
    )
);
