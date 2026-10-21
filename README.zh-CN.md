# <img src="apps/extension/assets/icon128.png" alt="" width="32" height="32" /> ReadAcross

[English](README.md) | **简体中文**

用 AI 阅读和翻译文档、文本、图片与网页。

## 功能

- **PDF 与 EPUB**：章节与页面导航、PDF 链接跳转、缩放和字号调整。
- **文本与图片**：粘贴文本，或上传图片并在浏览器中进行 OCR 识别。
- **双语对照**：翻译选中文字或当前页面，对照译文并定位原文。
- **保存与导出**：恢复本地文档阅读进度和已完成译文，导出 Markdown。
- **七种 Web 界面语言**：简体中文、English、日本語、Français、Deutsch、Português、繁體中文。
- **浏览器扩展**：网页行内翻译，适配 GitHub 内容和可用的 YouTube 字幕。

## 界面截图

**文本、文件与图片输入**

![首页输入方式](docs/screenshots/home.jpg)

**原文与译文对照**

![英文原文与中文译文](docs/screenshots/text-translation.jpg)

**带章节目录的 EPUB 阅读器**

![EPUB 阅读器与目录](docs/screenshots/epub-reader.jpg)

截图使用示例内容，双语界面中的译文来自本地演示服务。

## 本地运行

需要 Node.js 20.19+（20.x）或 22.12+，以及 [pnpm](https://pnpm.io/installation)。

```bash
git clone https://github.com/ang2ang/readacross.git
cd readacross
pnpm install
pnpm --filter @readacross/web dev
```

打开 Vite 输出的地址，通常为 `http://localhost:5173`。在**设置**中选择 OpenAI、DeepSeek、Ollama Cloud、本地模型或托管代理。

托管模式需要配置可用的模型后端。Vite 开发环境默认将 `/api/openai` 转发到 `http://localhost:11434/v1` 的 Ollama 服务。如需远程后端，在 `apps/web/.dev.vars` 中设置 `OLLAMA_PRIVATE_BASE_URL`，然后重启 Vite。

开发浏览器扩展：

```bash
pnpm --filter @readacross/extension dev
```

打开 `chrome://extensions`，启用**开发者模式**，点击**加载已解压的扩展程序**，选择 `apps/extension/build/chrome-mv3-dev`。重新构建或加载扩展后，刷新网页标签页。

## 使用方法

1. 在首页选择界面语言，在**设置**中配置模型和翻译目标语言。
2. 粘贴文本、上传图片或打开 PDF/EPUB。在文档中点击**翻译**，翻译选中文字或当前页面／视图。
3. 用**定位原文**核对内容，再**返回阅读位置**继续阅读。通过**导出**复制或下载已完成译文的 Markdown。
4. 扩展在弹出窗口中单独配置，可在那里切换网页翻译；普通网页和 GitHub 也支持 `Alt+T`，Mac 上为 `Option+T`。

文档阅读记录保存在本地；粘贴文本和图片会话为临时内容，请在离开前导出需要的译文。待译文本会发送给所选模型服务或代理。

## 构建与检查

```bash
pnpm --filter @readacross/web build
pnpm --filter @readacross/extension build
node --test apps/web/tests/reading.test.cjs apps/web/tests/language.test.cjs apps/extension/tests/youtube.test.cjs
```

构建产物位于 `apps/web/dist` 和 `apps/extension/build/chrome-mv3-prod`。浏览器验证步骤见 [Web 阅读检查](apps/web/tests/README.md)。

## 项目结构

- `apps/web`：React 文档阅读器及 Cloudflare Pages API 代理。
- `apps/extension`：基于 Plasmo 的浏览器扩展。
- `packages/core`：共用的翻译客户端、提示词和 Markdown 序列化。
- `functions`：以仓库根目录部署时使用的 Cloudflare Pages API 入口。
