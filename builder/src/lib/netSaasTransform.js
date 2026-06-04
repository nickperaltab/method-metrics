// builder/src/lib/netSaasTransform.js
// Pure transforms for the Net SaaS bridge. No I/O.

// Maps config.bridge[].column (PascalCase, from int_customer_mrr) to the
// aggregate alias returned by buildBridgeSql (snake_case).
const COLUMN_TO_FIELD = {
  StartMRR: 'start_mrr',
  NewMRR: 'new_mrr',
  Expansions: 'expansion_mrr',
  Downgrades: 'downgrade_mrr',
  Cancellations: 'churn_mrr',
  p2_saas: 'end_mrr',
};

// Turn a bridge aggregate row + config into signed bar objects.
export function normalizeBridge(row, config) {
  if (!row) return [];
  return config.bridge.map((bar) => {
    const field = COLUMN_TO_FIELD[bar.column];
    const raw = Number(row[field] ?? 0);
    const sign = bar.sign ?? 1;            // totals have no sign -> +1
    return { key: bar.key, label: bar.label, type: bar.type, value: raw * sign };
  });
}

// Apply a lens to normalized bridge bars: mark visibility (totals always visible;
// delta bars visible iff in lensCfg.bars) and compute % of Start for delta bars
// when the lens uses dual labels. Totals never carry a pct.
export function applyLens(bars, lensCfg, startValue) {
  const visibleDeltas = new Set(lensCfg?.bars || []);
  return bars.map((b) => {
    if (b.type === 'total') return { ...b, visible: true, pct: null };
    const visible = visibleDeltas.has(b.key);
    const pct = (lensCfg?.labelMode === 'dual' && startValue)
      ? b.value / startValue
      : null;
    return { ...b, visible, pct };
  });
}

// Period-over-period delta. pct is null when prior is 0 (avoid div-by-zero).
export function computeDelta(current, prior) {
  const abs = current - prior;
  const pct = prior !== 0 ? abs / Math.abs(prior) : null;
  const direction = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
  return { abs, pct, direction };
}
