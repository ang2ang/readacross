import OpenAI from 'openai';
import type { TranslationOptions } from '../types/index.js';

const REQUEST_TIMEOUT_MS = 45000;
const STREAM_IDLE_TIMEOUT_MS = 15000;

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
    resolvedBaseUrl: string,
    abortReason?: unknown
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

    if (error.name === 'AbortError') {
        const message = error.message || '';
        const reasonText = typeof abortReason === 'string'
            ? abortReason
            : abortReason instanceof Error
                ? abortReason.message
                : '';
        if (
            message.includes('timed out') ||
            message.includes('timeout') ||
            reasonText.includes('timed out') ||
            reasonText.includes('timeout')
        ) {
            return new Error(
                `The translation request timed out while waiting for the Ollama response stream from ${new URL(resolvedBaseUrl).origin}.`
            );
        }
    }

    return error;
}

function createRequestController(signal?: AbortSignal): {
    signal: AbortSignal;
    abort: (reason?: string) => void;
    cleanup: () => void;
} {
    const controller = new AbortController();

    const onAbort = () => {
        const reason = typeof signal?.reason === 'string' ? signal.reason : 'Aborted';
        controller.abort(new DOMException(reason, 'AbortError'));
    };

    if (signal) {
        if (signal.aborted) {
            onAbort();
        } else {
            signal.addEventListener('abort', onAbort, { once: true });
        }
    }

    return {
        signal: controller.signal,
        abort: (reason = 'Request timed out') => {
            if (!controller.signal.aborted) {
                controller.abort(new DOMException(reason, 'AbortError'));
            }
        },
        cleanup: () => {
            signal?.removeEventListener('abort', onAbort);
        }
    };
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
    const requestController = createRequestController(signal);

    const client = new OpenAI({
        apiKey: apiKey || 'dummy-key',
        baseURL: resolvedBaseUrl,
        dangerouslyAllowBrowser: true, // Needed for frontend usage (web or extension popup)
    });

    let fullTranslation = '';
    let requestTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let streamIdleTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const resetStreamIdleTimeout = () => {
        if (streamIdleTimeoutId) {
            clearTimeout(streamIdleTimeoutId);
        }
        streamIdleTimeoutId = setTimeout(() => {
            requestController.abort('Response stream timed out');
        }, STREAM_IDLE_TIMEOUT_MS);
    };

    requestTimeoutId = setTimeout(() => {
        requestController.abort('Request timed out');
    }, REQUEST_TIMEOUT_MS);

    const isOllamaProvider = provider === 'local' || provider === 'hosted';
    const shouldUseStreaming = !isOllamaProvider;
    const requestOptions = { signal: requestController.signal };
    const requestBody = {
        model,
        messages: [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: text }
        ],
        stream: shouldUseStreaming,
        temperature,
        ...(isOllamaProvider ? { think: false } : {})
    };

    try {
        if (shouldUseStreaming) {
            const response = await client.chat.completions.create(
                { ...requestBody, stream: true },
                requestOptions
            );
            resetStreamIdleTimeout();

            for await (const chunk of response) {
                if (requestController.signal.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }

                resetStreamIdleTimeout();
                const content = chunk.choices[0]?.delta?.content || '';
                if (content && onStream) {
                    onStream(content);
                }
                fullTranslation += content;
            }
        } else {
            const response = await client.chat.completions.create(
                { ...requestBody, stream: false },
                requestOptions
            );
            const content = response.choices[0]?.message?.content;
            fullTranslation = typeof content === 'string'
                ? content
                : Array.isArray(content)
                    ? (content as Array<{ type?: string; text?: string }>)
                        .filter(item => item.type === 'text' && typeof item.text === 'string')
                        .map(item => item.text as string)
                        .join('')
                    : '';

            if (fullTranslation && onStream) {
                onStream(fullTranslation);
            }
        }
    } catch (error) {
        throw normalizeProviderError(error, provider, resolvedBaseUrl, requestController.signal.reason);
    } finally {
        if (requestTimeoutId) {
            clearTimeout(requestTimeoutId);
        }
        if (streamIdleTimeoutId) {
            clearTimeout(streamIdleTimeoutId);
        }
        requestController.cleanup();
    }

    return fullTranslation;
};
