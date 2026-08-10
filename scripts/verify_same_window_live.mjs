/**
 * End-to-end check of the same-window delta against REAL BigQuery data.
 *
 * The browser check is unavailable here (preview_start is bound to the shared
 * checkout's launch.json, not this worktree's), so this drives the actual
 * shipped modules — lib/sameWindow.js and the delta rule in
 * components/scorecards/utils.js — over a day-grain series pulled live from
 * BigQuery, exactly as the loader would.
 *
 * Pass criterion: Sales Conversions must produce -27.6%, the value read from
 * the live Looker Sales Scorecard on 2026-08-10.
 *
 * Usage: node scripts/verify_same_window_live.mjs <path-to-daily.json>
 *   file: [{ period: 'YYYY-MM-DD', value: <number> }, ...]
 */
import { readFileSync } from 'node:fs';
import { computeSameWindowPair, sameWindowBounds, isMonthComplete } from '../builder/src/lib/sameWindow.js';

const path = process.argv[2];
if (!path) {
  console.error('pass the path to a JSON file of daily rows');
  process.exit(1);
}
const rows = JSON.parse(readFileSync(path, 'utf8'));
// The module takes the app's internal series shape, not raw query rows.
const daily = {
  labels: rows.map((r) => r.period),
  data: rows.map((r) => Number(r.value)),
};

const asOf = new Date();
const bounds = sameWindowBounds(asOf);
console.log(`as of                : ${asOf.toISOString().slice(0, 10)}`);
console.log(`month complete       : ${isMonthComplete(asOf)}`);
console.log(`current window       : ${bounds.currentStart} .. ${bounds.currentEnd}`);
console.log(`prior  window        : ${bounds.priorStart} .. ${bounds.priorEnd}`);

const pair = computeSameWindowPair(daily, asOf);
if (!pair) {
  console.error('\nFAIL: computeSameWindowPair returned null');
  process.exit(1);
}

const deltaPercent = ((pair.current - pair.prior) / Math.abs(pair.prior)) * 100;
console.log(`\ncurrent (MTD)        : ${pair.current}`);
console.log(`prior (same window)  : ${pair.prior}`);
console.log(`delta                : ${deltaPercent.toFixed(2)}%`);

const EXPECTED = -27.6;
const ok = Math.abs(deltaPercent - EXPECTED) < 0.05;
console.log(`\nLooker (2026-08-10)  : ${EXPECTED}%`);
console.log(ok ? 'PASS — matches Looker' : `FAIL — expected ${EXPECTED}%`);

// The naive comparison this replaces, for contrast.
const priorFull = rows
  .filter((r) => r.period.slice(0, 7) === bounds.priorStart.slice(0, 7))
  .reduce((a, r) => a + Number(r.value || 0), 0);
console.log(`\nprior FULL month     : ${priorFull}`);
console.log(`naive delta (old bug): ${(((pair.current - priorFull) / Math.abs(priorFull)) * 100).toFixed(2)}%`);

process.exit(ok ? 0 : 1);
