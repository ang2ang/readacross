const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const vm = require("node:vm")
const ts = require("typescript")

// Exercise the real content script with a deterministic player and clock.
const source = readFileSync(`${__dirname}/../src/contents/youtube.ts`, "utf8")
  .replace(/\ninitTranslationState\(\)[\s\S]*$/, "")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText

class Element {
  constructor(tag = "div", className = "") {
    this.tagName = tag
    this.className = className
    this.children = []
    this.attrs = new Map()
    this.style = {}
    this.textContent = ""
    this.clicks = 0
  }
  get isConnected() { return !!this.root || !!this.parentElement?.isConnected }
  appendChild(child) {
    child.remove()
    child.parentElement = this
    this.children.push(child)
    return child
  }
  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(child => child !== this)
      this.parentElement = null
    }
  }
  attachShadow() { return this.shadowRoot = new Element() }
  setAttribute(name, value) { this.attrs.set(name, value) }
  getAttribute(name) { return this.attrs.get(name) ?? null }
  hasAttribute(name) { return this.attrs.has(name) }
  click() {
    this.clicks++
    this.setAttribute("aria-pressed", this.getAttribute("aria-pressed") === "true" ? "false" : "true")
  }
  querySelectorAll(selector) {
    const matches = element => {
      if (selector.startsWith("#")) return element.id === selector.slice(1)
      const [tag, className] = selector.split(".")
      return (!tag || element.tagName === tag)
        && (!className || element.className.split(" ").includes(className))
    }
    return this.children.flatMap(child => [
      ...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)
    ])
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
}

function fixture(inject = async () => ({ ok: true })) {
  const root = new Element("html")
  root.root = true
  const head = root.appendChild(new Element("head"))
  const body = root.appendChild(new Element("body"))
  const player = body.appendChild(new Element("div", "html5-video-player"))
  player.id = "movie_player"
  const video = player.appendChild(new Element("video", "html5-main-video"))
  video.currentTime = 0
  video.paused = true
  const captions = player.appendChild(new Element("div", "ytp-caption-window-container"))
  const cc = player.appendChild(new Element("button", "ytp-subtitles-button"))
  cc.setAttribute("aria-pressed", "false")
  const timeouts = new Map(), intervals = new Map(), frames = new Map(), listeners = new Map()
  let id = 0
  const document = {
    head, body, documentElement: root,
    createElement: tag => new Element(tag),
    getElementById: id => root.querySelector(`#${id}`),
    querySelector: selector => root.querySelector(selector),
    querySelectorAll: selector => root.querySelectorAll(selector)
  }
  const window = {
    location: { search: "?v=current", href: "https://www.youtube.com/watch?v=current" },
    addEventListener: (name, callback) => listeners.set(name, callback)
  }
  const context = vm.createContext({
    exports: {}, console, URL, URLSearchParams, document, window,
    require: () => ({ Storage: class {} }),
    chrome: { runtime: {
      onMessage: { addListener() {} },
      sendMessage: async message => message.type === "INJECT_CAPTION_INTERCEPTOR"
        ? inject() : { result: "译文" }
    } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback }
      observe(target) { this.target = target }
      disconnect() { this.target = null }
    },
    setTimeout: (fn, delay) => { timeouts.set(++id, { fn, delay }); return id },
    clearTimeout: key => timeouts.delete(key),
    setInterval: fn => { intervals.set(++id, fn); return id },
    clearInterval: key => intervals.delete(key),
    requestAnimationFrame: fn => { frames.set(++id, fn); return id },
    cancelAnimationFrame: key => frames.delete(key)
  })
  vm.runInContext(compiled, context)
  const run = code => vm.runInContext(code, context)
  const runTimeout = delay => {
    for (const [key, timer] of [...timeouts]) {
      if (timer.delay === delay) { timeouts.delete(key); timer.fn() }
    }
  }
  const tick = () => {
    for (const [key, fn] of [...frames]) { frames.delete(key); fn() }
  }
  return { run, root, player, video, captions, cc, timeouts, intervals, frames, runTimeout, tick,
    deliverMessage(data) { listeners.get("message")({ source: window, data }) },
    async activate() { await run("isTranslationActive = true; activate()") },
    deactivate() { run("isTranslationActive = false; deactivate()") }
  }
}

test("keeps native captions visible until the overlay has a source cue", async () => {
  const f = fixture()
  await f.activate()
  assert.equal(f.root.querySelector("#readacross-hide-native-cc"), null)
  f.run('updateCues("Hello", "你好")')
  assert.ok(f.root.querySelector("#readacross-hide-native-cc"))
  f.run("clearCues()")
  assert.equal(f.root.querySelector("#readacross-hide-native-cc"), null)
})

test("waits for caption controls and metadata without clicking unavailable controls", async () => {
  const f = fixture()
  f.cc.attrs.delete("aria-pressed")
  await f.activate()
  assert.equal(f.cc.clicks, 0)
  assert.equal(f.intervals.size, 1)
  f.cc.setAttribute("aria-pressed", "false")
  f.runTimeout(500)
  assert.equal(f.cc.clicks, 1)
  f.deactivate()
  assert.equal(f.timeouts.size, 0)
})

test("does not toggle captions after deactivation while injection is pending", async () => {
  let finishInjection
  const f = fixture(() => new Promise(resolve => { finishInjection = resolve }))
  const activation = f.activate()
  f.deactivate()
  finishInjection({ ok: true })
  await activation
  assert.equal(f.cc.clicks, 0)
  assert.equal(f.frames.size, 0)
})

test("cancels pending CC reload and paused rendering when disabled", async () => {
  const f = fixture()
  f.cc.setAttribute("aria-pressed", "true")
  await f.activate()
  f.tick()
  assert.equal(f.timeouts.size, 2)
  f.deactivate()
  assert.equal(f.cc.getAttribute("aria-pressed"), "true")
  f.runTimeout(300)
  f.runTimeout(500)
  assert.equal(f.cc.clicks, 2)
  assert.equal(f.frames.size, 0)
  assert.equal(f.timeouts.size, 0)
})

test("reattaches observation when YouTube replaces its caption container", async () => {
  const f = fixture()
  await f.activate()
  const previous = f.run("subtitleObserver")
  f.captions.remove()
  const replacement = f.player.appendChild(new Element("div", "ytp-caption-window-container"))
  for (const fn of [...f.intervals.values()]) fn()
  assert.equal(previous.target, null)
  assert.equal(f.run("subtitleObserver.target"), replacement)
})

test("recovers when the caption container arrives after activation", async () => {
  const f = fixture()
  f.captions.remove()
  await f.activate()
  assert.equal(f.intervals.size, 1)
  assert.equal(f.run("subtitleObserver"), null)
  f.player.appendChild(f.captions)
  for (const fn of [...f.intervals.values()]) fn()
  assert.equal(f.run("subtitleObserver.target"), f.captions)
})

test("rebuilds a removed overlay and renders the same cached cue again", async () => {
  const f = fixture()
  const segment = f.captions.appendChild(new Element("span", "ytp-caption-segment"))
  segment.textContent = "Hello"
  await f.activate()
  f.run('translationCache.set("Hello", "你好"); renderFromNativeCC()')
  const oldOverlay = f.root.querySelector("#readacross-caption-window")
  oldOverlay.remove()
  for (const fn of [...f.intervals.values()]) fn()
  f.run("renderFromNativeCC()")
  const overlay = f.root.querySelector("#readacross-caption-window")
  assert.notEqual(overlay, oldOverlay)
  assert.equal(overlay.shadowRoot.querySelector(".source").textContent, "Hello")
  assert.equal(overlay.shadowRoot.querySelector(".target").textContent, "你好")
})

test("moves the overlay and observation to a replacement player", async () => {
  const f = fixture()
  await f.activate()
  f.player.remove()
  const replacement = f.root.querySelector("body").appendChild(new Element("div", "html5-video-player"))
  replacement.id = "movie_player"
  const captions = replacement.appendChild(new Element("div", "ytp-caption-window-container"))
  for (const fn of [...f.intervals.values()]) fn()
  assert.equal(f.root.querySelector("#readacross-caption-window").parentElement, replacement)
  assert.equal(f.run("subtitleObserver.target"), captions)
})

test("ignores preview players and caption responses from the previous video", async () => {
  const f = fixture()
  const preview = new Element("div", "html5-video-player")
  preview.appendChild(new Element("video", "html5-main-video"))
  f.root.children.unshift(preview)
  assert.equal(f.run("getVideoElement()"), f.video)
  await f.activate()
  const data = {
    type: "readacross-caption-intercepted",
    url: "https://www.youtube.com/api/timedtext?v=previous",
    body: JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Old cue" }] }] })
  }
  f.deliverMessage(data)
  assert.equal(f.run("transcriptReady"), false)
  f.deliverMessage({ ...data, url: "https://www.youtube.com/api/timedtext?v=current" })
  assert.equal(f.run("transcriptReady"), true)
})
