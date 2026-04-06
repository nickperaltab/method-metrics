// builder/tests/integration/scorecard-live.test.js
// Run: BQ_TOKEN=$(gcloud auth print-access-token) node --test builder/tests/integration/scorecard-live.test.js

import { describe, it, before, skip } from 'node:test';
import assert from 'node:assert';

const BQ_PROJECT = 'project-for-method-dw';
let BQ_TOKEN;

before(() => {
  BQ_TOKEN = process.env.BQ_TOKEN;
  if (!BQ_TOKEN) console.log('BQ_TOKEN not set — skipping integration tests');
});

async function queryBq(sql) {
  if (!BQ_TOKEN) return null;
  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${BQ_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, useLegacySql: false, maxResults: 10000 }),
    }
  );
  if (!res.ok) throw new Error(`BQ ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.rows) return [];
  const fields = data.schema.fields;
  return data.rows.map(r => {
    const o = {};
    fields.forEach((f, i) => { o[f.name] = r.f[i].v; });
    return o;
  });
}

describe('UNION ALL batching — real BQ', () => {
  it('batched query returns same data as individual queries', async () => {
    if (!BQ_TOKEN) return skip('No BQ_TOKEN');
    const sql1 = `SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.v_trials\` WHERE SignupDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH), MONTH) GROUP BY 1 ORDER BY 1`;
    const sql2 = `SELECT FORMAT_DATE('%Y-%m', SyncDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.v_syncs\` WHERE SyncDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH), MONTH) GROUP BY 1 ORDER BY 1`;

    const [rows1, rows2] = await Promise.all([queryBq(sql1), queryBq(sql2)]);

    const batchSql = `SELECT 'trials' AS _key, sub.* FROM (${sql1}) sub
UNION ALL
SELECT 'syncs' AS _key, sub.* FROM (${sql2}) sub
ORDER BY _key, period`;
    const batchRows = await queryBq(batchSql);

    const batchTrials = batchRows.filter(r => r._key === 'trials');
    const batchSyncs = batchRows.filter(r => r._key === 'syncs');

    assert.strictEqual(batchTrials.length, rows1.length);
    assert.strictEqual(batchSyncs.length, rows2.length);
    for (let i = 0; i < rows1.length; i++) {
      assert.strictEqual(batchTrials[i].period, rows1[i].period);
      assert.strictEqual(batchTrials[i].value, rows1[i].value);
    }
  });

  it('row ordering is preserved within each key', async () => {
    if (!BQ_TOKEN) return skip('No BQ_TOKEN');
    const sql = `SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.v_trials\` WHERE SignupDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`;

    const batchSql = `SELECT 'trials' AS _key, sub.* FROM (${sql}) sub
ORDER BY _key, period`;
    const rows = await queryBq(batchSql);

    const periods = rows.map(r => r.period);
    const sorted = [...periods].sort();
    assert.deepStrictEqual(periods, sorted, 'Periods should be in chronological order');
  });

  it('empty sub-query does not break other results', async () => {
    if (!BQ_TOKEN) return skip('No BQ_TOKEN');
    const realSql = `SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.v_trials\` WHERE SignupDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH), MONTH) GROUP BY 1 ORDER BY 1`;
    const emptySql = `SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.v_trials\` WHERE SignupDate = DATE('1900-01-01') GROUP BY 1 ORDER BY 1`;

    const batchSql = `SELECT 'real' AS _key, sub.* FROM (${realSql}) sub
UNION ALL
SELECT 'empty' AS _key, sub.* FROM (${emptySql}) sub
ORDER BY _key, period`;
    const rows = await queryBq(batchSql);

    assert.ok(rows.filter(r => r._key === 'real').length > 0, 'Real query should return data');
    assert.strictEqual(rows.filter(r => r._key === 'empty').length, 0, 'Empty query should return 0 rows');
  });

  it('batch of 5 scorecard-style queries completes under 15s', async () => {
    if (!BQ_TOKEN) return skip('No BQ_TOKEN');
    const queries = [
      `SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.v_trials\` WHERE SignupDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`,
      `SELECT FORMAT_DATE('%Y-%m', SyncDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.v_syncs\` WHERE SyncDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`,
      `SELECT FORMAT_DATE('%Y-%m', FirstSaaSInvoiceTxnDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.v_conversions\` WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`,
      `SELECT FORMAT_DATE('%Y-%m', CancellationDate) AS period, COUNT(DISTINCT CompanyAccount) AS value FROM \`project-for-method-dw.revenue.v_cancellations\` WHERE CancellationDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`,
      `SELECT FORMAT_DATE('%Y-%m', TxnDate) AS period, ROUND(SUM(SaaSAmount),2) AS value FROM \`project-for-method-dw.revenue.v_new_net_saas\` WHERE TxnDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`,
    ];
    const parts = queries.map((sql, i) => `SELECT 'q${i}' AS _key, sub.* FROM (${sql}) sub`);
    const batchSql = parts.join('\nUNION ALL\n') + '\nORDER BY _key, period';

    const start = Date.now();
    const rows = await queryBq(batchSql);
    const elapsed = Date.now() - start;

    assert.ok(rows.length > 0, 'Batch should return rows');
    console.log(`  Batch of ${queries.length} queries: ${rows.length} rows in ${elapsed}ms`);
    assert.ok(elapsed < 15000, `Batch took ${elapsed}ms — expected under 15s`);
  });
});
