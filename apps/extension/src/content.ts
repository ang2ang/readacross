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
// Key: normalized original text, Value: translated text
const translationCache = new Map<string, string>()

// State
let isTranslationActive = false
let translationState = { translated: 0, total: 0, active: false }
let currentTargetLang = "简体中文" // Default, will be fetched on start

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

// Inject global styles for loading indicators
function injectTranslationStyles() {
  if (document.getElementById("readacross-content-styles")) return
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
  document.head.appendChild(style)
}

function createLoadingPlaceholder(block: HTMLElement): HTMLElement {
  const placeholder = document.createElement("div")
  placeholder.className = "readacross-loading"
  placeholder.textContent = "Translating..."
  placeholder.setAttribute("data-readacross-type", "loading")

  if (block.nextSibling) {
    block.parentNode?.insertBefore(placeholder, block.nextSibling)
  } else {
    block.parentNode?.appendChild(placeholder)
  }
  return placeholder
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
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

async function translateBlock(block: HTMLElement) {
  if (processedBlocks.has(block)) return

  const text = block.innerText?.trim()
  if (!text || text.length < 10) return

  const normalizedKey = normalizeText(text)

  // --- Skip pure proper-name blocks (author names, account display names) or pure URLs ---
  if (isPureProperName(text) || isPureUrl(text)) {
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

  // Create loading shimmer
  const placeholder = createLoadingPlaceholder(block)

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
  } catch (err) {
    if (placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder)
    }
    console.error("ReadAcross Messaging error:", err)
    injectErrorIndicator(block, "Translation failed")
  } finally {
    translationState.translated++
    reportProgress()
  }
}

function injectBlockTranslation(originalBlock: HTMLElement, translatedText: string) {
  if (translatedText === "[NO_TRANSLATE]") return

  // Check if translation already exists specifically for this block to avoid duplicates
  if (originalBlock.nextElementSibling?.getAttribute('data-readacross-type') === 'translation') {
    return
  }

  const wrapper = document.createElement("div")
  wrapper.className = "readacross-translation"
  wrapper.textContent = translatedText
  wrapper.setAttribute("data-readacross-type", "translation")

  if (originalBlock.nextSibling) {
    originalBlock.parentNode?.insertBefore(wrapper, originalBlock.nextSibling)
  } else {
    originalBlock.parentNode?.appendChild(wrapper)
  }
}

function injectErrorIndicator(originalBlock: HTMLElement, errorMsg: string) {
  if (originalBlock.nextElementSibling?.getAttribute('data-readacross-type') === 'error') {
    return
  }

  const wrapper = document.createElement("div")
  wrapper.className = "readacross-error"
  wrapper.textContent = `⚠ ${errorMsg}`
  wrapper.setAttribute("data-readacross-type", "error")

  if (originalBlock.nextSibling) {
    originalBlock.parentNode?.insertBefore(wrapper, originalBlock.nextSibling)
  } else {
    originalBlock.parentNode?.appendChild(wrapper)
  }
}

// -----------------------------------------------------------------------------
// Continuous Global Translation Engine
// -----------------------------------------------------------------------------

function getTranslatableBlocks(root: Node): HTMLElement[] {
  const nodesToTranslate: HTMLElement[] = []

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        if (!node.textContent || node.textContent.trim().length <= 15) {
          return NodeFilter.FILTER_REJECT
        }
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT

        const tagName = parent.tagName.toLowerCase()
        if (['script', 'style', 'noscript', 'code'].includes(tagName)) return NodeFilter.FILTER_REJECT

        // Skip our injected elements
        if (parent.hasAttribute('data-readacross-type') ||
          parent.closest('[data-readacross-type]')) {
          return NodeFilter.FILTER_REJECT
        }

        return NodeFilter.FILTER_ACCEPT
      }
    }
  )

  let currentNode = walker.nextNode()
  while (currentNode) {
    const parent = currentNode.parentElement
    if (parent && !nodesToTranslate.includes(parent)) {
      if (parent.getAttribute('data-readacross-processed') !== 'true') {
        // Not processed yet
        if (!processedBlocks.has(parent)) {
          nodesToTranslate.push(parent)
        }
      } else {
        // Already processed. Check if text expanded significantly (e.g., clicking "Show more")
        const oldLength = parseInt(parent.getAttribute('data-readacross-original-length') || '0', 10)
        const currentText = parent.textContent || ''
        const newLength = currentText.trim().length

        if (newLength > oldLength + 15) {
          // Text expanded! Reset state to force re-translation
          parent.removeAttribute('data-readacross-processed')
          processedBlocks.delete(parent)

          // Remove old translation if it exists
          const next = parent.nextElementSibling
          if (next && next.getAttribute('data-readacross-type') === 'translation') {
            next.remove()
          }

          nodesToTranslate.push(parent)
        }
      }
    }
    currentNode = walker.nextNode()
  }

  // Filter deepest blocks
  return nodesToTranslate.filter(el => {
    return !nodesToTranslate.some(other => el !== other && el.contains(other))
  })
}

function observeDOMChanges() {
  if (mutationObserver) mutationObserver.disconnect()

  mutationObserver = new MutationObserver((mutations) => {
    if (!isTranslationActive) return

    let needsScan = false
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        needsScan = true
        break
      }
      if (mutation.addedNodes.length > 0) {
        // Simple check to skip tiny noise mutations
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i]
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            if (!el.hasAttribute('data-readacross-type')) {
              needsScan = true
              break
            }
          } else if (node.nodeType === Node.TEXT_NODE) {
            needsScan = true
            break
          }
        }
      }
      if (needsScan) break
    }

    if (needsScan) {
      // Provide a tiny delay to allow batching of React/Vue render cycles
      setTimeout(() => scanAndQueueTranslation(document.body), 100)
    }
  })

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  })
}

function scanAndQueueTranslation(root: Node) {
  const newBlocks = getTranslatableBlocks(root)
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

  // Every 2 seconds, find processed blocks that have lost their translation siblings
  // (Common in React/View Virtual DOMs like Twitter/X)
  recoveryInterval = window.setInterval(() => {
    if (!isTranslationActive) return

    // Find all blocks we marked as processed
    const processedEls = document.querySelectorAll('[data-readacross-processed="true"]')
    processedEls.forEach(el => {
      const block = el as HTMLElement
      // Check if it lost its translation sibling
      const nextSibling = block.nextElementSibling
      if (!nextSibling || !nextSibling.hasAttribute('data-readacross-type')) {
        const text = block.innerText?.trim()
        if (text) {
          const normalizedKey = normalizeText(text)
          if (translationCache.has(normalizedKey)) {
            // Re-inject silently
            injectBlockTranslation(block, translationCache.get(normalizedKey)!)
          }
        }
      }
    })
  }, 2000)
}

async function enableContinuousTranslation() {
  if (window.location.hostname.includes("youtube.com")) {
    return
  }

  isTranslationActive = true

  // Fetch user settings to know the target language for language detection
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })
    if (response && response.targetLang) {
      currentTargetLang = response.targetLang
    }
  } catch (e) {
    console.warn("Could not fetch targetLang before translating.")
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
    if (window.location.hostname.includes("youtube.com")) return
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
