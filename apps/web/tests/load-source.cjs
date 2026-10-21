const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

module.exports = function sourceLoader(stubs = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(__dirname, filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} };
    cache.set(filename, mod);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const resolve = id => {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), `${id}.ts`));
      return require(id);
    };
    new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports);
    return mod.exports;
  }
  return load;
};
