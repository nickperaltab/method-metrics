// builder/src/components/scorecards/GrrAccountTable.jsx
// Account drill table for the GRR by Industry page. Rows are billing ENTITIES
// (one row per EntityRecordID), already sorted by lost $ desc (LIMIT 200), each
// carrying the entity's primary label from v_entity_primary_label. Clicking a
// row lazy-loads its constituent Method accounts (an entity can span several)
// and shows each account's label + reasoning — so a multi-client biller (one
// entity = a gutter co + a landscaper + a CPA firm) is legible, not collapsed.
import React, { useState, useCallback } from 'react';
import { fetchCustomerAccounts } from '../../lib/grrIndustryData';

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
const labelTag = { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' };
const multiBadge = { marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '1px 7px', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', fontFamily: fontSans };

// Renders the constituent accounts of one entity (fetched lazily on expand).
function AccountDetail({ state }) {
  if (!state || state.loading) {
    return <div style={{ color: '#6b7280', fontFamily: fontSans, fontSize: 13 }}>Loading accounts…</div>;
  }
  if (state.error) {
    return <div style={{ color: '#b91c1c', fontFamily: fontSans, fontSize: 13 }}>{`Could not load accounts: ${state.error}`}</div>;
  }
  const accts = state.rows || [];
  if (accts.length === 0) {
    return <div style={{ color: '#6b7280', fontFamily: fontSans, fontSize: 13 }}>No labeled accounts found for this entity.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={labelTag}>{accts.length} account{accts.length === 1 ? '' : 's'} under this billing entity</div>
      {accts.map((a, j) => (
        <div key={a.company_account ?? j} style={{ borderLeft: '3px solid #e2e5e9', paddingLeft: 12 }}>
          <div style={{ fontWeight: 600, fontFamily: fontSans, color: '#1a1a1a' }}>
            {text(a.company_account)}
            <span style={{ marginLeft: 8, fontFamily: fontMono, fontSize: 12, color: '#9ca3af', fontWeight: 400 }}>
              {[a.l1, a.l2, a.l3].filter(Boolean).join(' › ') || '—'}
              {a.operating_model ? ` · ${a.operating_model}` : ''}
              {a.confidence != null ? ` · conf ${conf(a.confidence)}` : ''}
            </span>
          </div>
          {a.business_description && (
            <div style={{ marginTop: 4 }}><span style={labelTag}>What they do</span><div>{text(a.business_description)}</div></div>
          )}
          {a.short_reasoning && (
            <div style={{ marginTop: 4 }}><span style={labelTag}>Why this label</span><div>{text(a.short_reasoning)}</div></div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function GrrAccountTable({ rows }) {
  const [expanded, setExpanded] = useState(() => new Set());
  // Per-entity account detail, keyed by EntityRecordID: { loading, rows, error }.
  const [detail, setDetail] = useState(() => ({}));

  const loadDetail = useCallback((entityRecordId) => {
    if (entityRecordId == null) return;
    setDetail((prev) => {
      if (prev[entityRecordId]) return prev; // already loading / loaded
      return { ...prev, [entityRecordId]: { loading: true, rows: null, error: null } };
    });
    fetchCustomerAccounts({ entityRecordId })
      .then((accts) => setDetail((prev) => ({ ...prev, [entityRecordId]: { loading: false, rows: accts, error: null } })))
      .catch((e) => setDetail((prev) => ({ ...prev, [entityRecordId]: { loading: false, rows: null, error: e.message || 'Fetch failed' } })));
  }, []);

  if (!rows || rows.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16, fontFamily: fontSans }}>No accounts in this segment.</p>;
  }

  const toggle = (key, entityRecordId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); loadDetail(entityRecordId); }
      return next;
    });
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 10px', fontFamily: fontSans }}>
        {rows.length} entit{rows.length === 1 ? 'y' : 'ies'} · sorted by lost $ · click a row to see its Method accounts and why each was classified
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
            {rows.map((r, i) => {
              const key = r.EntityRecordID ?? r.Company ?? i;
              const isOpen = expanded.has(key);
              return (
                <React.Fragment key={key}>
                  <tr
                    onClick={() => toggle(key, r.EntityRecordID)}
                    style={{ cursor: 'pointer', background: isOpen ? '#f8fafc' : '' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isOpen ? '#f8fafc' : ''; }}
                  >
                    {COLUMNS.map((c) => (
                      <td key={c.key} style={c.left ? { ...td, textAlign: 'left', fontFamily: fontSans, fontWeight: c.key === 'Company' ? 600 : 400 } : td}>
                        {c.fmt(r[c.key])}
                        {c.key === 'Company' && r.is_multi_client && <span style={multiBadge}>multi-client</span>}
                      </td>
                    ))}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={COLUMNS.length} style={{ padding: '10px 16px 14px', background: '#f8fafc', borderBottom: '1px solid #f1f3f5', fontFamily: fontSans, fontSize: 13, color: '#374151', whiteSpace: 'normal' }}>
                        <AccountDetail state={detail[r.EntityRecordID]} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
