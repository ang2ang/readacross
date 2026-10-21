# ReadAcross Monorepo

<p align="center">
  <img src="apps/web/public/favicon.png" alt="ReadAcross Logo" width="120" />
</p>

<p align="center">
  <strong>AI reading and translation for documents and the web</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#installation-and-development">Development</a> •
  <a href="#usage">Usage</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#tech-stack">Tech Stack</a>
</p>

---

## Features

- **Document reader** - Read PDF and EPUB files with page/chapter navigation, PDF links, EPUB table of contents, zoom, and font-size controls.
- **Text and image input** - Paste text or upload multiple images. Tesseract.js recognizes image text in the browser; the first image is processed automatically.
- **Seven Web interface languages** - 简体中文, English, 日本語, Français, Deutsch, Português, and 繁體中文. The interface defaults to Simplified Chinese and remembers the last choice.
- **Translation workspace** - Translate selected text, a PDF page, or the current EPUB view. Resize or collapse the translation panel, locate a translation's source, and return to the previous reading position. On smaller screens, the panel becomes a drawer.
- **Reading continuity** - Restore PDF/EPUB reading positions, display settings, and completed translations from local storage. Matching completed requests reuse saved translations.
- **Markdown export** - Copy or download completed Web translations in source order, including source locations and generation settings. The extension can export visible page translations as Obsidian-compatible Markdown.
- **Browser extension** - Toggle inline page translation, restore original content, and remember sites to translate automatically. Site-specific adapters handle GitHub content and YouTube captions when captions are available.
- **Shared AI core** - Supports the hosted Ollama proxy, OpenAI, DeepSeek, Ollama Cloud, and local models. Configure model, target language, temperature, and translation style; the Web App also supports custom system prompts.

The seven-language interface and its default-target rules apply to the Web App. The extension has its own settings and interface.

## Demo

https://github.com/user-attachments/assets/153fa2ca-3a55-4dc0-a220-916d6eabaff4

> *Introduction video showcasing ReadAcross features*

## Installation and Development

### Prerequisites

- Node.js 20.19+ within the 20.x line, or 22.12 and newer (required by the Web App's Vite 7 runtime)
- [pnpm](https://pnpm.io/installation) (Workspaces enabled)

### Quick Start

This project uses **pnpm workspaces** to manage a monorepo setup.

```bash
# Clone the repository
git clone https://github.com/ang2ang/readacross.git
cd readacross

# Install dependencies across all workspaces
pnpm install

# Start the Web App
pnpm --filter @readacross/web dev
```

- The Web App normally runs at `http://localhost:5173`; use the URL printed by Vite if that port is occupied.
- The default hosted provider forwards `/api/openai/*` to Ollama at `http://localhost:11434/v1/*` in Vite development. Start a model server with the selected model available, configure a remote upstream as described below, or choose another provider in Settings.

Run the extension builder in another terminal:

```bash
pnpm --filter @readacross/extension dev
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension/build/chrome-mv3-dev`. After rebuilding or reloading the extension, refresh existing tabs to load the updated content scripts.

Use `pnpm dev` from the repository root to start both development processes together.

### Remote Ollama During Web Development

Vite reads `apps/web/.dev.vars` when it starts. For a remote Ollama server behind Cloudflare Tunnel, create that file with your own values:

```dotenv
OLLAMA_PRIVATE_BASE_URL=https://llm.example.com
CF_ACCESS_CLIENT_ID=your-service-token-id
CF_ACCESS_CLIENT_SECRET=your-service-token-secret
```

The Access credentials are needed only when the upstream is protected by Cloudflare Access. The upstream URL should be the Ollama server's origin, without `/v1` or `/api/openai`. Restart Vite after changing this file. `.dev.vars` is ignored by Git.

Vite proxies `/api/openai`; it does not run Cloudflare Pages Functions or provide the Web App's `/api/ollama/chat` cloud proxy. To exercise both Pages routes locally with Wrangler available:

```bash
cd apps/web
pnpm build
npx wrangler pages dev dist
```

### Build for Production

```bash
# Build all workspaces
pnpm run build

# Or build an individual app
pnpm --filter @readacross/web build
pnpm --filter @readacross/extension build
```

The Web output is `apps/web/dist`; the production extension output is `apps/extension/build/chrome-mv3-prod`.

## Usage

### Web App

1. Choose an interface language from the home-page selector. Interface and target-language options use the same native names.
2. Open **Settings** to configure the provider, API key if required, service URL, model, target language, temperature, and translation style.
3. Paste text, upload images, or open a PDF/EPUB file. Text and first-image OCR can start translation automatically; document translation starts when you explicitly request it.
4. In a document, open **Translate** and translate the selection, PDF page, or current EPUB view. Paging, zooming, and opening the translation panel do not make model requests.
5. Use **Locate source** and **Return to reading** to navigate between translated passages and your reading position. **Export** copies Markdown or downloads `<source name>.translated.md`; unfinished output is excluded.

Changing the interface language selects a default target:

| Interface language | Default translation target |
| --- | --- |
| 简体中文 or 繁體中文 | English |
| English, 日本語, Français, Deutsch, or Português | 简体中文 |

You can override the target in Settings. The manual choice survives reloads; switching the interface language selects the corresponding default again.

### Local Reading Data

- PDF/EPUB records use IndexedDB to save completed translations, reading positions, font/zoom settings, and translation-panel scroll position. The home page shows up to five recent records.
- Original-file copies are limited to five. Inactive originals expire after 10 days without reopening, and local reading data has a 100 MiB budget. Evicting an original keeps its saved translations and reading metadata; reselect the matching file to resume.
- Pasted text and image sessions are temporary. Copy or download their completed translations before leaving the session.
- Delete an individual record from **Recent reading**, or clear reading records in **Settings**. Export useful translations before clearing browser/site data.
- Settings and API keys use browser storage. Translation input is sent to the selected model provider or proxy; Cloudflare Access service-token credentials are configured on the server.

### Browser Extension

1. Open the extension popup to configure its provider and translation settings independently of the Web App.
2. Start page translation from the popup and restore the original content when finished. On general webpages and GitHub, `Alt+T` (`Option+T` on Mac) also toggles translation.
3. Enable automatic translation for a hostname from the popup if desired. YouTube's adapter uses available video captions for its translation overlay.
4. Use the popup's Markdown copy/download actions to export visible page translations for Obsidian.

### Model Providers

| Provider | Configuration |
| --- | --- |
| Hosted (default) | The Web App uses `/api/openai`; the extension defaults to `https://readacross.pages.dev/api/openai` and allows a custom hosted URL. No user API key is required when the upstream is configured and available. |
| OpenAI | Supply an API key and an OpenAI-compatible base URL, such as `https://api.openai.com/v1`. |
| DeepSeek | Supply an API key and the service base URL, normally `https://api.deepseek.com`. |
| Ollama Cloud | Supply an Ollama API key and set the base URL to `https://ollama.com`. The Web App uses the Pages `/api/ollama/chat` proxy; the extension calls the cloud service from its background worker. |
| Local LLM | Set the OpenAI-compatible model-server URL, for example `http://localhost:11434/v1`. Browser requests to a separate origin require the server to permit that origin through CORS. |

Hosted mode depends on a working model backend; cloning the repository alone does not provide one.

## Architecture

- **`packages/core`**: Shared provider types, translation clients, prompt builders, and Obsidian note serialization. Both apps consume its TypeScript source directly.
- **`apps/web`**: React reader, OCR input, interface translations, settings, IndexedDB reading storage, and document Markdown export.
- **`apps/web/functions`**: Cloudflare Pages proxy implementations for a private Ollama server and Ollama Cloud.
- **`functions`**: Repository-root Pages entrypoints that re-export the Web proxy implementations.
- **`apps/extension`**: Plasmo popup/options UI, background translation requests, inline content scripts, and GitHub/YouTube adapters.

## Deployment (Cloudflare Pages)

For a repository-root Cloudflare Pages build, use:

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Build command | `pnpm --filter @readacross/web build` |
| Build output directory | `apps/web/dist` |

The root `functions/` directory supplies the API entrypoints. A static-only host can serve the reader but must provide equivalent API routing or use a directly accessible provider.

Configure these variables in the Pages environment for hosted Ollama:

| Variable | Purpose |
| --- | --- |
| `OLLAMA_PRIVATE_BASE_URL` | Required Ollama upstream origin, for example `https://llm.example.com`. Use the actual upstream, not the Pages application's own URL. |
| `OLLAMA_MODEL` | Fallback model only when a request omits `model`; it does not override the model selected in the client. |
| `CF_ACCESS_CLIENT_ID` | Service-token ID when the upstream is protected by Cloudflare Access. Configure as a secret. |
| `CF_ACCESS_CLIENT_SECRET` | Matching service-token secret. Configure as a secret. |

The hosted proxy forwards requests to the upstream's `/v1` API and attaches configured Access credentials. Ollama Cloud uses the separate `/api/ollama` proxy, which forwards the user's Ollama API key.

## Checks

Run from the repository root:

```bash
node --test apps/web/tests/reading.test.cjs apps/web/tests/language.test.cjs
pnpm --filter @readacross/web lint
pnpm --filter @readacross/web build
```

The Node checks cover reading persistence and isolation, translation-cache matching, Markdown export, PDF navigation/zoom policy, all seven interface languages, native language names, default targets, and preference restoration.

See [Web reading checks](apps/web/tests/README.md) for native IndexedDB, PDF/EPUB navigation, responsive-layout, and mock-model browser checks. No additional test dependencies are required for the Node checks.

## Tech Stack

- **Monorepo Handling**: pnpm workspaces
- **Frontend Frameworks**: React 19 + Vite 7 (Web), React 18 + Plasmo (Extension)
- **Styling**: Tailwind CSS
- **State and Storage**: Zustand, IndexedDB (Web reading data), Plasmo Storage (Extension)
- **PDF Rendering**: react-pdf
- **EPUB Rendering**: react-reader (epubjs)
- **OCR**: Tesseract.js
- **AI**: OpenAI SDK

## Project Structure

```text
readacross/
├── apps/
│   ├── web/               # The standalone reading web application
│   │   ├── functions/     # Cloudflare Pages proxy implementations
│   │   ├── public/        # Static assets for web
│   │   ├── src/
│   │   │   ├── components/ # Reader, translation, input and settings UI
│   │   │   ├── i18n/      # Shared language options and interface catalogs
│   │   │   ├── reading/   # Persistence, locations, layout and Markdown export
│   │   │   └── store/     # File, reading and settings state
│   │   └── tests/         # Node checks, browser runners, fixtures and mock model
│   └── extension/         # The browser extension
│       ├── src/           # Extension source code
│       │   ├── background.ts  # Service worker handling API logic
│       │   ├── content.ts     # Injected DOM scripts
│       │   ├── contents/      # GitHub and YouTube adapters
│       │   ├── options.tsx    # Full page settings UI
│       │   └── popup.tsx      # Extension popup UI
├── functions/             # Pages entrypoints for repository-root deployment
├── packages/
│   └── core/              # Shared translation intelligence and types
│       └── src/           # AI clients, prompts, types and Obsidian serialization
├── pnpm-workspace.yaml    # pnpm workspace config
└── package.json           # Root workspace config
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request following the workspace boundaries.

## Acknowledgments

- [DeepSeek](https://platform.deepseek.com/) / [OpenAI](https://platform.openai.com/) for LLM translation API
- [Plasmo](https://docs.plasmo.com/) for a stellar extension framework
- [react-pdf](https://github.com/wojtekmaj/react-pdf) / [react-reader](https://github.com/gerhardsletten/react-reader) for document support
- [Tesseract.js](https://tesseract.projectnaptha.com/) for OCR capabilities

---

<p align="center">
  Made with ❤️ for readers everywhere
</p>
