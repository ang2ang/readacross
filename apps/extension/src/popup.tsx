import { useState, useEffect, useCallback } from "react"
import { useExtensionSettings } from "~hooks/useExtensionSettings"
import { ToggleLeft, ToggleRight, Languages, Thermometer, Key, Server, MessageSquare, BookOpen, TextQuote } from "lucide-react"
import type { Provider, PromptStyle } from "@readacross/core"
import { AppIcon } from "~components/AppIcon"

import "./popup.css"

function IndexPopup() {
  const settings = useExtensionSettings()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ translated: number; total: number; active: boolean } | null>(null)
  const [currentHostname, setCurrentHostname] = useState<string | null>(null)
  const [isPageTranslated, setIsPageTranslated] = useState(false)

  // Load current tab hostname + translation state
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async tabs => {
      try {
        const url = tabs[0]?.url
        if (url) setCurrentHostname(new URL(url).hostname)
        const tabId = tabs[0]?.id
        if (tabId) {
          const state = await chrome.tabs.sendMessage(tabId, { type: "GET_TRANSLATION_STATE" }).catch(() => null)
          if (state?.isActive) setIsPageTranslated(true)
        }
      } catch { }
    })
  }, [])

  // Poll translation progress
  useEffect(() => {
    if (!progress?.active) return
    const interval = setInterval(async () => {
      try {
        const resp = await chrome.runtime.sendMessage({ type: "GET_TRANSLATION_PROGRESS" })
        if (resp) {
          setProgress(resp)
          if (resp.translated >= resp.total && resp.total > 0) {
            // Translation complete
            setTimeout(() => setProgress(null), 3000)
          }
        }
      } catch { }
    }, 800)
    return () => clearInterval(interval)
  }, [progress?.active])

  const handleTranslatePage = useCallback(async () => {
    setErrorMsg(null)
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const activeTabId = tabs[0]?.id
      if (activeTabId) {
        await chrome.tabs.sendMessage(activeTabId, { type: "START_TRANSLATION" })
        window.close()
      }
    } catch (err: any) {
      if (!err.message?.includes("Receiving end does not exist") && !err.message?.includes("Extension context invalidated")) {
        console.error("Translation trigger failed", err)
      }
      setErrorMsg("请先刷新当前网页 (Cmd+R)")
    }
  }, [])

  const handleRestorePage = useCallback(async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const activeTabId = tabs[0]?.id
      if (activeTabId) {
        await chrome.tabs.sendMessage(activeTabId, { type: "STOP_TRANSLATION" })
        window.close()
      }
    } catch { }
  }, [])

  const isTranslating = progress?.active && progress.translated < progress.total
  const isDone = progress && !progress.active || (progress && progress.translated >= progress.total && progress.total > 0)

  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="header-title">
          <div className="header-logo">
            <AppIcon size={20} />
          </div>
          <h1>ReadAcross</h1>
        </div>
        <button
          className="toggle-btn"
          onClick={() => settings.setIsTranslationEnabled(!settings.isTranslationEnabled)}
          title={settings.isTranslationEnabled ? "Disable Translation" : "Enable Translation"}
        >
          {settings.isTranslationEnabled ? (
            <ToggleRight className="icon-enabled" size={22} />
          ) : (
            <ToggleLeft className="icon-disabled" size={22} />
          )}
        </button>
      </header>

      {/* Translate / Restore Button */}
      <div className="translate-section">
        {isPageTranslated ? (
          <button
            className="translate-btn translate-btn-restore"
            onClick={handleRestorePage}
          >
            <AppIcon size={16} />
            显示原文
          </button>
        ) : (
          <button
            className="translate-btn"
            onClick={handleTranslatePage}
            disabled={!!isTranslating}
          >
            <AppIcon size={16} />
            {isTranslating ? "翻译中..." : "翻译当前网页"}
          </button>
        )}

        {errorMsg && (
          <div className="status-msg status-error">{errorMsg}</div>
        )}
        {isTranslating && progress && (
          <div className="status-msg status-progress">
            <div className="spinner" />
            Translating {progress.translated}/{progress.total} blocks...
          </div>
        )}
        {isDone && progress && progress.total > 0 && (
          <div className="status-msg status-done">
            ✓ Translated {progress.total} blocks
          </div>
        )}
      </div>

      {/* Always translate this site */}
      {currentHostname && (
        <div className="always-translate-row">
          <div className="always-translate-info">
            <span className="always-translate-title">总是翻译该网站</span>
            <span className="always-translate-chip">
              <img
                className="always-translate-favicon"
                src={`https://www.google.com/s2/favicons?domain=${currentHostname}&sz=16`}
                alt=""
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
              />
              {currentHostname}
            </span>
          </div>
          <button
            className={`site-toggle ${settings.isAlwaysTranslateSite(currentHostname) ? "site-toggle-on" : ""}`}
            onClick={() => settings.toggleAlwaysTranslateSite(currentHostname)}
            aria-label="总是翻译该网站"
          >
            <span className="site-toggle-thumb" />
          </button>
        </div>
      )}

      {/* Settings */}
      <div className="settings-scroll">
        <div className="settings-form">
          {/* Provider */}
          <div className="form-group">
            <label><Server size={12} /> Provider</label>
            <select
              value={settings.provider}
              onChange={(e) => settings.setProvider(e.target.value as any)}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="local">Local</option>
            </select>
          </div>

          {/* API Key */}
          <div className="form-group">
            <label><Key size={12} /> API Key</label>
            <input
              type="password"
              value={settings.provider === "deepseek" ? settings.deepseekKey : settings.provider === "openai" ? settings.openAiKey : settings.localKey}
              onChange={(e) => {
                if (settings.provider === "deepseek") {
                  settings.setDeepseekKey(e.target.value)
                } else if (settings.provider === "openai") {
                  settings.setOpenAiKey(e.target.value)
                } else {
                  settings.setLocalKey(e.target.value)
                }
              }}
              placeholder={settings.provider === "local" ? "Skipped for local" : "sk-..."}
            />
          </div>

          {/* Base URL */}
          <div className="form-group">
            <label><Server size={12} /> Base URL</label>
            <input
              type="text"
              value={settings.provider === "deepseek" ? settings.deepseekBaseUrl : settings.provider === "openai" ? settings.openAiBaseUrl : settings.localBaseUrl}
              onChange={(e) => {
                if (settings.provider === "deepseek") {
                  settings.setDeepseekBaseUrl(e.target.value)
                } else if (settings.provider === "openai") {
                  settings.setOpenAiBaseUrl(e.target.value)
                } else {
                  settings.setLocalBaseUrl(e.target.value)
                }
              }}
              placeholder={settings.provider === "deepseek" ? "https://api.deepseek.com" : settings.provider === "openai" ? "https://api.openai.com/v1" : "http://localhost:11434/v1"}
            />
          </div>

          {/* Model */}
          <div className="form-group">
            <label><BookOpen size={12} /> Model</label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => settings.setModel(e.target.value)}
              placeholder={settings.defaultModel}
            />
          </div>

          {/* Temperature */}
          <div className="form-group">
            <label><Thermometer size={12} /> Temperature</label>
            <div className="temp-row">
              <input
                type="range"
                className="temp-slider"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(e) => settings.setTemperature(parseFloat(e.target.value))}
              />
              <span className="temp-value">{(settings.temperature ?? 1.3).toFixed(1)}</span>
            </div>
          </div>

          {/* Prompt Style */}
          <div className="form-group">
            <label><MessageSquare size={12} /> Style</label>
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

          {/* Target Language */}
          <div className="form-group">
            <label><Languages size={12} /> Target Language</label>
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
        </div>
      </div>

      {/* Shortcut hint */}
      <div className="shortcut-hint">
        Shortcut: <kbd>⌥</kbd> + <kbd>T</kbd> to translate page
      </div>

      {/* Footer */}
      <footer className="popup-footer">
        <p>Powered by {settings.provider === "deepseek" ? "DeepSeek" : settings.provider === "openai" ? "OpenAI" : "Local"} · {settings.effectiveModel}</p>
      </footer>
    </div>
  )
}

export default IndexPopup
