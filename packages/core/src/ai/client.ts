import OpenAI from 'openai';
import type { TranslationOptions } from '../types';

export const translateText = async (
    text: string,
    options: TranslationOptions
): Promise<string> => {
    const { apiKey, baseUrl, model, temperature, systemPrompt, signal, onStream } = options;

    if (!apiKey) {
        throw new Error('API Key is required.');
    }

    const client = new OpenAI({
        apiKey,
        baseURL: baseUrl,
        dangerouslyAllowBrowser: true, // Needed for frontend usage (web or extension popup)
    });

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
        { signal }
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
