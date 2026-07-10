import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { searchAccounts, fetchAccountDetail, epochToDate } from '../lib/bqCustomerExplorer';

function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function confidenceColor(c) {
  if (c == null) return '#6b7280';
  if (c >= 0.8) return '#059669';
  if (c >= 0.5) return '#f59e0b';
  return '#dc2626';
}

function boolBadge(v, label) {
  if (v == null) return null;
  return (
    <span style={{ ...s.badge, color: v ? '#059669' : '#6b7280', borderColor: v ? '#a7f3d0' : '#e2e5e9', background: v ? '#ecfdf5' : '#f8f9fa' }}>
      {label}: {v ? 'Yes' : 'No'}
    </span>
  );
}

function Metric({ label, value }) {
  return (
    <div style={s.metric}>
      <span style={s.metricLabel}>{label}</span>
      <span style={s.metricValue}>{value == null || value === '' ? '—' : value}</span>
    </div>
  );
}

function MrrTrend({ rows }) {
  if (!rows.length) return <div style={s.empty}>No MRR history found for this customer.</div>;
  const max = Math.max(...rows.map((r) => Number(r.p2_saas) || 0), 1);
  return (
    <div style={s.trendTable}>
      {rows.map((r) => {
        const val = Number(r.p2_saas) || 0;
        const moved = ['NewMRR', 'Expansions', 'Downgrades', 'Cancellations'].filter((k) => Number(r[k]) > 0);
        return (
          <div key={r.Month} style={s.trendRow}>
            <span style={s.trendMonth}>{r.Month}</span>
            <div style={s.trendBarTrack}>
              <div style={{ ...s.trendBarFill, width: `${(val / max) * 100}%` }} />
            </div>
            <span style={s.trendValue}>${val.toLocaleString()}</span>
            {moved.length > 0 && <span style={s.trendMoved}>{moved.join(', ')}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function PsHubBqExplorer({ bqConnected, onConnect }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  async function runSearch(e) {
    e?.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const rows = await searchAccounts(search);
      setResults(rows);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function selectAccount(row) {
    setSelected(row);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const d = await fetchAccountDetail(row.account_record_id);
      setDetail(d);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  if (!bqConnected) {
    return (
      <div style={s.layout}>
        <Link to="/ps-hub" style={s.backLink}>← PS Hub</Link>
        <div style={s.connectCard}>
          <h2 style={s.sectionTitle}>BigQuery Customer Explorer (prototype)</h2>
          <p style={s.subtitle}>This page queries BigQuery live and read-only — it needs your Google account connected (the same "Connect Google Account" the rest of the app uses).</p>
          <button style={s.connectBtn} onClick={onConnect}>Connect Google Account</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.layout}>
      <Link to="/ps-hub" style={s.backLink}>← PS Hub</Link>
      <div style={s.header}>
        <h1 style={s.title}>BigQuery Customer Explorer</h1>
        <p style={s.subtitle}>Prototype — live, read-only join across account_labels, net.accounts, and revenue.int_customers/int_customer_mrr. Nothing here writes anywhere.</p>
      </div>

      <form onSubmit={runSearch} style={s.searchRow}>
        <input
          style={s.search}
          placeholder="Search company_account (e.g. acme, wines, supply)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" style={s.connectBtn} disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>

      {searchError && <div style={{ ...s.empty, color: '#dc2626' }}>{searchError}</div>}

      <div style={s.splitLayout}>
        <div style={s.resultsCol}>
          {results.length === 0 && !searching && <div style={s.empty}>Search for an account to begin.</div>}
          {results.map((r) => (
            <div
              key={r.account_record_id}
              onClick={() => selectAccount(r)}
              style={{ ...s.resultCard, ...(selected?.account_record_id === r.account_record_id ? s.resultCardActive : {}) }}
            >
              <div style={s.resultName}>{r.company_account}</div>
              <div style={s.resultMeta}>
                {r.l1 || 'Unclassified'}{r.l2 ? ` · ${r.l2}` : ''}
                {r.confidence != null && (
                  <span style={{ marginLeft: 8, color: confidenceColor(Number(r.confidence)) }}>
                    {(Number(r.confidence) * 100).toFixed(0)}% conf.
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={s.detailCol}>
          {!selected && <div style={s.empty}>Select an account from the results to see its BigQuery snapshot.</div>}
          {selected && detailLoading && <div style={s.empty}>Loading BigQuery data...</div>}
          {selected && detailError && <div style={{ ...s.empty, color: '#dc2626' }}>{detailError}</div>}

          {selected && detail && (
            <>
              <div style={s.detailHeader}>
                <h2 style={s.detailName}>{detail.label?.company_account || selected.company_account}</h2>
                <p style={s.idLine}>account_record_id {selected.account_record_id}{detail.customerRecordId ? ` · customer_record_id (EntityRecordID) ${detail.customerRecordId}` : ' · no revenue-side match'}</p>
                {detail.label && (
                  <p style={s.breadcrumb}>
                    {[detail.label.l1, detail.label.l2, detail.label.l3].filter(Boolean).join(' → ')}
                    {detail.label.operating_model ? ` · ${detail.label.operating_model}` : ''}
                    {detail.label.confidence != null && (
                      <span style={{ color: confidenceColor(detail.label.confidence), marginLeft: 8 }}>
                        {(detail.label.confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                  </p>
                )}
                {detail.label?.business_description && <p style={s.description}>{detail.label.business_description}</p>}
              </div>

              <div style={s.badgeRow}>
                {boolBadge(detail.customerLatest?.HasDEP, 'DEP')}
                {boolBadge(detail.customerLatest?.IsActive ?? detail.usage?.company_active, 'Active')}
                {boolBadge(detail.customerLatest?.IsChurned, 'Churned')}
                {detail.customerLatest?.Segment && <span style={s.badge}>Segment: {detail.customerLatest.Segment}</span>}
                {detail.customerLatest?.UserTier && <span style={s.badge}>Tier: {detail.customerLatest.UserTier}</span>}
                {detail.usage?.company_onboarding_status && <span style={s.badge}>Onboarding: {detail.usage.company_onboarding_status}</span>}
              </div>

              <div style={s.section}>
                <h3 style={s.sectionTitle}>Snapshot</h3>
                <div style={s.metricsGrid}>
                  <Metric label="Billed users (int_customers)" value={detail.customerLatest?.TotalUsers} />
                  <Metric label="Product users (net.accounts)" value={detail.usage?.company_user_count} />
                  <Metric label="Employee count" value={detail.usage?.company_employee_count} />
                  <Metric label="Health score" value={detail.usage?.company_health_score} />
                  <Metric label="Monthly cost" value={detail.usage?.company_monthly_subscription_cost != null ? `$${detail.usage.company_monthly_subscription_cost}` : null} />
                  <Metric label="Last login" value={fmtDate(epochToDate(detail.usage?.company_last_login_date))} />
                  <Metric label="Signup date" value={fmtDate(epochToDate(detail.usage?.company_signup_date))} />
                  <Metric label="Method rep" value={detail.usage?.company_method_rep_fullname ? `${detail.usage.company_method_rep_fullname} (${detail.usage.company_method_rep_email})` : detail.usage?.company_method_rep_email} />
                </div>
                <p style={s.note}>"Billed users" and "Product users" come from two different BQ sources (revenue vs. product analytics) — worth checking whether they reconcile per account.</p>
              </div>

              <div style={s.section}>
                <h3 style={s.sectionTitle}>MRR trend (last 12 months)</h3>
                <MrrTrend rows={detail.mrrTrend} />
              </div>

              <div style={s.section}>
                <h3 style={s.sectionTitle}>Call-prep snapshot history</h3>
                {detail.callSnapshots.length === 0 ? (
                  <div style={s.empty}>No call-prep snapshot history yet — the routine hasn't produced any rows for this account.</div>
                ) : (
                  <ul style={s.list}>
                    {detail.callSnapshots.map((snap, i) => (
                      <li key={i} style={s.listRow}>
                        <span>{snap.snapshot_date} · {snap.call_type} · {snap.consultant}</span>
                        <span style={{ color: '#6b7280' }}>{snap.sync_status || '—'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto' },
  backLink: { fontSize: 13, color: '#6b7280', textDecoration: 'none' },
  header: { margin: '8px 0 20px' },
  title: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0 },
  subtitle: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  connectCard: { background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 8, padding: 24, marginTop: 16 },
  connectBtn: { padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginTop: 12 },
  searchRow: { display: 'flex', gap: 10, marginBottom: 20 },
  search: { flex: 1, maxWidth: 400, background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', padding: '8px 12px', borderRadius: 4, fontSize: 13, fontFamily: "'DM Sans', sans-serif" },
  splitLayout: { display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'flex-start' },
  resultsCol: { display: 'flex', flexDirection: 'column', gap: 8 },
  resultCard: { background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 6, padding: 10, cursor: 'pointer' },
  resultCardActive: { borderColor: '#059669', background: '#ecfdf5' },
  resultName: { fontSize: 13, fontWeight: 700, color: '#1a1a1a' },
  resultMeta: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  detailCol: { background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 8, padding: 20, minHeight: 200 },
  detailHeader: { marginBottom: 12 },
  detailName: { fontSize: 18, fontWeight: 700, color: '#1a1a1a', margin: 0 },
  idLine: { fontSize: 11, color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 },
  breadcrumb: { fontSize: 13, color: '#374151', marginTop: 8 },
  description: { fontSize: 13, color: '#6b7280', marginTop: 8, lineHeight: 1.5 },
  badgeRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  badge: { fontSize: 11, fontWeight: 600, color: '#374151', border: '1px solid #e2e5e9', borderRadius: 4, padding: '3px 8px', background: '#f8f9fa' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  metric: { display: 'flex', flexDirection: 'column', gap: 2 },
  metricLabel: { fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' },
  metricValue: { fontSize: 14, fontWeight: 600, color: '#1a1a1a' },
  note: { fontSize: 11, color: '#9ca3af', marginTop: 10, fontStyle: 'italic' },
  trendTable: { display: 'flex', flexDirection: 'column', gap: 4 },
  trendRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 },
  trendMonth: { width: 70, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
  trendBarTrack: { flex: 1, height: 8, background: '#f1f3f5', borderRadius: 4, overflow: 'hidden', maxWidth: 200 },
  trendBarFill: { height: '100%', background: '#059669' },
  trendValue: { width: 70, textAlign: 'right', color: '#374151', fontWeight: 600 },
  trendMoved: { color: '#f59e0b', fontSize: 11 },
  list: { listStyle: 'none', margin: 0, padding: 0, border: '1px solid #e2e5e9', borderRadius: 8, overflow: 'hidden' },
  listRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #f1f3f5', fontSize: 13, color: '#374151' },
  empty: { color: '#6b7280', fontSize: 13, padding: 24, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
};
