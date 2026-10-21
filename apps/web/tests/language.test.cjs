const test = require('node:test');
const assert = require('node:assert/strict');
const loadSource = require('./load-source.cjs');
const { translate, localizedLocation, translationCatalog } = loadSource()('../src/i18n/messages.ts');
const { LANGUAGES, defaultTargetLanguage } = loadSource()('../src/i18n/languages.ts');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

test.afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete globalThis.window;
});

function memoryStorage(settings) {
  const items = new Map(settings ? [['readacross-settings', JSON.stringify({ state: settings, version: 0 })]] : []);
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key),
  };
}
function loadSettings(storage) {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  return loadSource()('../src/store/useSettingsStore.ts').useSettingsStore;
}

test('first visit uses Chinese UI and English target regardless of browser language', () => {
  const store = loadSettings(memoryStorage());
  assert.equal(store.getState().interfaceLanguage, 'zh-CN');
  assert.equal(store.getState().targetLanguage, 'English');
});

test('switching UI language resets the target and persists both across reloads', () => {
  const storage = memoryStorage();
  let store = loadSettings(storage);
  store.getState().setInterfaceLanguage('en');
  assert.equal(store.getState().targetLanguage, '简体中文');
  store = loadSettings(storage);
  assert.equal(store.getState().interfaceLanguage, 'en');
  assert.equal(store.getState().targetLanguage, '简体中文');
  store.getState().setInterfaceLanguage('zh-CN');
  store = loadSettings(storage);
  assert.equal(store.getState().interfaceLanguage, 'zh-CN');
  assert.equal(store.getState().targetLanguage, 'English');
});

test('all seven UI languages use native names and restore their saved choice', () => {
  assert.deepEqual(LANGUAGES.map(language => language.name), ['简体中文', 'English', '日本語', 'Français', 'Deutsch', 'Português', '繁體中文']);
  assert.deepEqual(LANGUAGES.map(language => language.target), LANGUAGES.map(language => language.name));
  const storage = memoryStorage();
  for (const { code } of LANGUAGES) {
    const store = loadSettings(storage);
    store.getState().setInterfaceLanguage(code);
    const restored = loadSettings(storage).getState();
    assert.equal(restored.interfaceLanguage, code);
    assert.equal(restored.targetLanguage, code.startsWith('zh-') ? 'English' : '简体中文');
    restored.setTargetLanguage('日本語');
    assert.equal(loadSettings(storage).getState().targetLanguage, '日本語');
  }
});

test('every non-English language covers the full interface and preserves interpolation values', () => {
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const { code } of LANGUAGES.filter(language => language.code !== 'en')) {
    for (const key of Object.keys(translationCatalog['zh-CN'])) {
      assert.ok(Object.hasOwn(translationCatalog[code], key), `${code} is missing ${key}`);
      assert.ok(translationCatalog[code][key].trim(), `${code} has an empty ${key}`);
      assert.deepEqual(placeholders(translationCatalog[code][key]), placeholders(key), `${code}: ${key}`);
    }
  }
  assert.equal(translate('ja', 'Settings'), '設定');
  assert.equal(translate('fr', 'Settings'), 'Paramètres');
  assert.equal(translate('de', 'Settings'), 'Einstellungen');
  assert.equal(translate('pt', 'Settings'), 'Configurações');
  assert.equal(translate('zh-TW', 'Translation Settings'), '翻譯設定');
});

test('manual target choice survives reloads and resaving the same UI language', () => {
  const storage = memoryStorage();
  let store = loadSettings(storage);
  store.getState().setTargetLanguage('日本語');
  store.getState().setInterfaceLanguage('zh-CN');
  store = loadSettings(storage);
  assert.equal(store.getState().targetLanguage, '日本語');
  store.getState().setInterfaceLanguage('en');
  store.getState().setTargetLanguage('English');
  store = loadSettings(storage);
  assert.equal(store.getState().interfaceLanguage, 'en');
  assert.equal(store.getState().targetLanguage, 'English');
});

test('old settings adopt the new defaults and keep provider and custom settings', () => {
  const existing = { provider: 'local', baseUrl: 'http://localhost:11434/v1', model: 'test-model',
    targetLanguage: '简体中文', temperature: 0.4, customPrompts: [{ id: 'p1', name: 'My prompt', prompt: 'Keep this' }] };
  const store = loadSettings(memoryStorage(existing));
  assert.equal(store.getState().interfaceLanguage, 'zh-CN');
  assert.equal(store.getState().targetLanguage, 'English');
  for (const key of ['provider', 'baseUrl', 'model', 'temperature', 'customPrompts']) {
    assert.deepEqual(store.getState()[key], existing[key]);
  }
  assert.equal(loadSettings(memoryStorage({ targetLanguage: 'Deutsch' })).getState().targetLanguage, 'Deutsch');
});

test('incomplete or invalid saved language settings fall back to Chinese UI', () => {
  for (const settings of [{}, { interfaceLanguage: 'unknown' }, { interfaceLanguage: 'en' }, { interfaceLanguage: 'zh-CN', targetLanguage: '' }]) {
    const state = loadSettings(memoryStorage(settings)).getState();
    const language = settings.interfaceLanguage === 'en' ? 'en' : 'zh-CN';
    assert.equal(state.interfaceLanguage, language);
    assert.equal(state.targetLanguage, defaultTargetLanguage(language));
  }
});

test('labels, dynamic counts, locations and application errors follow UI language', () => {
  assert.equal(translate('zh-CN', 'Settings'), '设置');
  assert.equal(translate('en', 'Settings'), 'Settings');
  assert.equal(translate('zh-CN', '{count} image(s) selected', { count: 2 }), '已选择 2 张图片');
  assert.equal(translate('en', '{count} image(s)', { count: 1 }), '1 Image');
  assert.equal(translate('en', '{count} image(s)', { count: 2 }), '2 Images');
  assert.equal(translate('zh-CN', 'Please configure an API key in settings first.'), '请先在设置中配置 API 密钥。');
  assert.equal(translate('zh-CN', 'Provider-specific error'), 'Provider-specific error');
  assert.equal(localizedLocation('zh-CN', { type: 'pdf', page: 3 }), '第 3 页');
  assert.equal(localizedLocation('en', { type: 'pdf', page: 3 }), 'Page 3');
  assert.equal(localizedLocation('zh-CN', { type: 'epub', cfi: 'test', section: 1 }), 'EPUB · 第 2 章');
  assert.equal(localizedLocation('en', { type: 'epub', cfi: 'test' }), 'EPUB');
});
