# ReadAcross

<p align="center">
  <img src="public/readacross-logo.svg" alt="ReadAcross Logo" width="120" />
</p>

<p align="center">
  <strong>AI-Powered Reading & Translation</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#license">License</a>
</p>

---

## ✨ Features

- **📄 Multi-format Support** - Seamlessly read PDF and EPUB documents
- **🤖 AI Translation** - High-quality translations powered by OpenAI's GPT models
- **🔍 OCR Recognition** - Extract text from images with built-in Tesseract.js
- **📝 Flexible Translation Modes** - Translate selected text or entire pages
- **💾 Local Storage** - Your settings and API keys are stored securely in your browser
- **🎨 Clean UI** - Modern, responsive interface with dark mode support

## 🎬 Demo

<!-- 
To add the intro video:
1. Go to your GitHub repo's Releases
2. Create a new release and upload video/out/readacross-intro.mp4
3. Copy the video URL and replace the placeholder below

Or drag & drop the video directly into this README when editing on GitHub
-->

https://github.com/user-attachments/assets/placeholder-video-id

> *Introduction video showcasing ReadAcross features*

## 🚀 Installation

### Prerequisites

- Node.js 18+ 
- npm or pnpm

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/readacross.git
cd readacross

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## 📖 Usage

1. **Configure API Key** - Click the settings icon and enter your OpenAI API key
2. **Upload Document** - Drag & drop a PDF/EPUB file or paste text/images
3. **Read & Translate** - Select text and click "Translate Selection" or use "Translate Page"
4. **Customize** - Adjust translation style and target language in settings

### Supported Formats

| Format | Features |
|--------|----------|
| PDF | Full page rendering, text selection, zoom |
| EPUB | Chapter navigation, font sizing, reading progress |
| Images | OCR text extraction, multi-image support |
| Text | Direct paste, clipboard support |

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **PDF Rendering**: react-pdf
- **EPUB Rendering**: react-reader (epubjs)
- **OCR**: Tesseract.js
- **AI**: OpenAI API
- **Icons**: Lucide React

## 📁 Project Structure

```
readacross/
├── public/              # Static assets
├── src/
│   ├── components/      # React components
│   │   ├── common/      # Shared components
│   │   ├── reader/      # Document viewers
│   │   ├── settings/    # Settings modal
│   │   ├── translation/ # Translation panel
│   │   └── upload/      # File upload
│   ├── store/           # Zustand stores
│   ├── App.tsx          # Main app component
│   └── main.tsx         # Entry point
├── video/               # Remotion video project (not in git)
└── package.json
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [OpenAI](https://openai.com/) for the translation API
- [react-pdf](https://github.com/wojtekmaj/react-pdf) for PDF rendering
- [react-reader](https://github.com/gerhardsletten/react-reader) for EPUB support
- [Tesseract.js](https://tesseract.projectnaptha.com/) for OCR capabilities

---

<p align="center">
  Made with ❤️ for readers everywhere
</p>
