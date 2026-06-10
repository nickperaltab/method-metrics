// builder/src/components/scorecards/FunnelDrill.jsx
// Controller for the Acquisition Funnel scorecard. Wires together the L1/L2
// funnel chart (FunnelChart) + optional segment-compare table, the L3 account
// table (reusing NetSaasAccountTable), the L4 account detail (reusing
// AccountDetail), the drill breadcrumb, and the cohort-month / segment controls.
//
// Mirrors DecompositionDrill: it owns all fetch orchestration + drill state, and
// reuses the same leaf components from the sibling "SaaS MRR Movement" dashboard.

import { useState, useEffect } from 'react';
import { ChartErrorBoundary } from '../EChart';
import FunnelChart from './FunnelChart';
import NetSaasAccountTable from './NetSaasAccountTable';
import AccountDetail from './AccountDetail';
import DrillBreadcrumb from './DrillBreadcrumb';
import { normalizeFunnel, isCohortMature } from '../../lib/funnelTransform';
import { fetchFunnelSpine, fetchConversionMrr, fetchFunnelAccounts } from '../../lib/funnelData';
import { fetchAccountHistory, fetchAccountLifecycle } from '../../lib/netSaasData';

// ── date helpers ────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }
function monthStartISO(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`; // 'YYYY-MM-01'
}
function todayISO() {
  const n = new Date();
  return `${n.getUTCFullYear()}-${pad2(n.getUTCMonth() + 1)}-${pad2(n.getUTCDate())}`;
}
function monthLabel(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
// Last N month-start ISO strings, most recent first, anchored to this month.
function recentMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    out.push(monthStartISO(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return out;
}

// L3 funnel account-table columns (rows = output of fetchFunnelAccounts).
const FUNNEL_L3_COLUMNS = [
  { key: 'Company', label: 'Company', format: 'text' },
  { key: 'Vertical', label: 'Vertical', format: 'text' },
  { key: 'SignupCountry', label: 'Country', format: 'text' },
  { key: 'deltaMrr', label: 'MRR', format: 'currency' },
];

const sectionLabel = { fontSize: 13, color: '#6b7280', fontFamily: "'DM Sans', sans-serif" };

const STAGE_LABEL = { trial: 'Trial', synced: 'Sync', converted: 'Converted' };
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export default function FunnelDrill({ cfg, bqConnected, onConnect }) {
  const months = recentMonths(24);
  const maturityDays = cfg.maturityDays;
  const today = todayISO();

  // Default cohort = most recent mature month, else the oldest listed month.
  const defaultMonth = months.find((m) => isCohortMature(m, today, maturityDays)) || months[months.length - 1];

  const [cohortMonth, setCohortMonth] = useState(defaultMonth);
  const [segment, setSegment] = useState(null);
  const [stage, setStage] = useState(null);
  const [account, setAccount] = useState(null);

  const [spine, setSpine] = useState(null);
  const [conversionMrr, setConversionMrr] = useState(null);
  const [segmentRows, setSegmentRows] = useState(null);
  const [l3, setL3] = useState(null);
  const [accountHistory, setAccountHistory] = useState(null);
  const [accountLifecycle, setAccountLifecycle] = useState(null);

  const [funnelLoading, setFunnelLoading] = useState(false);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [l3Loading, setL3Loading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [error, setError] = useState(null);

  const mature = isCohortMature(cohortMonth, today, maturityDays);
  const stages = normalizeFunnel((spine && spine[0]) || {});

  // ── L1: fetch funnel spine + conversion $ whenever cohort month changes ──────
  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    setFunnelLoading(true);
    setError(null);
    // Reset deeper drill state so we never show stale stage/account data.
    setStage(null);
    setAccount(null);
    setL3(null);
    setAccountHistory(null);
    setAccountLifecycle(null);

    Promise.all([
      fetchFunnelSpine({ cohortMonth, segment: null }),
      fetchConversionMrr({ cohortMonth }),
    ])
      .then(([spineRows, mrr]) => {
        if (cancelled) return;
        setSpine(spineRows);
        setConversionMrr(mrr);
      })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setFunnelLoading(false); });

    return () => { cancelled = true; };
  }, [cohortMonth]);

  // ── segment-compare rows: only when a segment lens is selected ───────────────
  useEffect(() => {
    if (!segment) { setSegmentRows(null); return; }
    let cancelled = false;
    setSegmentLoading(true);
    fetchFunnelSpine({ cohortMonth, segment })
      .then((rows) => { if (!cancelled) setSegmentRows(rows); })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setSegmentLoading(false); });
    return () => { cancelled = true; };
  }, [cohortMonth, segment]);

  // ── handlers ─────────────────────────────────────────────────────────────────
  const clearAccount = () => {
    setAccount(null);
    setAccountHistory(null);
    setAccountLifecycle(null);
  };

  const handleSegmentChange = (key) => {
    setSegment(key || null);
    setStage(null);
    setL3(null);
    clearAccount();
  };

  const handleStageClick = (stageKey) => {
    setStage(stageKey);
    setL3(null);
    clearAccount();
    setL3Loading(true);
    setError(null);
    fetchFunnelAccounts({ cohortMonth, stage: stageKey })
      .then((rows) => setL3(rows))
      .catch((e) => setError(e))
      .finally(() => setL3Loading(false));
  };

  const handleAccountClick = (row) => {
    if (!row?.entity_record_id) return;
    setAccount(row);
    setAccountLoading(true);
    setAccountHistory(null);
    setAccountLifecycle(null);
    Promise.all([
      fetchAccountHistory({ entityRecordId: row.entity_record_id }),
      fetchAccountLifecycle({ entityRecordId: row.entity_record_id }),
    ])
      .then(([hist, life]) => { setAccountHistory(hist); setAccountLifecycle(life); })
      .catch((e) => setError(e))
      .finally(() => setAccountLoading(false));
  };

  const handleNavigate = (level) => {
    // level 0 = Funnel root; level 1 = stage; level 2 = account leaf.
    if (level <= 1) clearAccount();
    if (level === 0) { setStage(null); setL3(null); }
  };

  // ── breadcrumb trail from drill state ────────────────────────────────────────
  const trail = [{ level: 0, label: 'Funnel' }];
  if (stage) {
    trail.push({ level: 1, label: STAGE_LABEL[stage] || stage });
    if (account) trail.push({ level: 2, label: account.Company || 'Account' });
  }

  // ── unauthed state: mirror the Scorecard router's connect prompt ─────────────
  if (!bqConnected) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, color: '#1a1a1a', marginBottom: 8 }}>{cfg.title}</h2>
        <p style={{ color: '#6b7280', marginBottom: 16 }}>Connect to BigQuery to load scorecard data.</p>
        <button
          onClick={onConnect}
          style={{
            background: '#059669', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Connect BigQuery
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 1400 }}>
      {/* header + Beta pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 4px' }}>
        <h1 style={{
          fontSize: 28, fontWeight: 700, color: '#1a1a1a', margin: 0,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {cfg.title}
        </h1>
        {cfg.status && cfg.status !== 'live' && cfg.status !== 'approved' && (
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
            color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d',
            borderRadius: 999, padding: '4px 12px', whiteSpace: 'nowrap',
            fontFamily: "'DM Sans', sans-serif", flexShrink: 0,
          }}>
            {cfg.status}
          </span>
        )}
      </div>
      {cfg.subtitle && (
        <p style={{
          fontSize: 13, color: '#6b7280', margin: '0 0 24px',
          fontFamily: "'DM Sans', sans-serif", maxWidth: 760,
        }}>
          {cfg.subtitle}
        </p>
      )}

      {/* cohort month + segment controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', margin: '8px 0 20px' }}>
        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          Cohort
          <select
            value={cohortMonth}
            onChange={(e) => setCohortMonth(e.target.value)}
            style={{
              padding: '5px 8px', fontSize: 16, fontWeight: 700, borderRadius: 6,
              border: '1px solid #d1d5db', fontFamily: "'DM Sans', sans-serif",
              background: '#fff', color: '#1a1a1a',
            }}
          >
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </label>

        {cfg.segments && cfg.segments.length > 0 && (
          <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
            Segment
            <select
              value={segment ?? ''}
              onChange={(e) => handleSegmentChange(e.target.value)}
              style={{
                padding: '5px 8px', fontSize: 14, fontWeight: 700, borderRadius: 6,
                border: '1px solid #d1d5db', fontFamily: "'DM Sans', sans-serif",
                background: '#fff', color: '#1a1a1a',
              }}
            >
              {cfg.segments.map((s) => (
                <option key={s.key ?? 'all'} value={s.key ?? ''}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
          borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {`Could not load data: ${error.message}`}
        </div>
      )}

      {/* L1/L2 funnel chart */}
      {funnelLoading && !spine && (
        <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading funnel…</p>
      )}
      {spine && (
        <ChartErrorBoundary>
          <FunnelChart
            stages={stages}
            conversionMrr={conversionMrr}
            mature={mature}
            onStageClick={handleStageClick}
          />
        </ChartErrorBoundary>
      )}

      {/* segment-compare table (when a segment lens is active) */}
      {segment && (
        segmentLoading && !segmentRows
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading segments…</p>
          : segmentRows && segmentRows.length > 0 && (
            <div style={{ overflowX: 'auto', margin: '16px 0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 640 }}>
                <thead>
                  <tr>
                    {['Segment', 'Trials', 'Sync %', 'Convert %'].map((h, i) => (
                      <th key={h} style={{
                        textAlign: i === 0 ? 'left' : 'right', padding: '8px 12px',
                        fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
                        letterSpacing: '.04em', borderBottom: '2px solid #e2e5e9', whiteSpace: 'nowrap',
                        fontFamily: "'DM Sans', sans-serif",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {segmentRows.map((row) => {
                    const segStages = normalizeFunnel(row);
                    return (
                      <tr key={row.segment ?? 'all'}>
                        <td style={{
                          textAlign: 'left', padding: '7px 12px', fontSize: 13, fontWeight: 600,
                          color: '#374151', borderBottom: '1px solid #f1f3f5',
                          fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                        }}>{row.segment ?? '—'}</td>
                        <td style={tdNum}>{Number(row.trials || 0).toLocaleString()}</td>
                        <td style={tdNum}>{pct(segStages[1].pctOfTrials)}</td>
                        <td style={tdNum}>{pct(segStages[2].pctOfTrials)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
      )}

      {/* breadcrumb */}
      {stage && <DrillBreadcrumb trail={trail} onNavigate={handleNavigate} />}

      {/* L3 account table */}
      {stage && (
        l3Loading && !l3
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading accounts…</p>
          : <ChartErrorBoundary><NetSaasAccountTable rows={l3} columns={FUNNEL_L3_COLUMNS} onRowClick={handleAccountClick} /></ChartErrorBoundary>
      )}

      {/* L4 account detail */}
      {account && (
        accountLoading && !accountHistory
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading account history…</p>
          : <ChartErrorBoundary><AccountDetail account={account} history={accountHistory} lifecycle={accountLifecycle} /></ChartErrorBoundary>
      )}
    </div>
  );
}

const tdNum = {
  textAlign: 'right', padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
  fontSize: 13, color: '#374151', borderBottom: '1px solid #f1f3f5', whiteSpace: 'nowrap',
};
