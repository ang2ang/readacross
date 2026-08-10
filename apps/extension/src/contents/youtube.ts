import type { PlasmoCSConfig } from "plasmo"
import { Storage } from "@plasmohq/storage"

export const config: PlasmoCSConfig = {
  matches: ["*://*.youtube.com/*"],
  all_frames: true,
  run_at: "document_idle"
}

// =============================================================================
// State
// =============================================================================

const storage = new Storage()
const translationCache = new Map<string, string>()
const inProgressRequests = new Set<string>()
let isTranslationActive = false
let currentVideoId = ""
let subtitleObserver: MutationObserver | null = null
let renderLoopId: number | null = null
let healthCheckInterval: ReturnType<typeof setInterval> | null = null
let lastRenderedText = ""

// Transcript data (timestamp-based)
interface TimedCue {
  startMs: number
  endMs: number
  text: string
  translation: string | null
}
let timedCues: TimedCue[] = []
let transcriptReady = false
const DEFAULT_CUE_DURATION_MS = 3000

// Shadow DOM elements
let overlayHost: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let sourceCue: HTMLElement | null = null
let targetCue: HTMLElement | null = null

function normalizeText(text: string): string {
  return text.replace(/[\n\r]/g, " ").replace(/\s+/g, " ").trim()
}

// =============================================================================
// Shadow DOM Overlay
// =============================================================================

const SHADOW_STYLES = `
  :host {
    all: initial;
  }
  .ra-caption-container {
    position: absolute;
    bottom: 2%;
    left: 5%;
    width: 90%;
    display: flex;
    justify-content: center;
    align-items: flex-end;
    pointer-events: none;
    z-index: 40;
  }
  .ra-caption-window {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    max-width: 100%;
    pointer-events: auto;
  }
  .ra-cue {
    display: block;
    background: rgba(8, 8, 8, 0.75);
    color: #fff;
    font-size: 1.4em;
    padding: 2px 8px;
    border-radius: 2px;
    text-align: center;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
    font-family: "YouTube Noto", Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, sans-serif;
  }
  .ra-cue.source {
    color: #fff;
  }
  .ra-cue.target {
    color: #f5c518;
    font-size: 1.3em;
    margin-top: 2px;
  }
  .ra-cue:empty {
    display: none;
  }
`

function ensureOverlay(): boolean {
  if (overlayHost && overlayHost.isConnected && shadowRoot && sourceCue && targetCue) {
    return true
  }

  const player = document.querySelector(".html5-video-player") as HTMLElement
  if (!player) return false

  destroyOverlay()

  overlayHost = document.createElement("div")
  overlayHost.id = "readacross-caption-window"
  overlayHost.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:40;"

  shadowRoot = overlayHost.attachShadow({ mode: "open" })

  const style = document.createElement("style")
  style.textContent = SHADOW_STYLES
  shadowRoot.appendChild(style)

  const container = document.createElement("div")
  container.className = "ra-caption-container"

  const captionWindow = document.createElement("div")
  captionWindow.className = "ra-caption-window"

  sourceCue = document.createElement("span")
  sourceCue.className = "ra-cue source"

  targetCue = document.createElement("span")
  targetCue.className = "ra-cue target"

  captionWindow.appendChild(sourceCue)
  captionWindow.appendChild(targetCue)
  container.appendChild(captionWindow)
  shadowRoot.appendChild(container)

  player.appendChild(overlayHost)
  return true
}

function destroyOverlay() {
  if (overlayHost) overlayHost.remove()
  document.querySelectorAll("#readacross-caption-window").forEach(el => el.remove())
  overlayHost = null
  shadowRoot = null
  sourceCue = null
  targetCue = null
}

function updateCues(source: string, target: string) {
  if (sourceCue) sourceCue.textContent = source
  if (targetCue) targetCue.textContent = target
}

function clearCues() {
  updateCues("", "")
}

// =============================================================================
// Hide / restore native CC
// =============================================================================

const HIDE_CC_STYLE_ID = "readacross-hide-native-cc"

function hideNativeCC() {
  if (document.getElementById(HIDE_CC_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = HIDE_CC_STYLE_ID
  style.textContent = `
    .ytp-caption-window-container {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `
  document.head.appendChild(style)
}

function restoreNativeCC() {
  const style = document.getElementById(HIDE_CC_STYLE_ID)
  if (style) style.remove()
}

// =============================================================================
// Translation via background service worker
// =============================================================================

async function triggerTranslation(rawText: string): Promise<string | null> {
  const text = normalizeText(rawText)
  if (!text || text.length < 2) return null
  if (translationCache.has(text)) return translationCache.get(text) || null
  if (inProgressRequests.has(text)) return null

  inProgressRequests.add(text)
  try {
    const response = await chrome.runtime.sendMessage({ type: "TRANSLATE_TEXT", text })
    if (response?.result) {
      translationCache.set(text, response.result)
      return response.result
    }
  } catch (err: any) {
    if (!err.message?.includes("Extension context invalidated")) {
      console.error("ReadAcross YT: Translation error", err)
    }
  } finally {
    inProgressRequests.delete(text)
  }
  return null
}

// =============================================================================
// Caption interception (intercept YouTube player's own timedtext requests)
// =============================================================================

let interceptorInstalled = false

async function setupCaptionInterceptor(): Promise<void> {
  if (interceptorInstalled) return

  // Listen for intercepted caption data from MAIN world
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "readacross-caption-intercepted") return
    const { body, url, source } = event.data
    if (!body || !isTranslationActive) return



    // Parse based on format
    let cues: TimedCue[] = []
    if (body.includes("wireMagic") || body.startsWith("{")) {
      // JSON3 format (YouTube's default for player)
      cues = parseJSON3Captions(body)
    } else if (body.includes("<text") || body.includes("<timedtext")) {
      // XML format (srv3)
      cues = parseTranscriptXML(body)
    }

    if (cues.length > 0 && !transcriptReady) {
      transcriptReady = true
      timedCues = cues
      batchTranslateAllCues().catch(() => { })
    }
  })

  // Ask background to inject XHR/fetch interceptor into MAIN world
  try {
    const resp = await chrome.runtime.sendMessage({ type: "INJECT_CAPTION_INTERCEPTOR" })
    if (resp?.ok) {
      interceptorInstalled = true

    } else {

    }
  } catch (e) {

  }
}

// Receive streaming live translation from background script line-by-line
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STREAM_TRANSLATION_LINE") {
    const { originalText, translation } = msg
    translationCache.set(originalText, translation)

    for (const cue of timedCues) {
      if (cue.text === originalText) {
        cue.translation = translation
      }
    }
  }
})

/** Parse YouTube JSON3 caption format (wireMagic: pb3) */
function parseJSON3Captions(jsonText: string): TimedCue[] {
  try {
    const data = JSON.parse(jsonText)
    const events = data.events
    if (!Array.isArray(events)) return []

    const cues: TimedCue[] = []
    for (const ev of events) {
      if (!ev.segs || !Array.isArray(ev.segs)) continue
      const text = ev.segs.map((s: any) => s.utf8 || "").join("").trim()
      if (!text || text === "\n") continue
      const startMs = Number(ev.tStartMs) || 0
      const durMs = Number(ev.dDurationMs) || 0
      cues.push({
        startMs,
        endMs: startMs + durMs,
        text: normalizeText(text),
        translation: null
      })
    }

    return normalizeCueTimeline(mergeFragments(cues))
  } catch (e) {

    return []
  }
}

function mergeFragments(cues: TimedCue[]): TimedCue[] {
  if (cues.length === 0) return []

  const merged: TimedCue[] = []
  let current: TimedCue | null = null

  for (const cue of cues) {
    if (!current) {
      current = { ...cue }
      continue
    }

    const timeGap = cue.startMs - current.endMs
    const currentTrimmed = current.text.trim()

    // Evaluate if the current merged text has reached a natural stopping point
    const hasStrongTerminator = /[.!?。！？]["']?$/.test(currentTrimmed)
    const hasSoftTerminator = /[,，:：;；]["']?$/.test(currentTrimmed)

    const isTooLong = (current.text.length + cue.text.length) > 120 // Hard cap
    const softLimit = (current.text.length > 60) && hasSoftTerminator // Break gracefully at commas
    const tooMuchSilence = timeGap > 1000 // Don't merge across long silences

    if (hasStrongTerminator || isTooLong || softLimit || tooMuchSilence) {
      // Commit current block and start a new one
      merged.push(current)
      current = { ...cue }
    } else {
      // Merge cue into current block
      current.text += " " + cue.text
      current.endMs = cue.endMs
    }
  }

  if (current) {
    merged.push(current)
  }

  return merged
}

function parseTranscriptXML(xmlText: string): TimedCue[] {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlText, "text/xml")
  const nodes = xmlDoc.getElementsByTagName("text")
  const cues: TimedCue[] = []
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    let t = (n.textContent || "").replace(/[\n\r]/g, " ").replace(/\s+/g, " ").trim()
    // Decode HTML entities
    const tmp = document.createElement("textarea")
    tmp.innerHTML = t
    t = tmp.value
    if (!t) continue
    const startMs = parseFloat(n.getAttribute("start") || "0") * 1000
    const durMs = parseFloat(n.getAttribute("dur") || "0") * 1000
    cues.push({
      startMs,
      endMs: startMs + durMs,
      text: normalizeText(t),
      translation: null
    })
  }

  return normalizeCueTimeline(mergeFragments(cues))
}

function normalizeCueTimeline(cues: TimedCue[]): TimedCue[] {
  const sorted = cues
    .filter(cue => Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs))
    .sort((a, b) => a.startMs - b.startMs)

  return sorted.map((cue, index) => {
    const nextCue = sorted[index + 1]
    const fallbackEndMs = cue.endMs > cue.startMs
      ? cue.endMs
      : cue.startMs + DEFAULT_CUE_DURATION_MS
    const endMs = nextCue && nextCue.startMs > cue.startMs
      ? Math.min(fallbackEndMs, nextCue.startMs)
      : fallbackEndMs

    return {
      ...cue,
      endMs
    }
  })
}

// =============================================================================
// Batch pre-translation of ALL transcript cues
// =============================================================================

async function batchTranslateAllCues() {
  if (timedCues.length === 0) return

  // Start from current playback position so nearby cues get translated first
  const video = getVideoElement()
  const currentMs = (video?.currentTime || 0) * 1000
  const startIdx = timedCues.findIndex(c => c.endMs >= currentMs)
  const reordered = startIdx > 0
    ? [...timedCues.slice(startIdx), ...timedCues.slice(0, startIdx)]
    : timedCues

  const untranslated = reordered.filter(c => c.translation === null)
  if (untranslated.length === 0) return

  const BATCH_SIZE = 10
  const CONCURRENCY = 4

  const batches: TimedCue[][] = []
  for (let i = 0; i < untranslated.length; i += BATCH_SIZE) {
    batches.push(untranslated.slice(i, i + BATCH_SIZE))
  }

  for (let g = 0; g < batches.length; g += CONCURRENCY) {
    if (!isTranslationActive) return
    const group = batches.slice(g, g + CONCURRENCY)

    await Promise.allSettled(group.map(async (batch) => {
      const texts = batch.map(c => c.text)
      try {
        const resp = await chrome.runtime.sendMessage({ type: "TRANSLATE_BATCH", lines: texts })
        if (resp?.translations && Array.isArray(resp.translations)) {
          for (let j = 0; j < Math.min(batch.length, resp.translations.length); j++) {
            batch[j].translation = resp.translations[j]
            translationCache.set(batch[j].text, resp.translations[j])
          }
        }
      } catch (e) { }
    }))

  }
}

// =============================================================================
// Timestamp-based rendering loop
// =============================================================================

function getVideoElement(): HTMLVideoElement | null {
  return document.querySelector("video.html5-main-video") as HTMLVideoElement | null
}

function findCueAtTime(timeMs: number): TimedCue | null {
  let activeCue: TimedCue | null = null
  for (let i = 0; i < timedCues.length; i++) {
    const cue = timedCues[i]
    if (timeMs >= cue.startMs && timeMs < cue.endMs) {
      activeCue = cue
      continue
    }
    if (activeCue && cue.startMs > timeMs) {
      return activeCue
    }
    // Also check small gaps: if we're between two cues, show the previous one
    // (YouTube often has micro-gaps between cues)
    if (i > 0 && timeMs >= timedCues[i - 1].endMs && timeMs < cue.startMs) {
      const gap = cue.startMs - timedCues[i - 1].endMs
      if (gap < 500) { // < 500ms gap = still show previous cue
        return timedCues[i - 1]
      }
    }
  }
  return activeCue
}

function startRenderLoop() {
  stopRenderLoop()

  const tick = () => {
    if (!isTranslationActive) return

    const video = getVideoElement()
    if (!video) {
      renderLoopId = requestAnimationFrame(tick)
      return
    }

    const timeMs = (video.currentTime * 1000) + 200 // 200ms lookahead (lead time) to make subtitles feel snappier/sync better

    if (transcriptReady && timedCues.length > 0) {
      // PRIMARY: Timestamp-based rendering from pre-translated transcript
      const cue = findCueAtTime(timeMs)
      if (cue) {
        const displayKey = cue.text + "\n" + (cue.translation || "")
        if (displayKey !== lastRenderedText) {
          lastRenderedText = displayKey
          updateCues(cue.text, cue.translation || "")
        }
      } else {
        if (lastRenderedText !== "") {
          lastRenderedText = ""
          clearCues()
        }
      }
    } else {
      // FALLBACK: Read from native CC (still hidden) when transcript not available
      renderFromNativeCC()
    }

    // When paused: check less often (catch translation arrivals)
    // When playing: check every frame
    if (video.paused) {
      setTimeout(() => { renderLoopId = requestAnimationFrame(tick) }, 500)
    } else {
      renderLoopId = requestAnimationFrame(tick)
    }
  }

  renderLoopId = requestAnimationFrame(tick)
}

function stopRenderLoop() {
  if (renderLoopId) {
    cancelAnimationFrame(renderLoopId)
    renderLoopId = null
  }
}

// Fallback: read native CC text and translate on-the-fly
function renderFromNativeCC() {
  const segments = document.querySelectorAll(".ytp-caption-segment")
  if (segments.length === 0) {
    if (lastRenderedText !== "") {
      lastRenderedText = ""
      clearCues()
    }
    return
  }

  const fullText = Array.from(segments)
    .map(s => s.textContent || "")
    .join(" ")
  const text = normalizeText(fullText)

  if (!text || text.length <= 1) {
    if (lastRenderedText !== "") {
      lastRenderedText = ""
      clearCues()
    }
    return
  }

  if (text === lastRenderedText) return
  lastRenderedText = text

  // Check cache
  const cached = translationCache.get(text)
  if (cached) {
    updateCues(text, cached)
    return
  }

  // Show source while translating
  updateCues(text, "")

  triggerTranslation(text).then(result => {
    if (result && lastRenderedText === text) {
      updateCues(text, result)
    }
  })
}

// =============================================================================
// Subtitle observation (triggers render & keeps native CC alive)
// =============================================================================

function startObserving() {
  // NOTE: CC toggle is done in activate() AFTER interceptor is installed.
  // Do NOT toggle CC here — the interceptor must be ready first.

  const attach = () => {
    if (!isTranslationActive) return
    const container = document.querySelector(".ytp-caption-window-container")
    if (!container) {
      setTimeout(attach, 600)
      return
    }

    hideNativeCC()

    // Observer is now just a trigger to keep native CC DOM alive
    // (YouTube stops generating subtitle data if CC container is fully removed)
    subtitleObserver = new MutationObserver(() => {
      if (!isTranslationActive) return
      // If transcript is NOT ready, also trigger fallback render
      if (!transcriptReady) {
        renderFromNativeCC()
      }
    })

    subtitleObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    })

    startHealthCheck()
  }

  attach()
}

function stopObserving() {
  if (subtitleObserver) {
    subtitleObserver.disconnect()
    subtitleObserver = null
  }
  stopHealthCheck()
  stopRenderLoop()
  lastRenderedText = ""
}

// =============================================================================
// Health check
// =============================================================================

function startHealthCheck() {
  stopHealthCheck()
  healthCheckInterval = setInterval(() => {
    if (!isTranslationActive) {
      stopHealthCheck()
      return
    }
    ensureOverlay()
    hideNativeCC()

    const container = document.querySelector(".ytp-caption-window-container")
    if (container && !subtitleObserver) {
      subtitleObserver = new MutationObserver(() => {
        if (!isTranslationActive) return
        if (!transcriptReady) renderFromNativeCC()
      })
      subtitleObserver.observe(container, {
        childList: true,
        subtree: true,
        characterData: true
      })
    }
  }, 1000)
}

function stopHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
    healthCheckInterval = null
  }
}

// =============================================================================
// Main activation / deactivation
// =============================================================================

async function activate() {
  const urlParams = new URLSearchParams(window.location.search)
  const videoId = urlParams.get("v")
  if (!videoId) return

  if (currentVideoId !== videoId) {
    currentVideoId = videoId
    translationCache.clear()
    timedCues = []
    transcriptReady = false
  }

  if (!ensureOverlay()) {
    setTimeout(activate, 800)
    return
  }

  // Start observing native CC (keeps CC data flow alive)
  startObserving()

  // Start the render loop (uses requestAnimationFrame for smooth display)
  startRenderLoop()

  // Install caption interceptor to capture YouTube player's timedtext requests
  // The interceptor monkey-patches XHR/fetch in MAIN world to read responses

  await setupCaptionInterceptor()

  // Force CC on to make YouTube player fetch captions
  // (the interceptor will capture the response automatically)
  const ccBtn = document.querySelector(".ytp-subtitles-button") as HTMLButtonElement
  if (ccBtn && ccBtn.getAttribute("aria-pressed") !== "true") {
    ccBtn.click()

  } else if (ccBtn && ccBtn.getAttribute("aria-pressed") === "true") {
    // CC already on — player may have already fetched captions before interceptor was installed
    // Toggle CC off-on to force a re-fetch
    ccBtn.click()
    await new Promise(r => setTimeout(r, 300))
    ccBtn.click()

  }
}

function deactivate() {
  stopObserving()
  destroyOverlay()
  restoreNativeCC()
  lastRenderedText = ""
  timedCues = []
  transcriptReady = false
}

// =============================================================================
// YouTube toolbar button
// =============================================================================

function updateYtIconColor(btn: HTMLElement, active: boolean) {
  // Turn icon gold (matching subtitle translation color) when active
  const line1 = btn.querySelector("#ra-line1")
  const line2 = btn.querySelector("#ra-line2")
  const bar = btn.querySelector("#ra-bar")
  const line3 = btn.querySelector("#ra-line3")
  const line4 = btn.querySelector("#ra-line4")
  if (line1) line1.setAttribute("fill", active ? "rgba(0,229,255,0.5)" : "rgba(255,255,255,0.5)")
  if (line2) line2.setAttribute("fill", active ? "rgba(0,229,255,0.5)" : "rgba(255,255,255,0.5)")
  if (bar) bar.setAttribute("fill", active ? "#00e5ff" : "#ffffff")
  if (line3) line3.setAttribute("fill", active ? "#00e5ff" : "#ffffff")
  if (line4) line4.setAttribute("fill", active ? "#00e5ff" : "#ffffff")
}

function injectTranslationButton() {
  if (document.getElementById("readacross-yt-btn")) return
  const rightControls = document.querySelector(".ytp-right-controls")
  if (!rightControls) {
    setTimeout(injectTranslationButton, 1500)
    return
  }

  const btn = document.createElement("button")
  btn.id = "readacross-yt-btn"
  btn.className = "ytp-button"
  btn.title = "Toggle ReadAcross Dual Subtitles"
  btn.style.width = "46px"
  btn.style.height = "100%"
  btn.style.display = "inline-flex"
  btn.style.alignItems = "center"
  btn.style.justifyContent = "center"
  btn.style.cursor = "pointer"

  btn.innerHTML =
    "<svg height='24' width='24' viewBox='0 0 1024 1024' fill='none' xmlns='http://www.w3.org/2000/svg'>" +
    "<rect x='120' y='250' width='700' height='65' rx='32' id='ra-line1' fill='rgba(255,255,255,0.5)'/>" +
    "<rect x='120' y='380' width='540' height='65' rx='32' id='ra-line2' fill='rgba(255,255,255,0.5)'/>" +
    "<rect x='120' y='540' width='24' height='230' rx='12' id='ra-bar' fill='#ffffff'/>" +
    "<rect x='190' y='546' width='610' height='65' rx='32' id='ra-line3' fill='#ffffff'/>" +
    "<rect x='190' y='680' width='460' height='65' rx='32' id='ra-line4' fill='#ffffff'/>" +
    "</svg>"

  btn.addEventListener("click", () => {
    isTranslationActive = !isTranslationActive
    storage.set("readacross_yt_active", isTranslationActive)
    updateYtIconColor(btn, isTranslationActive)
    if (isTranslationActive) {
      activate()
    } else {
      deactivate()
    }
  })

  const ccBtn = rightControls.querySelector(".ytp-subtitles-button")
  if (ccBtn?.parentNode) {
    ccBtn.parentNode.insertBefore(btn, ccBtn)
  } else {
    rightControls.prepend(btn)
  }
}

// =============================================================================
// Init
// =============================================================================

async function initTranslationState() {
  isTranslationActive = await storage.get<boolean>("readacross_yt_active") || false
  injectTranslationButton()

  const btn = document.getElementById("readacross-yt-btn")
  if (btn) {
    updateYtIconColor(btn, isTranslationActive)
  }

  if (isTranslationActive) {
    activate()
  }
}

initTranslationState()

const btnObserver = new MutationObserver(() => {
  if (!document.getElementById("readacross-yt-btn") && document.querySelector(".ytp-right-controls")) {
    injectTranslationButton()
    const btn = document.getElementById("readacross-yt-btn")
    if (btn) {
      updateYtIconColor(btn, isTranslationActive)
    }
  }
})
btnObserver.observe(document.getElementById("movie_player") || document.body, { childList: true, subtree: true })

window.addEventListener("yt-navigate-finish", () => {
  currentVideoId = ""
  deactivate()
  setTimeout(() => {
    injectTranslationButton()
    if (isTranslationActive) activate()
  }, 1000)
})
