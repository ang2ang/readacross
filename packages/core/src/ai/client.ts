import OpenAI from 'openai';
import type { TranslationOptions } from '../types/index.js';

function normalizeLocalOllamaBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.trim().replace(/\/+$/, '');

    if (!/^https?:\/\//i.test(trimmed)) {
        return baseUrl;
    }

    if (/\/(v1|api\/openai)$/i.test(trimmed)) {
        return trimmed;
    }

    if (/\/api$/i.test(trimmed)) {
        return `${trimmed}/openai`;
    }

    return `${trimmed}/v1`;
}

function isCrossOriginBrowserRequest(resolvedBaseUrl: string): boolean {
    if (typeof window === 'undefined' || !window.location?.origin) {
        return false;
    }

    try {
        return new URL(resolvedBaseUrl).origin !== window.location.origin;
    } catch {
        return false;
    }
}

function normalizeProviderError(
    error: unknown,
    provider: TranslationOptions['provider'],
    resolvedBaseUrl: string
): Error {
    if (!(error instanceof Error)) {
        return new Error(String(error));
    }

    if (provider === 'local' && isCrossOriginBrowserRequest(resolvedBaseUrl)) {
        const message = error.message || '';
        if (message.includes('405')) {
            return new Error(
                `Remote Ollama returned 405. This is usually the browser's CORS preflight (OPTIONS) being rejected by the remote host or reverse proxy. ` +
                `Use the hosted proxy, or enable CORS/OPTIONS on ${new URL(resolvedBaseUrl).origin}.`
            );
        }
    }

    return error;
}

/**
 * Resolve a potentially relative baseUrl to an absolute URL.
 * The OpenAI SDK internally calls `new URL(path, baseURL)` which requires
 * an absolute URL as the base — a relative path like '/api/openai' will
 * throw "Failed to construct 'URL': Invalid URL".
 */
function resolveBaseUrl(baseUrl: string | undefined, provider?: TranslationOptions['provider']): string {
    if (!baseUrl) {
        throw new Error('Translation baseUrl is empty or undefined. Please check your provider settings.');
    }

    const normalizedBaseUrl = provider === 'local'
        ? normalizeLocalOllamaBaseUrl(baseUrl)
        : baseUrl.trim();

    // Already an absolute URL (http:// or https://) — use as-is
    if (/^https?:\/\//i.test(normalizedBaseUrl)) {
        return normalizedBaseUrl;
    }

    // Relative path (e.g. '/api/openai') — prepend current origin in browser environments
    if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}${normalizedBaseUrl.startsWith('/') ? '' : '/'}${normalizedBaseUrl}`;
    }

    // Not in a browser and not absolute — cannot resolve
    throw new Error(
        `Cannot resolve relative baseUrl "${normalizedBaseUrl}" — no window.location.origin available. ` +
        'Use an absolute URL (e.g. https://example.com/api/openai).'
    );
}

export const translateText = async (
    text: string,
    options: TranslationOptions
): Promise<string> => {
    const { provider, apiKey, baseUrl, model, temperature, systemPrompt, signal, onStream } = options;

    const resolvedBaseUrl = resolveBaseUrl(baseUrl, provider);

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

    try {
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
    } catch (error) {
        throw normalizeProviderError(error, provider, resolvedBaseUrl);
    }

    return fullTranslation;
};
