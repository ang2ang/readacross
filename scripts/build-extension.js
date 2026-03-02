#!/usr/bin/env node
/**
 * Manual build script for ReadAcross extension.
 * Bypasses Plasmo's broken cold-start scaffolding.
 * Uses esbuild to compile all entry points.
 */
const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const SRC = path.join(ROOT, "apps/extension/src")
const OUT = path.join(ROOT, "apps/extension/build/chrome-mv3-dev")
const ESBUILD = path.join(ROOT, "node_modules/.bin/esbuild")

// Clean and create output
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(path.join(OUT, "static/background"), { recursive: true })

function build(label, args) {
  console.log(`\n🔨 ${label}...`)
  const cmd = `${ESBUILD} ${args}`
  try {
    execSync(cmd, { stdio: "inherit" })
    console.log(`   ✅ ${label} done`)
  } catch (e) {
    console.error(`   ❌ ${label} FAILED`)
    process.exit(1)
  }
}

const COMMON = "--format=iife --target=chrome110 --platform=browser"

// 1. Background (service worker)
build("Background", `${SRC}/background.ts --bundle --outfile=${OUT}/static/background/index.js ${COMMON}`)

// 2. Content script (all pages)
build("Content", `${SRC}/content.ts --bundle --outfile=${OUT}/content.js ${COMMON}`)

// 3. YouTube content script
build("YouTube", `${SRC}/contents/youtube.ts --bundle --outfile=${OUT}/youtube.js ${COMMON}`)

// 4. Popup (React)
build("Popup", `${SRC}/popup.tsx --bundle --outfile=${OUT}/popup.js ${COMMON} --loader:.tsx=tsx --loader:.css=css --jsx=automatic`)

// 5. Options (React)
build("Options", `${SRC}/options.tsx --bundle --outfile=${OUT}/options.js ${COMMON} --loader:.tsx=tsx --loader:.css=css --jsx=automatic`)

// 6. Copy icons
const iconSrc = path.join(ROOT, "apps/extension/assets/icon.png")
if (fs.existsSync(iconSrc)) {
  for (const size of [16, 32, 48, 64, 128]) {
    fs.copyFileSync(iconSrc, path.join(OUT, `icon${size}.png`))
  }
  console.log("\n🖼️  Icons copied")
}

// 7. popup.html
fs.writeFileSync(path.join(OUT, "popup.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;min-width:380px;}</style></head><body><div id="__plasmo"></div><script src="popup.js"></script></body></html>`)

// 8. options.html
fs.writeFileSync(path.join(OUT, "options.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;}</style></head><body><div id="__plasmo"></div><script src="options.js"></script></body></html>`)

// 9. manifest.json
const manifest = {
  manifest_version: 3,
  name: "DEV | ReadAcross Extension",
  version: "0.0.1",
  description: "Immersive translation for ReadAcross",
  author: "ReadAcross",
  icons: { "16": "icon16.png", "32": "icon32.png", "48": "icon48.png", "64": "icon64.png", "128": "icon128.png" },
  action: { default_icon: { "16": "icon16.png", "48": "icon48.png" }, default_popup: "popup.html" },
  background: { service_worker: "static/background/index.js" },
  options_ui: { page: "options.html", open_in_tab: true },
  permissions: ["storage"],
  host_permissions: ["https://*/*"],
  content_scripts: [
    { matches: ["<all_urls>"], js: ["content.js"], all_frames: true },
    { matches: ["*://*.youtube.com/*"], js: ["youtube.js"], all_frames: true, run_at: "document_idle" }
  ]
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2))

console.log(`\n✅ Build complete! Output: ${OUT}`)
console.log("Files:", fs.readdirSync(OUT).join(", "))
console.log("\nNext: chrome://extensions → Load unpacked → select the output folder above")
