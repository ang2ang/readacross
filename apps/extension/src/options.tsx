import { useExtensionSettings } from "~hooks/useExtensionSettings"
import { Settings, Key, Server, MessageSquare, Thermometer, BookOpen } from "lucide-react"
import type { Provider, PromptStyle } from "@readacross/core"
import { AppIcon } from "~components/AppIcon"

import "./options.css"

function OptionsPage() {
  const settings = useExtensionSettings()

  return (
    <div className="options-page">
      <div className="options-header">
        <div className="options-header-icon">
          <AppIcon size={24} />
        </div>
        <h1>ReadAcross Settings</h1>
      </div>
      <p className="options-subtitle">Configure your AI translation preferences for the browser extension.</p>

      {/* Core Settings */}
      <div className="settings-card">
        <h2><Settings size={16} /> Translation</h2>

        <div className="opt-form-group">
          <div className="enable-row">
            <input
              type="checkbox"
              checked={settings.isTranslationEnabled}
              onChange={(e) => settings.setIsTranslationEnabled(e.target.checked)}
            />
            <span>Enable <kbd>⌥ Option+T</kbd> page translation</span>
          </div>
        </div>

        <div className="opt-form-group">
          <label>Target Language</label>
          <select
            value={settings.targetLang}
            onChange={(e) => settings.setTargetLang(e.target.value)}
          >
            <option value="简体中文">简体中文</option>
            <option value="繁體中文">繁體中文</option>
            <option value="English">English</option>
            <option value="日本語">日本語</option>
            <option value="Français">Français</option>
            <option value="Deutsch">Deutsch</option>
            <option value="Português">Português</option>
          </select>
        </div>

        <div className="opt-form-group">
          <label>Translation Style</label>
          <select
            value={settings.promptStyle}
            onChange={(e) => settings.setPromptStyle(e.target.value as PromptStyle)}
          >
            <option value="General">General (Balanced)</option>
            <option value="Academic">Academic (Formal)</option>
            <option value="Philosophical">Philosophical (Nuanced)</option>
            <option value="Create">Creative (Literary)</option>
          </select>
        </div>

        <div className="opt-form-group">
          <label>Temperature</label>
          <div className="opt-temp-row">
            <input
              type="range"
              className="opt-temp-slider"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              onChange={(e) => settings.setTemperature(parseFloat(e.target.value))}
            />
            <span className="opt-temp-value">{(settings.temperature ?? 0.3).toFixed(1)}</span>
          </div>
          <p className="hint">Lower = more deterministic, Higher = more creative</p>
        </div>
      </div>

      {/* API Configuration */}
      <div className="settings-card">
        <h2><Key size={16} /> API Configuration</h2>

        <div className="opt-form-group">
          <label>AI Provider</label>
          <div className="opt-provider-toggle">
            <button
              className={`opt-provider-btn ${settings.provider === "deepseek" ? "active" : ""}`}
              onClick={() => { settings.setProvider("deepseek"); settings.setModel(""); }}
            >
              DeepSeek
            </button>
            <button
              className={`opt-provider-btn ${settings.provider === "openai" ? "active" : ""}`}
              onClick={() => { settings.setProvider("openai"); settings.setModel(""); }}
            >
              OpenAI
            </button>
            <button
              className={`opt-provider-btn ${settings.provider === "ollama" ? "active" : ""}`}
              onClick={() => { settings.setProvider("ollama"); settings.setModel(""); }}
            >
              Ollama
            </button>
          </div>
        </div>

        <div className="opt-form-group">
          <label>{settings.provider === "deepseek" ? "DeepSeek" : settings.provider === "openai" ? "OpenAI" : settings.provider === "ollama" ? "Ollama" : "Local"} API Key</label>
          <input
            type="password"
            value={settings.provider === "deepseek" ? settings.deepseekKey : settings.provider === "openai" ? settings.openAiKey : settings.provider === "ollama" ? settings.ollamaKey : settings.localKey}
            onChange={(e) => {
              if (settings.provider === "deepseek") {
                settings.setDeepseekKey(e.target.value)
              } else if (settings.provider === "openai") {
                settings.setOpenAiKey(e.target.value)
              } else if (settings.provider === "ollama") {
                settings.setOllamaKey(e.target.value)
              } else {
                settings.setLocalKey(e.target.value)
              }
            }}
            placeholder={settings.provider === "local" ? "Usually not required for local models" : settings.provider === "ollama" ? "Ollama API key" : "sk-..."}
          />
          <p className="hint">Stored locally in your browser. Never sent to third parties.</p>
        </div>

        <div className="opt-form-group">
          <label>Base URL</label>
          <input
            type="text"
            value={settings.provider === "deepseek" ? settings.deepseekBaseUrl : settings.provider === "openai" ? settings.openAiBaseUrl : settings.provider === "ollama" ? settings.ollamaBaseUrl : settings.localBaseUrl}
            onChange={(e) => {
              if (settings.provider === "deepseek") {
                settings.setDeepseekBaseUrl(e.target.value)
              } else if (settings.provider === "openai") {
                settings.setOpenAiBaseUrl(e.target.value)
              } else if (settings.provider === "ollama") {
                settings.setOllamaBaseUrl(e.target.value)
              } else {
                settings.setLocalBaseUrl(e.target.value)
              }
            }}
            placeholder={settings.provider === "deepseek" ? "https://api.deepseek.com" : settings.provider === "openai" ? "https://api.openai.com/v1" : settings.provider === "ollama" ? "https://ollama.com" : "http://localhost:11434/v1"}
          />
        </div>

        <div className="opt-form-group">
          <label>Model</label>
          <input
            type="text"
            value={settings.model}
            onChange={(e) => settings.setModel(e.target.value)}
            placeholder={settings.defaultModel}
          />
          <p className="hint">Leave empty to use default: {settings.defaultModel}</p>
        </div>
      </div>
    </div>
  )
}

export default OptionsPage
