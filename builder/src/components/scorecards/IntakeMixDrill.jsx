// builder/src/components/scorecards/IntakeMixDrill.jsx
// Controller for the "Intake Mix" Labs scorecard. Answers: "are we acquiring
// the profile that retains and expands?" Shows the live top-30%-by-MRR customer
// fingerprint as a benchmark strip, the quarterly size mix of new trials and
// new paying customers benchmarked against it, and customization attach per
// first-pay cohort. Mirrors GrrIndustryDrill's structure.
import { useState, useEffect } from 'react';
import { ChartErrorBoundary } from '../EChart';
import IntakeMixBars from './IntakeMixBars';
import {
  fetchIntakeMix, fetchAttachByCohort, fetchIntakeBenchmark,
  toQuarterSeries, attachMaturity,
} from '../../lib/intakeMixData';

// ── date helpers (same approach as GrrIndustryDrill) ────────────────────────
function isoMonth(d) { return d.toISOString().slice(0, 10); }
function latestCompleteMonth() {
  const n = new Date();
  return isoMonth(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)));
}
function monthLabel(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function cohortLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
}

const START_DATE = '2024-01-01';

const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";
const sectionLabel = { fontSize: 13, color: '#6b7280', fontFamily: fontSans };
const h2 = { fontSize: 18, fontWeight: 700, color: '#1a1a1a', margin: '32px 0 4px', fontFamily: fontSans };

function StatCard({ label, value }) {
  return (
    <div style={{ border: '1px solid #e2e5e9', borderRadius: 8, background: '#f9fafb', padding: '12px 16px', minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#6b7280', fontFamily: fontSans }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', fontFamily: fontMono, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default function IntakeMixDrill({ cfg, bqConnected, onConnect }) {
  const [benchmark, setBenchmark] = useState(null);
  const [trials, setTrials] = useState(null);
  const [newCustomers, setNewCustomers] = useState(null);
  const [cohorts, setCohorts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const today = new Date();
  const todayIso = isoMonth(today);
  const month = latestCompleteMonth();

  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchIntakeBenchmark({ month }),
      fetchIntakeMix({ population: 'trials', startDate: START_DATE }),
      fetchIntakeMix({ population: 'new_customers', startDate: START_DATE }),
      fetchAttachByCohort({ startDate: START_DATE }),
    ])
      .then(([bm, tr, nc, co]) => {
        if (cancelled) return;
        setBenchmark(bm);
        setTrials(toQuarterSeries(tr, todayIso));
        setNewCustomers(toQuarterSeries(nc, todayIso));
        setCohorts(co);
      })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bqConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!bqConnected) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, color: '#1a1a1a', marginBottom: 8 }}>{cfg.title}</h2>
        <p style={{ color: '#6b7280', marginBottom: 16 }}>Connect to BigQuery to load scorecard data.</p>
        <button onClick={onConnect} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Connect BigQuery
        </button>
      </div>
    );
  }

  const benchPct = benchmark ? benchmark.pct_5m_plus : null;

  return (
    <div style={{ padding: 32, maxWidth: 1400 }}>
      {/* header + Beta pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 4px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a', margin: 0, fontFamily: fontSans }}>{cfg.title}</h1>
        {cfg.status && cfg.status !== 'live' && cfg.status !== 'approved' && (
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 999, padding: '4px 12px', whiteSpace: 'nowrap', fontFamily: fontSans }}>
            {cfg.status}
          </span>
        )}
      </div>
      {cfg.subtitle && (
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px', fontFamily: fontSans, maxWidth: 760 }}>{cfg.subtitle}</p>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, fontFamily: fontSans }}>
          {`Could not load data: ${error.message}`}
        </div>
      )}

      {/* ── Benchmark strip: the profile we're aiming for ── */}
      <h2 style={{ ...h2, margin: '8px 0 4px' }}>The customers we want</h2>
      <p style={{ ...sectionLabel, margin: '0 0 12px' }}>
        Live fingerprint of the top 30% of customers by MRR, as of {monthLabel(month)}.
      </p>
      {loading && !benchmark
        ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading benchmark…</p>
        : benchmark ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatCard label="Top-30% count" value={benchmark.n.toLocaleString()} />
            <StatCard label="Avg MRR" value={`$${benchmark.avg_mrr.toLocaleString()}`} />
            <StatCard label="% $5M+ size" value={`${benchmark.pct_5m_plus.toFixed(1)}%`} />
            <StatCard label="% customized" value={`${benchmark.pct_customized.toFixed(1)}%`} />
            <StatCard label="% Mfg & Distribution" value={`${benchmark.pct_mnd.toFixed(1)}%`} />
          </div>
        ) : <p style={{ ...sectionLabel, padding: '12px 0' }}>No benchmark data.</p>}

      {/* ── New trials by quarter ── */}
      <h2 style={h2}>New trials by quarter</h2>
      <p style={{ ...sectionLabel, margin: '0 0 8px' }}>Size mix of new trial signups. Dashed line = the top-30% share of $5M+.</p>
      {loading && !trials
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading trials…</p>
        : <ChartErrorBoundary><IntakeMixBars rows={trials} benchmarkPct={benchPct} /></ChartErrorBoundary>}

      {/* ── New paying customers by quarter ── */}
      <h2 style={h2}>New paying customers by quarter</h2>
      <p style={{ ...sectionLabel, margin: '0 0 8px' }}>Size mix of new paying customers. Dashed line = the top-30% share of $5M+.</p>
      {loading && !newCustomers
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading customers…</p>
        : <ChartErrorBoundary><IntakeMixBars rows={newCustomers} benchmarkPct={benchPct} /></ChartErrorBoundary>}

      {/* ── Customization attach by cohort ── */}
      <h2 style={h2}>Customization attach by cohort</h2>
      <p style={{ ...sectionLabel, margin: '0 0 8px' }}>
        Of customers who first paid in each quarter, the share that bought project hours within 90 / 180 days. Windows that haven't fully elapsed show "—".
      </p>
      {loading && !cohorts
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading cohorts…</p>
        : !cohorts || cohorts.length === 0
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>No cohorts in this slice.</p>
          : (
            <table style={{ borderCollapse: 'collapse', fontFamily: fontMono, fontSize: 13, margin: '4px 0 8px' }}>
              <thead>
                <tr style={{ textAlign: 'right', color: '#6b7280', fontFamily: fontSans, fontSize: 12 }}>
                  <th style={{ textAlign: 'left', padding: '6px 16px 6px 0' }}>Cohort</th>
                  <th style={{ padding: '6px 16px 6px 0' }}>New customers</th>
                  <th style={{ padding: '6px 16px 6px 0' }}>Attach 90d</th>
                  <th style={{ padding: '6px 0' }}>Attach 180d</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => {
                  const { mature90, mature180 } = attachMaturity(c.cohort_quarter, todayIso);
                  const pct = (n) => (c.new_customers > 0 ? `${((n / c.new_customers) * 100).toFixed(1)}%` : '—');
                  return (
                    <tr key={c.cohort_quarter} style={{ borderTop: '1px solid #eef0f2', color: '#1a1a1a' }}>
                      <td style={{ textAlign: 'left', padding: '6px 16px 6px 0', fontFamily: fontSans }}>{cohortLabel(c.cohort_quarter)}</td>
                      <td style={{ textAlign: 'right', padding: '6px 16px 6px 0' }}>{c.new_customers.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', padding: '6px 16px 6px 0' }} title={mature90 ? undefined : 'window not complete yet'}>
                        {mature90 ? pct(c.attached_90d) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0' }} title={mature180 ? undefined : 'window not complete yet'}>
                        {mature180 ? pct(c.attached_180d) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

      {/* fine print */}
      <p style={{ fontSize: 11, color: '#9ca3af', margin: '24px 0 0', fontFamily: fontSans, maxWidth: 880, lineHeight: 1.5 }}>
        Business size = the customer's most recent month of QuickBooks invoices + sales receipts × 12, refreshed nightly on active accounts. No currency normalization (~30% of the base is non-US). "No data" = no synced invoice history — for trials that is mostly never-synced signups, and it is signal, not noise. Customization = bought project hours (int_customer_proserv).
      </p>
    </div>
  );
}
