/**
 * Cloudflare Pages Function: Ollama Cloud API proxy.
 *
 * Proxies browser requests to https://ollama.com/api/chat to bypass CORS.
 * The client sends the API key in the Authorization header; this proxy
 * forwards it to Ollama's API and streams back the response.
 *
 * Routes:
 *   POST /api/ollama/chat  → https://ollama.com/api/chat
 *   OPTIONS                → CORS preflight response
 */

type PagesFunction<E = unknown> = (
  context: {
    request: Request;
    env: E;
    params: Record<string, string | string[]>;
    next: () => Promise<Response>;
    data: Record<string, unknown>;
  }
) => Response | Promise<Response>;

interface Env {}

const OLLAMA_CLOUD_BASE = "https://ollama.com";
const UPSTREAM_TIMEOUT_MS = 60000;

function jsonResponse(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    },
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, params } = context;

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

  // ---- Determine upstream path from the catch-all [[path]] param ----
  const subPath = Array.isArray(params.path) ? params.path.join("/") : (params.path as string || "");
  const upstreamUrl = `${OLLAMA_CLOUD_BASE}/api/${subPath}`;

  // ---- Build upstream headers ----
  const upstreamHeaders = new Headers();
  upstreamHeaders.set("Content-Type", "application/json");
  upstreamHeaders.set("User-Agent", "ReadAcross-Ollama-Proxy/1.0");

  // Forward the client's Authorization header (Ollama API key)
  const clientAuth = request.headers.get("Authorization");
  if (clientAuth) {
    upstreamHeaders.set("Authorization", clientAuth);
  }

  // ---- Handle POST requests (e.g. /api/ollama/chat) ----
  if (request.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON in request body" }, 400);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let upstreamResp: Response;
    try {
      upstreamResp = await fetch(upstreamUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      return jsonResponse({ error: "Upstream fetch failed", details: String(e) }, 502);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!upstreamResp.ok) {
      const preview = (await upstreamResp.text()).trim().slice(0, 1000);
      return jsonResponse(
        { error: `Ollama Cloud returned ${upstreamResp.status}`, upstream_body: preview },
        upstreamResp.status
      );
    }

    const contentType = upstreamResp.headers.get("Content-Type") || "application/json";
    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({ error: `Method ${request.method} not allowed` }, 405);
};
