/**
 * Cloudflare Pages Function: OpenAI-compatible proxy to private Ollama instance.
 *
 * Routes:
 *   GET  /api/openai/models          → ${OLLAMA_PRIVATE_BASE_URL}/v1/models
 *   POST /api/openai/chat/completions → ${OLLAMA_PRIVATE_BASE_URL}/v1/chat/completions
 *
 * This proxy:
 *   1. Adds Cloudflare Access headers (CF-Access-Client-Id / CF-Access-Client-Secret)
 *   2. Defaults `model` to env.OLLAMA_MODEL
 *   3. Injects `think: false` to disable thinking/reasoning mode for faster responses
 *   4. Sets a default max_tokens if not specified
 *   5. Transparently streams upstream responses back to the client
 *
 * Required environment variables / secrets:
 *   - OLLAMA_PRIVATE_BASE_URL  (e.g. "https://llm-origin.example.com")
 *   - OLLAMA_MODEL             (e.g. "qwen3.5:9b")
 *   - CF_ACCESS_CLIENT_ID      (Cloudflare Access service token client ID)
 *   - CF_ACCESS_CLIENT_SECRET  (Cloudflare Access service token client secret)
 */

// Type declarations for Cloudflare Pages Functions runtime
// (These are provided natively by Cloudflare at deploy time;
//  declared here so the file type-checks standalone.)
type PagesFunction<E = unknown> = (
  context: {
    request: Request;
    env: E;
    params: Record<string, string | string[]>;
    next: () => Promise<Response>;
    data: Record<string, unknown>;
  }
) => Response | Promise<Response>;

interface Env {
  OLLAMA_PRIVATE_BASE_URL: string;
  OLLAMA_MODEL: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
}

// ---------------------------------------------------------------------------
// think: false — WHY THIS IS IMPORTANT
// ---------------------------------------------------------------------------
// The local model (e.g. qwen3.5) defaults to "thinking" mode, which adds
// significant latency (often 5-15 s extra) for lightweight tasks such as
// translation, word-lookup, and short Q&A.  Setting `think: false` bypasses
// the chain-of-thought reasoning step and yields much faster responses.
// This flag is injected server-side so the frontend never needs to know
// about it.  If reasoning mode is ever needed, toggle this constant.
const FORCE_THINK_DISABLED = true;

// Default max_tokens when the client does not specify one.
const DEFAULT_MAX_TOKENS = 4096;

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  // ---- Validate required env vars ----
  if (!env.OLLAMA_PRIVATE_BASE_URL) {
    return new Response(
      JSON.stringify({ error: "Server misconfiguration: OLLAMA_PRIVATE_BASE_URL is not set" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- Determine upstream path from the catch-all [[path]] param ----
  // params.path is an array for catch-all routes, e.g. ["models"] or ["chat", "completions"]
  const subPath = Array.isArray(params.path) ? params.path.join("/") : (params.path as string || "");
  const upstreamBase = env.OLLAMA_PRIVATE_BASE_URL.trim().replace(/\/+$/, "");
  const upstreamUrl = `${upstreamBase}/v1/${subPath}`;

  // ---- Build upstream headers ----
  const upstreamHeaders = new Headers();
  upstreamHeaders.set("Content-Type", "application/json");
  // Some strict upstream rules (like CF Bot Fight Mode) drop requests without User-Agent
  upstreamHeaders.set("User-Agent", "ReadAcross-Pages-Proxy/1.0");

  // Attach Cloudflare Access service-token credentials
  if (env.CF_ACCESS_CLIENT_ID) {
    upstreamHeaders.set("CF-Access-Client-Id", env.CF_ACCESS_CLIENT_ID.trim());
  }
  if (env.CF_ACCESS_CLIENT_SECRET) {
    upstreamHeaders.set("CF-Access-Client-Secret", env.CF_ACCESS_CLIENT_SECRET.trim());
  }

  // Propagate Authorization header if the client sends one (for BYOK providers)
  const clientAuth = request.headers.get("Authorization");
  if (clientAuth) {
    upstreamHeaders.set("Authorization", clientAuth);
  }

  // ---- Handle GET requests (e.g. /models) ----
  if (request.method === "GET") {
    const upstreamResp = await fetch(upstreamUrl, {
      method: "GET",
      headers: upstreamHeaders,
    });

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: {
        "Content-Type": upstreamResp.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // ---- Handle OPTIONS (CORS preflight) ----
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // ---- Handle POST requests (e.g. /chat/completions) ----
  if (request.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Default model to env.OLLAMA_MODEL if not specified
    if (!body.model && env.OLLAMA_MODEL) {
      body.model = env.OLLAMA_MODEL.trim();
    }

    // -------------------------------------------------------------------
    // Inject think: false
    // See comment at top — disables slow reasoning mode for lightweight
    // translation / lookup tasks.  Change FORCE_THINK_DISABLED to toggle.
    // -------------------------------------------------------------------
    if (FORCE_THINK_DISABLED && body.think === undefined) {
      body.think = false;
    }

    // Default max_tokens if not provided
    if (body.max_tokens === undefined && body.max_completion_tokens === undefined) {
      body.max_tokens = DEFAULT_MAX_TOKENS;
    }

    const upstreamResp = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(body),
    });

    // Determine if this is a streaming response
    const contentType = upstreamResp.headers.get("Content-Type") || "";
    const isStreaming = contentType.includes("text/event-stream") || body.stream === true;

    const responseHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
    };

    if (isStreaming) {
      responseHeaders["Content-Type"] = "text/event-stream";
      responseHeaders["Cache-Control"] = "no-cache";
      responseHeaders["Connection"] = "keep-alive";
    } else {
      responseHeaders["Content-Type"] = "application/json";
    }

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: responseHeaders,
    });
  }

  // ---- Unsupported method ----
  return new Response(
    JSON.stringify({ error: `Method ${request.method} not allowed` }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
};
