// builder/src/lib/motionFunnelTransform.js
// Pure: joint distribution over the 5 journey flags -> ECharts Sankey nodes/links.
export const STAGES = [
  { key:'synced',        yes:'Sync',                no:'No sync',          color:'#3b82f6' },
  { key:'demo_attended', yes:'Demo',                no:'No demo',          color:'#0ea5e9' },
  { key:'free_attended', yes:'Free hour',           no:'No free hour',     color:'#0891b2' },
  { key:'converted',     yes:'Converted',           no:'Not converted',    color:'#059669' },
  { key:'is_customized', yes:'Paid project hours',  no:'No project hours', color:'#7c3aed' },
];
const TRIAL = 'Trial';
const NEG = '#dde2e8';
const num = (v) => Number(v) || 0;
// BigQuery's REST API returns BOOL columns as the strings "true"/"false", so a
// plain Number() coercion yields NaN→0 and every flag reads false. Treat the
// string/number/boolean forms uniformly.
const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

export function goalNodeName(goal) { return goal === 'convert' ? 'Converted' : 'Paid project hours'; }

export function toSankey(rows = [], goal = 'paid') {
  const active = goal === 'convert' ? STAGES.slice(0, 4) : STAGES; // stop after Converted
  const total = rows.reduce((a, r) => a + num(r.n), 0);
  const nodes = [{ name: TRIAL, itemStyle: { color: '#64748b', borderColor: '#64748b' } }];
  active.forEach((s) => {
    nodes.push({ name: s.yes, itemStyle: { color: s.color, borderColor: s.color } });
    nodes.push({ name: s.no,  itemStyle: { color: NEG, borderColor: NEG } });
  });
  const sum = (pred) => rows.reduce((a, r) => a + (pred(r) ? num(r.n) : 0), 0);
  const links = [];
  const first = active[0];
  links.push({ source: TRIAL, target: first.yes, value: sum((r) => truthy(r[first.key])) });
  links.push({ source: TRIAL, target: first.no,  value: sum((r) => !truthy(r[first.key])) });
  for (let i = 0; i < active.length - 1; i++) {
    const a = active[i], b = active[i + 1];
    [[true, a.yes], [false, a.no]].forEach(([av, an]) => {
      [[true, b.yes], [false, b.no]].forEach(([bv, bn]) => {
        const v = sum((r) => truthy(r[a.key]) === av && truthy(r[b.key]) === bv);
        if (v > 0) links.push({ source: an, target: bn, value: v });
      });
    });
  }
  return { total, nodes, links };
}
