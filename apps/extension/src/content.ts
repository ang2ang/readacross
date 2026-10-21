import type { PlasmoCSConfig } from "plasmo"
import { franc } from "franc-min"
import { Storage } from "@plasmohq/storage"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: true
}

// Store original blocks to avoid re-translating (and tracking their processing state)
const processedBlocks = new WeakSet<HTMLElement>()

// Cache for instant translation of recycled DOM nodes (Virtual DOM / Infinite scroll)
// Key: translation settings fingerprint + original text, Value: translated text
const translationCache = new Map<string, string>()

// Concurrency Queue to prevent network errors (e.g. ERR_INSUFFICIENT_RESOURCES)
// when massive text-dense pages (like OPML or raw XML) trigger hundreds of requests.
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
let currentTargetLang = "简体中文" // Default, will be fetched on start
let currentCacheContext = "target=简体中文"

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
    }).catch(() => { })
  } catch { }
}

function getTranslationCacheKey(text: string): string {
  return `${currentCacheContext}\n${text}`
}

// Inject global styles for loading indicators
function injectTranslationStyles() {
  if (document.getElementById("readacross-content-styles")) return
  const parent = document.head || document.documentElement
  if (!parent) {
    document.addEventListener("DOMContentLoaded", injectTranslationStyles, { once: true })
    return
  }
  const style = document.createElement("style")
  style.id = "readacross-content-styles"
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
      margin-top: 6px;
      margin-bottom: 4px;
      padding: 6px 12px;
      border-left: 3px solid #c4b5d9;
      font-size: 0.9em;
      line-height: 1.5;
      min-height: 1.2em;
    }
    .readacross-translation {
      color: #7c3aed;
      font-size: 0.95em;
      line-height: 1.6;
      margin-top: 6px;
      margin-bottom: 8px;
      border-left: 3px solid #8b5cf6;
      padding-left: 12px;
      white-space: pre-wrap;
      background: transparent;
      animation: readacross-fadein 0.3s ease;
    }
    .readacross-error {
      color: #dc2626;
      font-size: 0.85em;
      line-height: 1.4;
      margin-top: 4px;
      margin-bottom: 4px;
      border-left: 3px solid #fca5a5;
      padding-left: 12px;
      opacity: 0.8;
    }
    @keyframes readacross-fadein {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `
  parent.appendChild(style)
}

function createLoadingPlaceholder(block: HTMLElement): HTMLElement {
  const placeholder = document.createElement("span")
  placeholder.className = "readacross-loading"
  placeholder.textContent = "Translating..."
  placeholder.setAttribute("data-readacross-type", "loading")
  placeholder.style.display = "block"

  block.appendChild(placeholder)

  return placeholder
}

// Quick extraction for determining if text expanded (no DOM reflows)
function getBlockTextWithoutTranslation(el: HTMLElement): string {
  let text = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).hasAttribute('data-readacross-type')) {
      continue;
    }
    text += child.textContent || '';
  }
  return text.trim().replace(/\s+/g, ' ');
}

// Precise extraction that preserves \n natively (triggers layout render, use sparingly, e.g. translation payload)
function getOriginalInnerText(el: HTMLElement): string {
  const wrappers = el.querySelectorAll<HTMLElement>(':scope > [data-readacross-type]');
  const displays: string[] = [];

  // Temporarily hide injected translations to get accurate rendered original text
  wrappers.forEach(w => {
    displays.push(w.style.display);
    w.style.display = 'none';
  });

  // Calculate actual rendered text (preserves visually rendered newlines nicely, ignores hidden elements)
  let text = el.innerText || '';

  // Restore translations display
  wrappers.forEach((w, i) => {
    w.style.display = displays[i];
  });

  // Remove excessive consecutive newlines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

/**
 * Returns true if the text looks like a standalone proper noun block
 * (a person's name, brand name, etc.) that doesn't need translation.
 * Examples: "Christian Catalini", "Elon Musk", "Jane Wu", "@username"
 */
function isPureProperName(text: string): boolean {
  const t = text.trim()
  if (t.length > 60) return false
  // Social media handles like @ccatalini or @wu_jane
  if (/^@[\w_.]+$/.test(t)) return true
  // 1–4 words, each starting with uppercase letter, rest lowercase (incl. accented chars, hyphens, apostrophes)
  return /^[A-ZÀ-Ö][a-zà-öø-ÿ'\-]+(?:\s[A-ZÀ-Ö][a-zà-öø-ÿ'\-]+){0,3}$/.test(t)
}

/**
 * Returns true if the text is just a URL (e.g., "example.com/page", "https://x.com")
 */
function isPureUrl(text: string): boolean {
  // If it has actual spaces or tabs, it's not a single pure URL
  if (/[ \t]/.test(text.trim())) return false

  // Remove invisible wrapping characters (like zero-width space) and newlines
  const t = text.replace(/[\r\n\u200B-\u200D\uFEFF]/g, '')
  if (t.length < 4 || t.length > 200) return false

  // URL pattern: optional http(s)://, domain with dots, 2+ char TLD, optional port, and optional path/ellipsis
  return /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*|…|\.\.\.)?$/i.test(t)
}

/**
 * Returns true if the text is just a date, time, or social media stats (views, likes)
 */
function isSocialStatsOrDateTime(text: string): boolean {
  const t = text.trim()
  if (t.length === 0 || t.length > 100) return false

  // Strip directional marks, zero-width chars, spaces, numbers, common symbols
  // \u200E (LRM), \u200F (RLM), \u202A-\u202E (directional embedding), \u200B-\u200D (zero-width)
  const structuralChars = /[\s\r\n\u200B-\u200F\u202A-\u202E\uFEFF]/g
  let remaining = t.replace(structuralChars, '')

  // Strip common social media keywords and months (longest strings first to prevent partial matches)
  const utilityWords = /(Views|View|Likes|Like|Reposts|Repost|Retweets|Retweet|Quotes|Quote|Bookmarks|Bookmark|ago|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|AM|PM)/gi
  remaining = remaining.replace(utilityWords, '')

  // Strip numbers and common punctuation/number separators
  const utilityChars = /[0-9:,\.\sKMB·\/\-]/gi
  remaining = remaining.replace(utilityChars, '')

  // If there are only a couple of letters left (e.g. "s" or a stray localized char), it's probably purely utility
  return remaining.trim().length <= 2
}

async function translateBlock(block: HTMLElement) {
  if (processedBlocks.has(block)) return

  const rawText = getOriginalInnerText(block)
  if (!rawText || rawText.length < 10) return

  // Safety: refuse to translate absurdly large blocks (single API payload sanity limit)
  if (rawText.length > 8000) {

    processedBlocks.add(block)
    block.setAttribute('data-readacross-processed', 'true')
    return
  }

  const normalizedKey = getTranslationCacheKey(rawText)
  const text = rawText // alias used below

  // --- Skip pure proper-name blocks, URLs, or date/stats blocks ---
  if (isPureProperName(text) || isPureUrl(text) || isSocialStatsOrDateTime(text)) {

    processedBlocks.add(block)
    block.setAttribute('data-readacross-processed', 'true')
    block.setAttribute('data-readacross-original-length', text.length.toString())
    translationCache.set(normalizedKey, '[NO_TRANSLATE]')
    translationState.translated++
    reportProgress()
    return
  }

  // Mark as processed (even if we fail, to avoid infinite retries)
  processedBlocks.add(block)
  block.setAttribute('data-readacross-processed', 'true')
  block.setAttribute('data-readacross-original-length', text.length.toString())

  // Mark all descendants as processed so we don't translate them separately
  block.querySelectorAll('*').forEach(el => {
    processedBlocks.add(el as HTMLElement)
  })

  // --- Local Language Detection ---
  // A mapping from extension Target Language strings to Franc ISO 639-3 codes
  const langMap: Record<string, string[]> = {
    "简体中文": ["cmn"],
    "繁體中文": ["cmn"],
    "English": ["eng"],
    "日本語": ["jpn"],
    "한국어": ["kor"],
    "Français": ["fra"],
    "Deutsch": ["deu"],
    "Español": ["spa"]
  };

  const targetCodes = langMap[currentTargetLang] || [];
  if (targetCodes.length > 0) {
    const detectedLang = franc(text);
    if (targetCodes.includes(detectedLang)) {
      // The text is already in the target language. Skip translation.
      translationCache.set(normalizedKey, "[NO_TRANSLATE]");
      translationState.translated++;
      reportProgress();
      return;
    }
  }
  // --------------------------------

  // Check cache first (for instantly restoring recycled DOM nodes)
  if (translationCache.has(normalizedKey)) {
    injectBlockTranslation(block, translationCache.get(normalizedKey)!)
    translationState.translated++
    reportProgress()
    return
  }

  // Create loading shimmer immediately
  const placeholder = createLoadingPlaceholder(block)

  // Queue the actual API request to prevent dropping sockets on massive pages
  apiQueue.add(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "TRANSLATE_TEXT",
        text: text
      })

      // Remove loading placeholder
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
          // Cache it to prevent future API calls, but don't inject any DOM elements
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
      if (err?.message?.includes("Extension context invalidated")) {
        // Silently fail if extension was reloaded/updated by the developer
        return
      }
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

  // Check if translation already exists specifically for this block to avoid duplicates
  if (originalBlock.querySelector(':scope > [data-readacross-type="translation"]')) {
    return
  }

  // Clean up any lingering loading placeholders
  originalBlock.querySelectorAll(':scope > [data-readacross-type="loading"]').forEach(el => el.remove())

  const wrapper = document.createElement("span")
  wrapper.className = "readacross-translation"
  wrapper.textContent = translatedText
  wrapper.setAttribute("data-readacross-type", "translation")
  wrapper.style.display = "block"

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
  wrapper.style.display = "block"

  originalBlock.appendChild(wrapper)
}

function restoreCachedTranslations(root: Node) {
  const restoredBlocks = new Set<HTMLElement>()
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        if (!node.textContent || node.textContent.trim().length === 0) {
          return NodeFilter.FILTER_REJECT
        }
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT

        if (parent.closest('script, style, noscript, code, [data-readacross-type], footer, nav, header, aside, [role="navigation"], [role="contentinfo"], [role="banner"], [role="complementary"], [data-testid="sidebarColumn"]')) {
          return NodeFilter.FILTER_REJECT
        }

        return NodeFilter.FILTER_ACCEPT
      }
    }
  )

  let currentNode = walker.nextNode()
  while (currentNode) {
    const rawParent = currentNode.parentElement
    if (rawParent) {
      const block = getClosestBlockElement(rawParent)
      if (!restoredBlocks.has(block) && !block.querySelector(':scope > [data-readacross-type]')) {
        const rawText = getOriginalInnerText(block)
        const cached = translationCache.get(getTranslationCacheKey(rawText))
        if (cached && cached !== "[NO_TRANSLATE]") {
          block.setAttribute('data-readacross-processed', 'true')
          block.setAttribute('data-readacross-original-length', rawText.length.toString())
          processedBlocks.add(block)
          block.querySelectorAll('*').forEach(el => {
            processedBlocks.add(el as HTMLElement)
          })
          injectBlockTranslation(block, cached)
          restoredBlocks.add(block)
        }
      }
    }
    currentNode = walker.nextNode()
  }
}

// -----------------------------------------------------------------------------
// Continuous Global Translation Engine
// -----------------------------------------------------------------------------

const INLINE_TAGS = new Set([
  'a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn',
  'em', 'i', 'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span',
  'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'
])

// Never walk past these when finding the text block container
const WALK_STOP_TAGS = new Set(['body', 'html'])

function getClosestBlockElement(el: HTMLElement): HTMLElement {
  let current = el
  while (current && current.parentElement && INLINE_TAGS.has(current.tagName.toLowerCase())) {
    // Don't walk past body/html — they are too broad to be a translation block
    if (WALK_STOP_TAGS.has(current.parentElement.tagName.toLowerCase())) {
      break
    }
    current = current.parentElement
  }
  return current
}

function getTranslatableBlocks(root: Node): HTMLElement[] {
  const nodesToTranslate: HTMLElement[] = []

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        if (!node.textContent || node.textContent.trim().length === 0) {
          return NodeFilter.FILTER_REJECT
        }
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT

        // Skip hidden/system elements, page chrome (nav, footer, header), and typical sidebars
        if (parent.closest('script, style, noscript, code, [data-readacross-type], footer, nav, header, aside, [role="navigation"], [role="contentinfo"], [role="banner"], [role="complementary"], [data-testid="sidebarColumn"]')) {
          return NodeFilter.FILTER_REJECT
        }

        return NodeFilter.FILTER_ACCEPT
      }
    }
  )

  let currentNode = walker.nextNode()
  while (currentNode) {
    const rawParent = currentNode.parentElement
    if (rawParent) {
      const parent = getClosestBlockElement(rawParent)
      if (!nodesToTranslate.includes(parent)) {
        if (parent.getAttribute('data-readacross-processed') !== 'true') {
          // Not processed yet
          if (!processedBlocks.has(parent)) {
            nodesToTranslate.push(parent)
          }
        } else {
          // Already processed. Check if text expanded significantly (e.g., clicking "Show more")
          // Use quick textContent extraction to avoid layout thrashing during mutation cycle
          const oldLength = parseInt(parent.getAttribute('data-readacross-original-length') || '0', 10)
          const currentText = getBlockTextWithoutTranslation(parent)
          const newLength = currentText.length

          if (newLength > oldLength + 15) {
            // Text expanded! Reset state to force re-translation
            parent.removeAttribute('data-readacross-processed')
            processedBlocks.delete(parent)

            // Remove old translations if they exist
            const wrappers = parent.querySelectorAll(':scope > [data-readacross-type]')
            wrappers.forEach(w => w.remove())

            nodesToTranslate.push(parent)
          }
        }
      }
    }
    currentNode = walker.nextNode()
  }

  return nodesToTranslate
}

function observeDOMChanges() {
  if (mutationObserver) mutationObserver.disconnect()

  mutationObserver = new MutationObserver((mutations) => {
    if (!isTranslationActive) return

    let needsScan = false
    let needsCacheRestore = false
    const restoreRoots = new Set<Node>()
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        needsScan = true
        restoreRoots.add(mutation.target.parentElement || document.body)
        break
      }
      if (mutation.removedNodes.length > 0) {
        for (let i = 0; i < mutation.removedNodes.length; i++) {
          const node = mutation.removedNodes[i]
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            if (el.hasAttribute('data-readacross-type') || el.querySelector('[data-readacross-type]')) {
              needsCacheRestore = true
              restoreRoots.add(mutation.target as Node)
              break
            }
          }
        }
      }
      if (mutation.addedNodes.length > 0) {
        // Simple check to skip tiny noise mutations
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i]
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            if (!el.hasAttribute('data-readacross-type')) {
              needsScan = true
              needsCacheRestore = true
              restoreRoots.add(el)
              break
            }
          } else if (node.nodeType === Node.TEXT_NODE) {
            needsScan = true
            needsCacheRestore = true
            restoreRoots.add(node.parentElement || document.body)
            break
          }
        }
      }
      if (needsScan) break
    }

    if (needsScan || needsCacheRestore) {
      // Provide a tiny delay to allow batching of React/Vue render cycles
      setTimeout(() => {
        restoreRoots.forEach(root => restoreCachedTranslations(root))
        scanAndQueueTranslation(document.body, false)
      }, 100)
    }
  })

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  })
}

function scanAndQueueTranslation(root: Node, shouldRestoreCached = true) {
  if (shouldRestoreCached) {
    restoreCachedTranslations(root)
  }

  let newBlocks = getTranslatableBlocks(root)

  if (newBlocks.length === 0) return

  // Pre-calculate lengths to avoid layout thrashing
  const lengths = new Map<HTMLElement, number>()
  newBlocks.forEach(b => lengths.set(b, getBlockTextWithoutTranslation(b).length))

  const toDrop = new Set<HTMLElement>()
  for (let i = 0; i < newBlocks.length; i++) {
    for (let j = 0; j < newBlocks.length; j++) {
      if (i === j) continue
      const parent = newBlocks[i]
      const child = newBlocks[j]
      
      if (parent.contains(child)) {
        // If the ancestor is massive, it's likely a layout container. 
        // Drop it and keep the children so they get beautifully interleaved translations.
        // Otherwise, drop the child to provide a unified translation block for the parent.
        if ((lengths.get(parent) || 0) > 2500) {
          toDrop.add(parent)
        } else {
          toDrop.add(child)
        }
      }
    }
  }

  newBlocks = newBlocks.filter(b => !toDrop.has(b))



  translationState.total += newBlocks.length
  translationState.active = true
  reportProgress()

  if (intersectionObserver) {
    newBlocks.forEach(block => intersectionObserver!.observe(block))
  }
}

function startPeriodicRecovery() {
  if (recoveryInterval) clearInterval(recoveryInterval)

  // Every 2 seconds, find processed blocks that have lost their translation child
  // due to virtual DOM recycling (like Twitter) and instantly restore them from cache.
  recoveryInterval = window.setInterval(() => {
    if (!isTranslationActive) return

    restoreCachedTranslations(document.body)

    const processedElements = document.querySelectorAll('[data-readacross-processed="true"]')
    processedElements.forEach(block => {
      if (!block.isConnected) return

      const hasOverlay = block.querySelector(':scope > [data-readacross-type]')

      if (!hasOverlay) {
        // Translation was lost! Recycled Virtual DOM node.
        const rawText = getOriginalInnerText(block as HTMLElement)
        const cached = translationCache.get(getTranslationCacheKey(rawText))
        if (cached && cached !== "[NO_TRANSLATE]") {
          injectBlockTranslation(block as HTMLElement, cached)
        }
      }
    })
  }, 2000)
}

async function enableContinuousTranslation() {
  if (window.location.hostname.includes("youtube.com") || window.location.hostname.includes("github.com")) {
    return
  }


  isTranslationActive = true

  // Fetch user settings to know the target language for language detection
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })
    if (response && response.targetLang) {
      currentTargetLang = response.targetLang
    }
    currentCacheContext = JSON.stringify({
      provider: response?.provider || "hosted",
      baseUrl: response?.baseUrl || "",
      model: response?.model || "",
      temperature: response?.temperature ?? "",
      style: response?.style || "General",
      targetLang: currentTargetLang
    })

  } catch (e) {
    console.warn("Could not fetch targetLang before translating.", e)
  }

  // 1. Setup IntersectionObserver
  if (intersectionObserver) intersectionObserver.disconnect()

  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = entry.target as HTMLElement

        intersectionObserver!.unobserve(target) // Only translate once
        translateBlock(target)
      }
    })
  }, {
    root: null,
    rootMargin: '600px 0px', // Start translating 600px before it enters viewport
    threshold: 0
  })

  // 2. Scan current DOM
  scanAndQueueTranslation(document.body)

  // 3. Watch for UI changes (infinite scroll)
  observeDOMChanges()

  // 4. Start recovery sweeper for Virtual DOMs
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

  // Hide all current translations
  document.querySelectorAll('[data-readacross-type]').forEach(el => el.remove())
  document.querySelectorAll('[data-readacross-processed]').forEach(el => {
    el.removeAttribute('data-readacross-processed')
  })

  translationState = { translated: 0, total: 0, active: false }
  reportProgress()
}

async function toggleTranslation() {
  if (isTranslationActive) {
    disableContinuousTranslation()
  } else {
    await enableContinuousTranslation()
  }
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  // Option + T to toggle translation
  if (e.altKey && e.code === "KeyT") {
    toggleTranslation()
  }
})

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "START_TRANSLATION") {
    if (!isTranslationActive) {
      enableContinuousTranslation().then(() => {
        sendResponse({ success: true })
      })
      return true // Async response
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

// Inject styles on load
injectTranslationStyles()

  // Auto-translate if this site is in the always-translate list
  ; (async () => {
    if (window.location.hostname.includes("youtube.com") || window.location.hostname.includes("github.com")) return
    try {
      const storage = new Storage()
      const raw = await storage.get<string>("settings_always_translate_sites") ?? "[]"
      const sites: string[] = JSON.parse(raw)
      if (sites.includes(window.location.hostname)) {
        if (document.readyState === "loading") {
          await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
        }
        await enableContinuousTranslation()
      }
    } catch (e) {
      console.warn("ReadAcross: could not read always-translate settings", e)
    }
  })()
