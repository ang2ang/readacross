# ReadAcross Monorepo

<p align="center">
  <img src="apps/web/public/readacross-logo.svg" alt="ReadAcross Logo" width="120" />
</p>

<p align="center">
  <strong>AI-Powered Reading & Translation Ecosystem</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#tech-stack">Tech Stack</a>
</p>

---

## ✨ Features

- **📄 Multi-format Support (Web App)** - Seamlessly read PDF and EPUB documents
- **🌐 Immersive Translating (Extension)** - Inject AI translations directly into any webpage you visit
- **🤖 AI Translation Core** - High-quality translations powered by OpenAI's GPT models, shared across all apps
- **🔍 OCR Recognition** - Extract text from images with built-in Tesseract.js (Web App)
- **📝 Flexible Translation Modes** - Translate selected text or entire pages with custom Personas
- **💾 Local Storage** - Your settings and API keys are stored securely in your browser
- **🎨 Clean UI** - Modern, responsive interface with dark mode support

## 🎬 Demo

{{ ... }}

https://github.com/user-attachments/assets/153fa2ca-3a55-4dc0-a220-916d6eabaff4

> *Introduction video showcasing ReadAcross features*

## 🚀 Installation & Development

### Prerequisites

- Node.js 20+ (LTS recommended)
- [pnpm](https://pnpm.io/installation) (Workspaces enabled)

### Quick Start

This project uses **pnpm workspaces** to manage a monorepo setup.

```bash
# Clone the repository
git clone https://github.com/yourusername/readacross.git
cd readacross

# Install pnpm if you don't have it globally
# (or use `curl -fsSL https://get.pnpm.io/install.sh | sh -` if npm fails)
npm install -g pnpm

# Install dependencies across all workspaces
pnpm install

# Start development servers (runs both Web App and Extension builder)
pnpm run dev
```

- The **Web App** will be available at `http://localhost:5173`
- The **Extension** will build into `apps/extension/build/chrome-mv3-dev`. Load this unpacked folder into Chromium-based browsers via `chrome://extensions`.

### Build for Production

```bash
# Build all workspaces
pnpm run build
```

## 📖 Usage

1. **Configure API Key** - Click the settings icon in either the Web App or the Extension popup and enter your OpenAI/DeepSeek API key.
2. **Web App (`apps/web`)** - Drag & drop a PDF/EPUB file or paste text/images to read and translate alongside the document.
3. **Extension (`apps/extension`)** - Select text on any webpage to translate or trigger page-level translation using the shared core AI logic.
4. **Customize** - Adjust translation style (Personas) and target language securely.

## 🏗 Architecture

ReadAcross has evolved into a Monorepo out of a need for cross-platform expansion:

- **`packages/core`**: The brain of the operation. Contains shared Types, the `OpenAI` client abstractions, Prompt building logic, and Persona management.
- **`apps/web`**: The original heavy-duty Single Page Application for reading uploaded documents (PDFs, EPUBs, OCR).
- **`apps/extension`**: The Plasmo-based browser extension leveraging `@readacross/core` to inject translation capabilities directly into the user's live browsing session.

## 🛠 Tech Stack

- **Monorepo Handling**: pnpm workspaces
- **Frontend Frameworks**: React 18/19, Vite, Plasmo (Extension)
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **PDF Rendering**: react-pdf
- **EPUB Rendering**: react-reader (epubjs)
- **OCR**: Tesseract.js
- **AI**: OpenAI SDK

## 📁 Project Structure

```text
readacross/
├── apps/
│   ├── web/               # The standalone reading web application
│   │   ├── public/        # Static assets for web
│   │   └── src/           # React components, stores, etc.
│   └── extension/         # The browser extension
│       ├── src/           # Extension source code
│       │   ├── background.ts  # Service worker handling API logic
│       │   ├── content.ts     # Injected DOM scripts
│       │   ├── options.tsx    # Full page settings UI
│       │   └── popup.tsx      # Extension popup UI
├── packages/
│   └── core/              # Shared translation intelligence and types
│       └── src/ai/        # Prompts and LLM client handlers
├── video/                 # Remotion video project (not in git)
├── pnpm-workspace.yaml    # pnpm workspace config
└── package.json           # Root workspace config
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request following the workspace boundaries.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [DeepSeek](https://platform.deepseek.com/) / [OpenAI](https://platform.openai.com/) for LLM translation API
- [Plasmo](https://docs.plasmo.com/) for a stellar extension framework
- [react-pdf](https://github.com/wojtekmaj/react-pdf) / [react-reader](https://github.com/gerhardsletten/react-reader) for document support
- [Tesseract.js](https://tesseract.projectnaptha.com/) for OCR capabilities

---

<p align="center">
  Made with ❤️ for readers everywhere
</p>
