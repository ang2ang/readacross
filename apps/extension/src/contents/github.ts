import type { PlasmoCSConfig } from "plasmo"
import { Storage } from "@plasmohq/storage"

export const config: PlasmoCSConfig = {
  matches: ["https://github.com/*"]
}

// Store original blocks to avoid re-translating
const processedBlocks = new WeakSet<HTMLElement>()

// Cache for instant translation
// Key: normalized original text, Value: translated text
const translationCache = new Map<string, string>()

// Concurrency Queue to prevent network errors
class TranslationQueue {
  private concurrency = 3;
  private running = 0;
  private queue: (() => void)[] = [];

  add(task: () => Promise<void>) {
    this.queue.push(() => {
      this.running++;
      task().finally(() => {
        this.running--;
        this.next();
      });
    });
    this.next();
  }

  private next() {
    if (this.running >= this.concurrency) return;
    const task = this.queue.shift();
    if (task) task();
  }

  clear() {
    this.queue = [];
  }
}
const apiQueue = new TranslationQueue()

// State
let isTranslationActive = false
let translationState = { translated: 0, total: 0, active: false }
let nextObsidianBlockIndex = 0

// Observers
let intersectionObserver: IntersectionObserver | null = null
let mutationObserver: MutationObserver | null = null
let recoveryInterval: number | null = null

function reportProgress() {
  try {
    chrome.runtime.sendMessage({
      type: "TRANSLATION_PROGRESS",
      translated: translationState.translated,
      total: translationState.total,
      active: translationState.active
    }).catch((e) => {
      // Ignore "Receiving end does not exist" and context invalidated errors
      if (!e?.message?.includes("Receiving end does not exist") && !e?.message?.includes("context invalidated")) {
        console.debug("Progress report failed", e)
      }
    })
  } catch { }
}

// Inject global styles for loading indicators
function injectTranslationStyles() {
  if (document.getElementById("readacross-github-styles")) return
  const style = document.createElement("style")
  style.id = "readacross-github-styles"
  style.textContent = `
    @keyframes readacross-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .readacross-loading {
      color: transparent !important;
      background: linear-gradient(90deg, #e8e0f3 25%, #d4c5ec 50%, #e8e0f3 75%);
      background-size: 200% 100%;
      animation: readacross-shimmer 1.5s ease-in-out infinite;
      border-radius: 4px;
      margin-top: 2px;
      margin-bottom: 2px;
      padding: 2px 6px;
      border-left: 2px solid #c4b5d9;
      font-size: 0.9em;
      line-height: 1.5;
      min-height: 1.2em;
    }
    .readacross-translation {
      color: #7c3aed;
      font-size: 0.9em;
      line-height: 1.5;
      margin-top: 4px;
      margin-bottom: 4px;
      border-left: 2px solid #8b5cf6;
      padding-left: 8px;
      white-space: pre-wrap;
      background: transparent;
      animation: readacross-fadein 0.3s ease;
      display: block;
      font-family: inherit;
    }
    .readacross-error {
      color: #dc2626;
      font-size: 0.85em;
      line-height: 1.4;
      margin-top: 2px;
      margin-bottom: 2px;
      border-left: 2px solid #fca5a5;
      padding-left: 8px;
      opacity: 0.8;
      display: block;
    }
    @keyframes readacross-fadein {
      from { opacity: 0; transform: translateY(-2px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `
  document.head.appendChild(style)
}

function createLoadingPlaceholder(block: HTMLElement): HTMLElement {
  const placeholder = document.createElement("span")
  placeholder.className = "readacross-loading"
  placeholder.textContent = "Translating..."
  placeholder.setAttribute("data-readacross-type", "loading")

  block.appendChild(placeholder)
  return placeholder
}

// Precise extraction that preserves \n natively
function getOriginalInnerText(el: HTMLElement): string {
  const wrappers = el.querySelectorAll<HTMLElement>(':scope > [data-readacross-type]');
  const displays: string[] = [];

  // Temporarily hide injected translations
  wrappers.forEach(w => {
    displays.push(w.style.display);
    w.style.display = 'none';
  });

  // Get text content (for code lines, textContent is usually sufficient and avoids layout thrashing)
  let text = el.textContent || '';

  // Restore translations display
  wrappers.forEach((w, i) => {
    w.style.display = displays[i];
  });

  return text.trim();
}

/**
 * Returns true if the text is just a URL
 */
function isPureUrl(text: string): boolean {
  if (/[ \t]/.test(text.trim())) return false
  const t = text.replace(/[\r\n\u200B-\u200D\uFEFF]/g, '')
  if (t.length < 4 || t.length > 200) return false
  return /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*|…|\.\.\.)?$/i.test(t)
}

/**
 * Specifically for GitHub code, skip lines that are comments or very short symbols
 */
function shouldSkipCodeLine(text: string): boolean {
  // Skip very short lines or symbols like pure brackets
  if (text.length < 5) return true;
  // Skip pure numbers or hex codes
  if (/^[\d#xX]+$/.test(text)) return true;
  return false;
}

async function translateBlock(block: HTMLElement) {
  if (processedBlocks.has(block)) return

  const rawText = getOriginalInnerText(block)
  if (!rawText) return

  // Safety limits
  if (rawText.length > 4000) {
    processedBlocks.add(block)
    block.setAttribute('data-readacross-processed', 'true')
    return
  }

  const normalizedKey = rawText
  const text = rawText
  const obsidianBlockIndex = nextObsidianBlockIndex++

  if (isPureUrl(text) || shouldSkipCodeLine(text)) {
    processedBlocks.add(block)
    block.setAttribute('data-readacross-processed', 'true')
    translationCache.set(normalizedKey, '[NO_TRANSLATE]')
    translationState.translated++
    reportProgress()
    return
  }

  processedBlocks.add(block)
  block.setAttribute('data-readacross-processed', 'true')

  // Check cache first
  if (translationCache.has(normalizedKey)) {
    injectBlockTranslation(block, translationCache.get(normalizedKey)!)
    translationState.translated++
    reportProgress()
    return
  }

  // Create loading shimmer
  const placeholder = createLoadingPlaceholder(block)

  apiQueue.add(async () => {
    try {
      // Use the new promptStyleOverride feature
      const response = await chrome.runtime.sendMessage({
        type: "TRANSLATE_TEXT",
        text: text,
        promptStyle: "Code", // Or specifically "GitHub File" if you want to add that to core later
        assetContext: {
          sourceType: "extension-page",
          pageUrl: window.location.href,
          pageTitle: document.title,
          blockIndex: obsidianBlockIndex
        }
      })

      if (placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder)
      }

      if (response?.error) {
        console.warn("ReadAcross Error:", response.error)
        injectErrorIndicator(block, response.error)
        return
      }

      if (response?.result) {
        if (response.result.trim() === "[NO_TRANSLATE]") {
          translationCache.set(normalizedKey, "[NO_TRANSLATE]")
        } else {
          translationCache.set(normalizedKey, response.result)
          injectBlockTranslation(block, response.result)
        }
      }
    } catch (err: any) {
      if (placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder)
      }
      if (err?.message?.includes("Extension context invalidated") || err?.message?.includes("Receiving end does not exist")) return
      console.error("ReadAcross Messaging error:", err)
      injectErrorIndicator(block, err?.message || "Translation failed")
    } finally {
      translationState.translated++
      reportProgress()
    }
  })
}

function injectBlockTranslation(originalBlock: HTMLElement, translatedText: string) {
  if (translatedText === "[NO_TRANSLATE]") return

  if (originalBlock.querySelector(':scope > [data-readacross-type="translation"]')) {
    return
  }

  originalBlock.querySelectorAll(':scope > [data-readacross-type="loading"]').forEach(el => el.remove())

  const wrapper = document.createElement("span")
  wrapper.className = "readacross-translation"
  wrapper.textContent = translatedText
  wrapper.setAttribute("data-readacross-type", "translation")

  originalBlock.appendChild(wrapper)
}

function injectErrorIndicator(originalBlock: HTMLElement, errorMsg: string) {
  if (originalBlock.querySelector(':scope > [data-readacross-type="error"]')) {
    return
  }
  const wrapper = document.createElement("span")
  wrapper.className = "readacross-error"
  wrapper.textContent = `⚠ ${errorMsg}`
  wrapper.setAttribute("data-readacross-type", "error")
  originalBlock.appendChild(wrapper)
}

// -----------------------------------------------------------------------------
// GitHub specific DOM extraction
// -----------------------------------------------------------------------------

function getTranslatableBlocks(): HTMLElement[] {
  const nodesToTranslate: HTMLElement[] = []
  
  // GitHub displays file contents in different ways.
  // 1. The blob view (default for most code files): line-by-line using .react-file-line
  const codeLines = document.querySelectorAll('.react-file-line');
  codeLines.forEach(line => {
      // We process the line element itself
      const el = line as HTMLElement;
      if (el.getAttribute('data-readacross-processed') !== 'true' && !processedBlocks.has(el)) {
          // GitHub lines often contain spans for syntax highlighting, we can translate the whole line text
          nodesToTranslate.push(el);
      }
  })

  // 2. Markdown view (.markdown-body)
  const markdownContainers = document.querySelectorAll('.markdown-body');
  markdownContainers.forEach(container => {
      // For markdown, we need to extract paragraphs, lists, etc.
      const elements = container.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, th, td');
      elements.forEach(el => {
          const block = el as HTMLElement;
          if (block.getAttribute('data-readacross-processed') !== 'true' && !processedBlocks.has(block)) {
             nodesToTranslate.push(block)
          }
      })
  });
  
  // 3. Plain text files (<pre id="word-wrap"> etc)
  // Usually covered by .react-file-line now in new github UI, but good to have fallback
  
  return nodesToTranslate
}

function observeDOMChanges() {
  if (mutationObserver) mutationObserver.disconnect()

  mutationObserver = new MutationObserver((mutations) => {
    if (!isTranslationActive) return
    // Simple debounce
    setTimeout(() => scanAndQueueTranslation(), 300)
  })

  // Observe the main content area in GitHub specifically
  const targetNode = document.getElementById('repository-container-header') || document.body;
  mutationObserver.observe(targetNode.parentElement || document.body, {
    childList: true,
    subtree: true
  })
}

function scanAndQueueTranslation() {
  const newBlocks = getTranslatableBlocks()

  if (newBlocks.length === 0) return

  translationState.total += newBlocks.length
  translationState.active = true
  reportProgress()

  if (intersectionObserver) {
    newBlocks.forEach(block => intersectionObserver!.observe(block))
  }
}

function startPeriodicRecovery() {
  if (recoveryInterval) clearInterval(recoveryInterval)

  recoveryInterval = window.setInterval(() => {
    if (!isTranslationActive) return

    const processedElements = document.querySelectorAll('[data-readacross-processed="true"]')
    processedElements.forEach(block => {
      if (!block.isConnected) return

      const hasOverlay = block.querySelector(':scope > [data-readacross-type]')

      if (!hasOverlay) {
        const rawText = getOriginalInnerText(block as HTMLElement)
        const cached = translationCache.get(rawText)
        if (cached && cached !== "[NO_TRANSLATE]") {
          injectBlockTranslation(block as HTMLElement, cached)
        }
      }
    })
  }, 2000)
}

async function enableContinuousTranslation() {
  isTranslationActive = true
  nextObsidianBlockIndex = 0

  if (intersectionObserver) intersectionObserver.disconnect()

  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = entry.target as HTMLElement
        intersectionObserver!.unobserve(target)
        translateBlock(target)
      }
    })
  }, {
    root: null,
    rootMargin: '600px 0px',
    threshold: 0
  })

  scanAndQueueTranslation()
  observeDOMChanges()
  startPeriodicRecovery()
}

function disableContinuousTranslation() {
  isTranslationActive = false
  apiQueue.clear()
  if (intersectionObserver) intersectionObserver.disconnect()
  if (mutationObserver) mutationObserver.disconnect()
  if (recoveryInterval) {
    clearInterval(recoveryInterval)
    recoveryInterval = null
  }

  document.querySelectorAll('[data-readacross-type]').forEach(el => el.remove())
  document.querySelectorAll('[data-readacross-processed]').forEach(el => {
    el.removeAttribute('data-readacross-processed')
  })

  translationState = { translated: 0, total: 0, active: false }
  reportProgress()
}

async function toggleTranslation() {
  if (isTranslationActive) disableContinuousTranslation()
  else await enableContinuousTranslation()
}

window.addEventListener("keydown", (e) => {
  if (e.altKey && e.code === "KeyT") toggleTranslation()
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "START_TRANSLATION") {
    if (!isTranslationActive) {
      enableContinuousTranslation().then(() => sendResponse({ success: true }))
      return true
    }
    sendResponse({ success: true })
  }
  if (request.type === "STOP_TRANSLATION") {
    disableContinuousTranslation()
    sendResponse({ success: true })
  }
  if (request.type === "GET_TRANSLATION_STATE") {
    sendResponse({ isActive: isTranslationActive })
  }
})

injectTranslationStyles()

;(async () => {
  try {
    const storage = new Storage()
    const raw = await storage.get<string>("settings_always_translate_sites") ?? "[]"
    const sites: string[] = JSON.parse(raw)
    if (sites.includes("github.com") || sites.includes(window.location.hostname)) {
      if (document.readyState === "loading") {
        await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
      }
      await enableContinuousTranslation()
    }
  } catch (e) {
    console.warn("ReadAcross: could not read always-translate settings", e)
  }
})()
