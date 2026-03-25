const BQ_CLIENT_ID = '546732685010-nojjfak7esmun2taour8r5pakrsrg3aq.apps.googleusercontent.com';
const BQ_PROJECT = 'project-for-method-dw';
const BQ_DATASET = 'revenue';

let bqToken = localStorage.getItem('bq_access_token');

export function getBqToken() {
  return bqToken;
}

export async function initBqAuth(onSuccess, onFail) {
  const stored = localStorage.getItem('bq_access_token');
  if (!stored) return;

  // Validate the token is still alive
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${stored}` },
    });
    if (res.ok) {
      bqToken = stored;
      onSuccess?.(stored);
    } else {
      // Token expired — clear it
      localStorage.removeItem('bq_access_token');
      bqToken = null;
      onFail?.();
    }
  } catch {
    localStorage.removeItem('bq_access_token');
    bqToken = null;
    onFail?.();
  }
}

export function connectBq(onSuccess) {
  if (!window.google?.accounts?.oauth2) return;
  google.accounts.oauth2.initTokenClient({
    client_id: BQ_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/bigquery https://www.googleapis.com/auth/userinfo.email',
    callback: (r) => {
      if (r.access_token) {
        bqToken = r.access_token;
        localStorage.setItem('bq_access_token', bqToken);
        onSuccess?.(bqToken);
      }
    },
  }).requestAccessToken();
}

export function disconnectBq() {
  bqToken = null;
  localStorage.removeItem('bq_access_token');
}

function cleanSql(sql) {
  return sql
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2260/g, '!=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=');
}

export async function queryBq(sql) {
  if (!bqToken) throw new Error('Not connected to BigQuery');
  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${bqToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: cleanSql(sql), useLegacySql: false, maxResults: 10000 }),
    }
  );
  if (!res.ok) {
    if (res.status === 401) {
      disconnectBq();
      throw new Error('BQ session expired — please reconnect');
    }
    throw new Error(`BQ ${res.status}`);
  }
  const data = await res.json();
  if (!data.rows) return { rows: [], schema: data.schema?.fields || [] };
  const fields = data.schema.fields;
  const rows = data.rows.map(r => {
    const o = {};
    fields.forEach((f, i) => { o[f.name] = r.f[i].v; });
    return o;
  });
  return { rows, schema: fields };
}

const viewCache = {};

export async function fetchViewData(viewName) {
  if (viewCache[viewName]) return viewCache[viewName];
  const sql = `SELECT * FROM \`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\` LIMIT 10000`;
  const result = await queryBq(sql);
  viewCache[viewName] = result;
  return result;
}

export function clearViewCache() {
  Object.keys(viewCache).forEach(k => delete viewCache[k]);
}
