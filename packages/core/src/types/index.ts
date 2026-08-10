export type Provider = 'deepseek' | 'openai' | 'ollama' | 'local' | 'hosted';
export type PromptStyle = 'General' | 'Academic' | 'Create' | 'Philosophical' | 'Custom';

export interface CustomPrompt {
    id: string;
    name: string;
    prompt: string;
}

export interface TranslationOptions {
    provider?: Provider;
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    systemPrompt: string;
    signal?: AbortSignal;
    onStream?: (chunk: string) => void;
}
