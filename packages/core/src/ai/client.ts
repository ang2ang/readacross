import OpenAI from 'openai';
import type { TranslationOptions } from '../types';

export const translateText = async (
    text: string,
    options: TranslationOptions
): Promise<string> => {
    const { provider, apiKey, baseUrl, model, temperature, systemPrompt, signal, onStream } = options;

    const client = new OpenAI({
        apiKey: apiKey || 'dummy-key',
        baseURL: baseUrl,
        dangerouslyAllowBrowser: true, // Needed for frontend usage (web or extension popup)
    });

    const requestOptions: any = {
        signal,
    };

    // If local provider and explicitly wanted, we inject think: false
    // Most local proxies or custom OpenAI wrappers mapping Qwen2.5/DeepSeek-R1 support this
    if (provider === 'local') {
        requestOptions.extra_body = { think: false };
    }

    let fullTranslation = '';

    const response = await client.chat.completions.create(
        {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            stream: true,
            temperature,
        },
        requestOptions
    );

    for await (const chunk of response) {
        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        const content = chunk.choices[0]?.delta?.content || '';
        if (content && onStream) {
            onStream(content);
        }
        fullTranslation += content;
    }

    return fullTranslation;
};
