// builder/src/components/scorecards/GrrAccountTable.jsx
// Account drill table for the GRR by Industry page. Rows come from
// fetchGrrAccounts (already sorted by lost $ desc, LIMIT 200). Clicking a row
// toggles an expansion showing business_description + short_reasoning — the
// "why was this account classified here" view. Styles mirror NetSaasAccountTable.
import React, { useState } from 'react';

const fontMono = "'JetBrains Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

function formatUsd(v) {
  if (v == null || v === '' || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${Math.round(abs)}`;
}
const text = (v) => (v == null || v === '' ? '—' : String(v));
const conf = (v) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(2));

const COLUMNS = [
  { key: 'Company', label: 'Company', fmt: text, left: true },
  { key: 'start_mrr', label: 'Start MRR', fmt: formatUsd },
  { key: 'churn_mrr', label: 'Churned $', fmt: formatUsd },
  { key: 'downgrade_mrr', label: 'Downgraded $', fmt: formatUsd },
  { key: 'l1', label: 'L1', fmt: text, left: true },
  { key: 'l2', label: 'L2', fmt: text, left: true },
  { key: 'l3', label: 'L3', fmt: text, left: true },
  { key: 'operating_model', label: 'Op model', fmt: text, left: true },
  { key: 'confidence', label: 'Conf', fmt: conf },
];

const th = { textAlign: 'right', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid #e2e5e9', whiteSpace: 'nowrap', fontFamily: fontSans };
const td = { textAlign: 'right', padding: '7px 12px', fontFamily: fontMono, fontSize: 13, color: '#374151', borderBottom: '1px solid #f1f3f5', whiteSpace: 'nowrap' };

export default function GrrAccountTable({ rows }) {
  const [expanded, setExpanded] = useState(() => new Set());

  if (!rows || rows.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16, fontFamily: fontSans }}>No accounts in this segment.</p>;
  }

  const toggle = (i) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <div>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 10px', fontFamily: fontSans }}>
        {rows.length} account{rows.length === 1 ? '' : 's'} · sorted by lost $ · click a row for the classification reasoning
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} style={c.left ? { ...th, textAlign: 'left' } : th}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <React.Fragment key={r.Company ?? i}>
                <tr
                  onClick={() => toggle(i)}
                  style={{ cursor: 'pointer', background: expanded.has(i) ? '#f8fafc' : '' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = expanded.has(i) ? '#f8fafc' : ''; }}
                >
                  {COLUMNS.map((c) => (
                    <td key={c.key} style={c.left ? { ...td, textAlign: 'left', fontFamily: fontSans, fontWeight: c.key === 'Company' ? 600 : 400 } : td}>
                      {c.fmt(r[c.key])}
                    </td>
                  ))}
                </tr>
                {expanded.has(i) && (
                  <tr>
                    <td colSpan={COLUMNS.length} style={{ padding: '10px 16px 14px', background: '#f8fafc', borderBottom: '1px solid #f1f3f5', fontFamily: fontSans, fontSize: 13, color: '#374151', whiteSpace: 'normal' }}>
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>What they do</span>
                        <div>{text(r.business_description)}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>Why this label</span>
                        <div>{text(r.short_reasoning)}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
