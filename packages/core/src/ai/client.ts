import OpenAI from 'openai';
import type { TranslationOptions } from '../types/index.js';

/**
 * Resolve a potentially relative baseUrl to an absolute URL.
 * The OpenAI SDK internally calls `new URL(path, baseURL)` which requires
 * an absolute URL as the base — a relative path like '/api/openai' will
 * throw "Failed to construct 'URL': Invalid URL".
 */
function resolveBaseUrl(baseUrl: string | undefined): string {
    if (!baseUrl) {
        throw new Error('Translation baseUrl is empty or undefined. Please check your provider settings.');
    }

    // Already an absolute URL (http:// or https://) — use as-is
    if (/^https?:\/\//i.test(baseUrl)) {
        return baseUrl;
    }

    // Relative path (e.g. '/api/openai') — prepend current origin in browser environments
    if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`;
    }

    // Not in a browser and not absolute — cannot resolve
    throw new Error(
        `Cannot resolve relative baseUrl "${baseUrl}" — no window.location.origin available. ` +
        'Use an absolute URL (e.g. https://example.com/api/openai).'
    );
}

export const translateText = async (
    text: string,
    options: TranslationOptions
): Promise<string> => {
    const { provider, apiKey, baseUrl, model, temperature, systemPrompt, signal, onStream } = options;

    const resolvedBaseUrl = resolveBaseUrl(baseUrl);

    const client = new OpenAI({
        apiKey: apiKey || 'dummy-key',
        baseURL: resolvedBaseUrl,
        dangerouslyAllowBrowser: true, // Needed for frontend usage (web or extension popup)
    });

    let fullTranslation = '';

    // For 'hosted' provider, think:false is injected server-side by the proxy.
    // For 'local' provider (used by extension), we still send think:false client-side.
    const requestOptions = provider === 'local'
        ? { signal, extraBody: { think: false } }
        : { signal };

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

