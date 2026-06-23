const REPO = 'https://github.com/nickperaltab/method-metrics/blob/main/';

export function indexModels(models) {
  const idx = new Map();
  for (const m of models || []) {
    if (m.name) idx.set(m.name, m);
    if (m.alias) idx.set(m.alias, m);
  }
  return idx;
}

export function getDbtModel(index, key) {
  if (!index || !key) return null;
  return index.get(key) || null;
}

export function dbtModelLink(originalFilePath) {
  return originalFilePath ? REPO + originalFilePath : null;
}

// Runtime loader — cached singleton + in-flight promise deduplication.
let _cache = null;
let _promise = null;
export async function loadDbtModelIndex() {
  if (_cache) return _cache;
  if (!_promise) {
    const url = (import.meta.env?.BASE_URL || '/') + 'dbt-models.json';
    _promise = fetch(url)
      .then(r => (r.ok ? r.json() : { models: [] }))
      .then(j => { _cache = indexModels(j.models || []); return _cache; })
      .catch(() => { _cache = new Map(); return _cache; });
  }
  return _promise;
}
