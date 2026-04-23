import { useStorage } from "@plasmohq/storage/hook"
import type { Provider, PromptStyle } from "@readacross/core"

// Default hosted proxy URL — change this to your deployed site
export const DEFAULT_HOSTED_BASE_URL = "https://readacross.pages.dev/api/openai"

export const STORAGE_KEYS = {
  PROVIDER: "settings_provider",
  API_KEY_OPENAI: "settings_api_key_openai",
  API_KEY_DEEPSEEK: "settings_api_key_deepseek",
  BASE_URL_OPENAI: "settings_base_url_openai",
  BASE_URL_DEEPSEEK: "settings_base_url_deepseek",
  API_KEY_LOCAL: "settings_api_key_local",
  BASE_URL_LOCAL: "settings_base_url_local",
  BASE_URL_HOSTED: "settings_base_url_hosted",
  MODEL: "settings_model",
  PROMPT_STYLE: "settings_prompt_style",
  TARGET_LANG: "settings_target_lang",
  TEMPERATURE: "settings_temperature",
  IS_TRANSLATION_ENABLED: "settings_is_translation_enabled",
  ALWAYS_TRANSLATE_SITES: "settings_always_translate_sites"
}

export function useExtensionSettings() {
  const [provider, setProvider] = useStorage<Provider>(STORAGE_KEYS.PROVIDER, "hosted")
  const [openAiKey, setOpenAiKey] = useStorage<string>(STORAGE_KEYS.API_KEY_OPENAI, "")
  const [deepseekKey, setDeepseekKey] = useStorage<string>(STORAGE_KEYS.API_KEY_DEEPSEEK, "")
  const [localKey, setLocalKey] = useStorage<string>(STORAGE_KEYS.API_KEY_LOCAL, "")
  const [openAiBaseUrl, setOpenAiBaseUrl] = useStorage<string>(STORAGE_KEYS.BASE_URL_OPENAI, "https://api.openai.com/v1")
  const [deepseekBaseUrl, setDeepseekBaseUrl] = useStorage<string>(STORAGE_KEYS.BASE_URL_DEEPSEEK, "https://api.deepseek.com")
  const [localBaseUrl, setLocalBaseUrl] = useStorage<string>(STORAGE_KEYS.BASE_URL_LOCAL, "http://localhost:11434/v1")
  const [hostedBaseUrl, setHostedBaseUrl] = useStorage<string>(STORAGE_KEYS.BASE_URL_HOSTED, DEFAULT_HOSTED_BASE_URL)
  const [model, setModel] = useStorage<string>(STORAGE_KEYS.MODEL, "")
  const [promptStyle, setPromptStyle] = useStorage<PromptStyle>(STORAGE_KEYS.PROMPT_STYLE, "General")
  const [targetLang, setTargetLang] = useStorage<string>(STORAGE_KEYS.TARGET_LANG, "简体中文")
  const [temperature, setTemperature] = useStorage<number>(STORAGE_KEYS.TEMPERATURE, 1.3)
  const [isTranslationEnabled, setIsTranslationEnabled] = useStorage<boolean>(STORAGE_KEYS.IS_TRANSLATION_ENABLED, true)
  // Stored as JSON string: '["example.com","news.ycombinator.com"]'
  const [alwaysTranslateSitesRaw, setAlwaysTranslateSitesRaw] = useStorage<string>(STORAGE_KEYS.ALWAYS_TRANSLATE_SITES, "[]")

  const alwaysTranslateSites: string[] = (() => {
    try { return JSON.parse(alwaysTranslateSitesRaw || "[]") } catch { return [] }
  })()

  function isAlwaysTranslateSite(hostname: string) {
    return alwaysTranslateSites.includes(hostname)
  }

  function toggleAlwaysTranslateSite(hostname: string) {
    const sites = alwaysTranslateSites
    const next = sites.includes(hostname)
      ? sites.filter(h => h !== hostname)
      : [...sites, hostname]
    setAlwaysTranslateSitesRaw(JSON.stringify(next))
  }

  const apiKey = provider === "hosted" ? "" : provider === "deepseek" ? deepseekKey : provider === "openai" ? openAiKey : localKey
  const baseUrl = provider === "hosted" ? hostedBaseUrl : provider === "deepseek" ? deepseekBaseUrl : provider === "openai" ? openAiBaseUrl : localBaseUrl
  const defaultModel = provider === "hosted" ? "qwen3.5:9b" : provider === "deepseek" ? "deepseek-chat" : provider === "openai" ? "gpt-4o-mini" : "qwen2.5:7b"
  const effectiveModel = model || defaultModel

  return {
    provider, setProvider,
    openAiKey, setOpenAiKey,
    deepseekKey, setDeepseekKey,
    localKey, setLocalKey,
    openAiBaseUrl, setOpenAiBaseUrl,
    deepseekBaseUrl, setDeepseekBaseUrl,
    hostedBaseUrl, setHostedBaseUrl,
    localBaseUrl, setLocalBaseUrl,
    model, setModel,
    promptStyle, setPromptStyle,
    targetLang, setTargetLang,
    temperature, setTemperature,
    isTranslationEnabled, setIsTranslationEnabled,
    alwaysTranslateSites, isAlwaysTranslateSite, toggleAlwaysTranslateSite,

    // Computed values
    currentApiKey: apiKey,
    currentBaseUrl: baseUrl,
    defaultModel,
    effectiveModel
  }
}
