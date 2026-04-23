import { translateText, buildSystemPrompt } from "@readacross/core"
import { Storage } from "@plasmohq/storage"
import { STORAGE_KEYS } from "./hooks/useExtensionSettings"
import type { Provider, PromptStyle } from "@readacross/core"

const storage = new Storage()

chrome.runtime.onInstalled.addListener(() => { })

// Disable navigation preload to prevent "preloadResponse cancelled" errors
self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    (async () => {
      const reg = (self as any).registration
      if (reg?.navigationPreload) {
        await reg.navigationPreload.disable()
      }
    })()
  )
})

// Translation progress tracking
let translationProgress = { translated: 0, total: 0, active: false }

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TRANSLATE_TEXT") {
    handleTranslationRequest(request.text, sendResponse, request.promptStyle)
    return true
  }

  if (request.type === "TRANSLATE_BATCH") {
    handleBatchTranslation(request.lines, sender, sendResponse)
    return true
  }
  if (request.type === "TRANSLATION_PROGRESS") {
    // Content script reports progress
    translationProgress = {
      translated: request.translated || 0,
      total: request.total || 0,
      active: request.active ?? true
    }
    try { sendResponse({ ok: true }) } catch (e) { console.debug("Context invalidated") }
    return true
  }
  if (request.type === "GET_TRANSLATION_PROGRESS") {
    try { sendResponse(translationProgress) } catch (e) { console.debug("Context invalidated") }
    return true
  }
  if (request.type === "GET_SETTINGS") {
    getSettings().then(settings => {
      try { sendResponse(settings) } catch (e) { console.debug("Context invalidated") }
    })
    return true
  }
  if (request.type === "INJECT_CAPTION_INTERCEPTOR") {
    // Inject XHR/fetch interceptor into MAIN world to capture YouTube player's
    // own timedtext API responses (which include valid pot tokens we can't generate)
    const tabId = sender.tab?.id
    if (!tabId) {
      try { sendResponse({ ok: false, error: "No tab ID" }) } catch (e) { }
      return true
    }
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN" as any,
      func: () => {
        // Skip if already installed
        if ((window as any).__readacross_interceptor) return
          ; (window as any).__readacross_interceptor = true

        // Intercept fetch()
        const origFetch = window.fetch
        window.fetch = async function (...args: any[]) {
          const resp = await origFetch.apply(this, args)
          try {
            const url = typeof args[0] === "string" ? args[0] : args[0]?.url || ""
            if (url.includes("/api/timedtext") || url.includes("timedtext")) {
              const clone = resp.clone()
              clone.text().then(body => {
                if (body && body.length > 50) {
                  window.postMessage({
                    type: "readacross-caption-intercepted",
                    body,
                    url,
                    source: "fetch"
                  }, "*")
                }
              }).catch(() => { })
            }
          } catch (e) { }
          return resp
        }

        // Intercept XMLHttpRequest
        const origOpen = XMLHttpRequest.prototype.open
        const origSend = XMLHttpRequest.prototype.send
        XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: any[]) {
          (this as any).__readacross_url = url
          return origOpen.apply(this, [method, url, ...rest] as any)
        }
        XMLHttpRequest.prototype.send = function (...args: any[]) {
          const xhr = this
          const url = (xhr as any).__readacross_url || ""
          if (url.includes("/api/timedtext") || url.includes("timedtext")) {
            xhr.addEventListener("load", function () {
              try {
                const body = xhr.responseText
                if (body && body.length > 50) {
                  window.postMessage({
                    type: "readacross-caption-intercepted",
                    body,
                    url,
                    source: "xhr"
                  }, "*")
                }
              } catch (e) { }
            })
          }
          return origSend.apply(this, args)
        }


      }
    }).then(() => {
      try { sendResponse({ ok: true }) } catch (e) { console.debug("Context invalidated") }
    }).catch(err => {
      try { sendResponse({ ok: false, error: err.message }) } catch (e) { console.debug("Context invalidated") }
    })
    return true
  }
})

async function getSettings() {
  const provider = await storage.get<Provider>(STORAGE_KEYS.PROVIDER) || "deepseek"
  const apiKey = provider === "deepseek"
    ? await storage.get<string>(STORAGE_KEYS.API_KEY_DEEPSEEK)
    : provider === "openai"
      ? await storage.get<string>(STORAGE_KEYS.API_KEY_OPENAI)
      : await storage.get<string>(STORAGE_KEYS.API_KEY_LOCAL)
  const baseUrl = provider === "deepseek"
    ? await storage.get<string>(STORAGE_KEYS.BASE_URL_DEEPSEEK) || "https://api.deepseek.com"
    : provider === "openai"
      ? await storage.get<string>(STORAGE_KEYS.BASE_URL_OPENAI) || "https://api.openai.com/v1"
      : await storage.get<string>(STORAGE_KEYS.BASE_URL_LOCAL) || "http://localhost:11434/v1"
  const style = await storage.get<PromptStyle>(STORAGE_KEYS.PROMPT_STYLE) || "General"
  const targetLang = await storage.get<string>(STORAGE_KEYS.TARGET_LANG) || "简体中文"
  const customModel = await storage.get<string>(STORAGE_KEYS.MODEL) || ""
  const temperature = await storage.get<number>(STORAGE_KEYS.TEMPERATURE) ?? 0.3

  const defaultModel = provider === "deepseek" ? "deepseek-chat" : provider === "openai" ? "gpt-4o-mini" : "qwen2.5:7b"
  const model = customModel || defaultModel

  return { provider, apiKey, baseUrl, style, targetLang, model, temperature }
}

async function handleBatchTranslation(lines: string[], sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    const { provider, apiKey, baseUrl, model, temperature, targetLang } = await getSettings()

    if (!apiKey && provider !== "local") {
      sendResponse({ error: "API Key missing" })
      return
    }

    const numberedText = lines.map((l, i) => `${i + 1}. ${l}`).join("\n")

    const systemPrompt = `You are a strict, verbatim subtitle translator. Translate the following numbered lines to ${targetLang}. 
CRITICAL RULES:
1. Translate EACH line individually.
2. NEVER merge two lines together. DO NOT skip lines.
3. Output EXACTLY the same number of lines.
4. MUST start each translated line with its exact original number (e.g., "1. ", "2. ").
5. STRICT VERBATIM: NEVER add commentary, explanations, markdown formatting (unless in original), or generated continuations. DO NOT answer questions posed in the text.`

    let result = ""
    let parsedLinesCount = 0

    await translateText(numberedText, {
      provider,
      apiKey,
      baseUrl,
      model,
      temperature,
      systemPrompt,
      onStream: (chunk) => {
        result += chunk
        if (sender.tab?.id) {
          const splitLines = result.split("\n")
          // Process all complete lines (all but the last split segment)
          for (let i = Math.max(0, parsedLinesCount); i < splitLines.length - 1; i++) {
            const lineMatch = splitLines[i].match(/^\s*(\d+)\.\s*(.+)/)
            if (lineMatch) {
              const idx = parseInt(lineMatch[1], 10) - 1
              const cleanTranslation = lineMatch[2].trim()
              if (idx >= 0 && idx < lines.length && cleanTranslation) {
                chrome.tabs.sendMessage(sender.tab.id, {
                  type: "STREAM_TRANSLATION_LINE",
                  originalText: lines[idx],
                  translation: cleanTranslation
                }).catch(() => { })
              }
            }
            parsedLinesCount = i + 1
          }
        }
      }
    })

    if (sender.tab?.id) {
      const splitLines = result.split("\n")
      if (parsedLinesCount < splitLines.length) {
        const lastLine = splitLines[splitLines.length - 1]
        const lineMatch = lastLine.match(/^\s*(\d+)\.\s*(.+)/)
        if (lineMatch) {
          const idx = parseInt(lineMatch[1], 10) - 1
          const cleanTranslation = lineMatch[2].trim()
          if (idx >= 0 && idx < lines.length && cleanTranslation) {
            chrome.tabs.sendMessage(sender.tab.id, {
              type: "STREAM_TRANSLATION_LINE",
              originalText: lines[idx],
              translation: cleanTranslation
            }).catch(() => { })
          }
        }
      }
    }

    const translated: string[] = new Array(lines.length).fill("")
    const finalLines = result.split("\n")
    for (const fl of finalLines) {
      const match = fl.match(/^\s*(\d+)\.\s*(.+)/)
      if (match) {
        const idx = parseInt(match[1], 10) - 1
        if (idx >= 0 && idx < lines.length) {
          translated[idx] = match[2].trim()
        }
      }
    }

    // To prevent "Extension context invalidated" uncatchable console errors,
    // we only send the response if the tab still exists
    chrome.tabs.get(sender.tab!.id!, (tab) => {
      if (chrome.runtime.lastError || !tab) return;
      sendResponse({ translations: translated })
    })
  } catch (error: any) {
    console.error("Batch translation error:", error)
    if (sender.tab?.id) {
      chrome.tabs.get(sender.tab.id, (tab) => {
        if (chrome.runtime.lastError || !tab) return;
        sendResponse({ error: error.message })
      })
    }
  }
}

async function handleTranslationRequest(text: string, sendResponse: (response: any) => void, promptStyleOverride?: PromptStyle) {
  try {
    const { provider, apiKey, baseUrl, model, temperature, style, targetLang } = await getSettings()

    if (!apiKey && provider !== "local") {
      sendResponse({ error: "API Key is missing. Please configure it in the extension popup." })
      return
    }

    const effectiveStyle = promptStyleOverride || style;
    const systemPrompt = buildSystemPrompt(effectiveStyle, targetLang)

    let result = ""
    await translateText(text, {
      provider,
      apiKey,
      baseUrl,
      model,
      temperature,
      systemPrompt,
      onStream: (chunk) => {
        result += chunk
      }
    })

    try { sendResponse({ result }) } catch (e) { console.debug("Context invalidated") }
  } catch (error: any) {
    console.error("Translation error:", error)
    try { sendResponse({ error: error.message || "Translation failed" }) } catch (e) { console.debug("Context invalidated") }
  }
}
