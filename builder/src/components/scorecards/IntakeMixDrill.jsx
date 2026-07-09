// builder/src/components/scorecards/IntakeMixDrill.jsx
// Controller for the "Intake Mix" Labs scorecard. Answers: "are we acquiring
// the profile that retains and expands?" Shows the live top-30%-by-MRR customer
// fingerprint as a benchmark strip, the quarterly size mix of new trials and
// new paying customers benchmarked against it, and customization attach per
// first-pay cohort. Mirrors GrrIndustryDrill's structure.
import { useState, useEffect } from 'react';
import { ChartErrorBoundary } from '../EChart';
import IntakeMixBars from './IntakeMixBars';
import IntakeQualityTrend from './IntakeQualityTrend';
import {
  fetchIntakeMix, fetchAttachByCohort, fetchIntakeBenchmark,
  fetchIntakeQuality, fetchConvertRateByBand, fetchGrowthByCohort,
  fetchSleepingGiants, fetchGiantsPeerBenchmark,
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
const GIANT_MIN_SALES = 5000000;
const GIANT_MAX_MRR = 219;
// Convert / growth panels: the three real size bands, left→right, plus 'No data'.
const CONVERT_BANDS = ['<$1M', '$1M–$5M', '$5M+'];

const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";
const sectionLabel = { fontSize: 13, color: '#6b7280', fontFamily: fontSans };
const h2 = { fontSize: 18, fontWeight: 700, color: '#1a1a1a', margin: '32px 0 4px', fontFamily: fontSans };

// Compact $ formatter for reported sales / MRR ($1.2M, $850K, $778).
function fmtUsd(v) {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${Math.round(abs).toLocaleString()}`;
}
function fmtPct(v) { return v == null ? '—' : `${v.toFixed(1)}%`; }

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
  const [quality, setQuality] = useState(null);
  const [trials, setTrials] = useState(null);
  const [newCustomers, setNewCustomers] = useState(null);
  const [convertByBand, setConvertByBand] = useState(null);
  const [growth, setGrowth] = useState(null);
  const [cohorts, setCohorts] = useState(null);
  const [giants, setGiants] = useState(null);
  const [giantsPeer, setGiantsPeer] = useState(null);
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
      fetchIntakeQuality({ startDate: START_DATE, todayIso }),
      fetchIntakeMix({ population: 'trials', startDate: START_DATE }),
      fetchIntakeMix({ population: 'new_customers', startDate: START_DATE }),
      fetchConvertRateByBand({ startDate: START_DATE, todayIso }),
      fetchGrowthByCohort({ startDate: START_DATE, nowMonth: month, todayIso }),
      fetchAttachByCohort({ startDate: START_DATE }),
      fetchSleepingGiants({ nowMonth: month, minSales: GIANT_MIN_SALES, maxMrr: GIANT_MAX_MRR }),
      fetchGiantsPeerBenchmark({ nowMonth: month, minSales: GIANT_MIN_SALES, minMrr: GIANT_MAX_MRR }),
    ])
      .then(([bm, ql, tr, nc, cvb, gr, co, sg, sgp]) => {
        if (cancelled) return;
        setBenchmark(bm);
        setQuality(ql);
        setTrials(toQuarterSeries(tr, todayIso));
        setNewCustomers(toQuarterSeries(nc, todayIso));
        setConvertByBand(cvb);
        setGrowth(gr);
        setCohorts(co);
        setGiants(sg);
        setGiantsPeer(sgp);
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

      {/* ── Headline: are we attracting better customers? ── */}
      <h2 style={h2}>Are we attracting better customers?</h2>
      <p style={{ ...sectionLabel, margin: '0 0 8px' }}>
        Quarterly trial-quality trend. Left axis: share of trials at $1M+ and $5M+ reported sales, and the share of converts at $5M+. Right axis: average MRR at convert.
      </p>
      {loading && !quality
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading quality trend…</p>
        : <ChartErrorBoundary><IntakeQualityTrend rows={quality} /></ChartErrorBoundary>}

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

      {/* ── Do the good ones convert? ── */}
      <h2 style={h2}>Do the good ones convert?</h2>
      <p style={{ ...sectionLabel, margin: '0 0 8px' }}>
        Trial→convert rate by size band per signup quarter, as converts / trials. Recent quarters are still maturing — those cells are suffixed "(maturing)".
      </p>
      {loading && !convertByBand
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading conversion…</p>
        : !convertByBand || convertByBand.length === 0
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>No conversion data in this slice.</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontFamily: fontMono, fontSize: 13, margin: '4px 0 8px' }}>
                <thead>
                  <tr style={{ textAlign: 'right', color: '#6b7280', fontFamily: fontSans, fontSize: 12 }}>
                    <th style={{ textAlign: 'left', padding: '6px 16px 6px 0' }}>Quarter</th>
                    {CONVERT_BANDS.map((b) => (
                      <th key={b} style={{ padding: '6px 16px 6px 0', whiteSpace: 'nowrap' }}>{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {convertByBand.map((row) => (
                    <tr key={row.quarter} style={{ borderTop: '1px solid #eef0f2', color: '#1a1a1a' }}>
                      <td style={{ textAlign: 'left', padding: '6px 16px 6px 0', fontFamily: fontSans, whiteSpace: 'nowrap' }}>
                        {cohortLabel(row.quarter)}
                      </td>
                      {CONVERT_BANDS.map((b) => {
                        const cell = row.bands?.[b];
                        if (!cell || cell.trials === 0) {
                          return <td key={b} style={{ textAlign: 'right', padding: '6px 16px 6px 0', color: '#9ca3af' }}>—</td>;
                        }
                        const suffix = row.convert_mature ? '' : ' (maturing)';
                        return (
                          <td key={b} style={{ textAlign: 'right', padding: '6px 16px 6px 0', color: row.convert_mature ? '#1a1a1a' : '#9ca3af' }} title={row.convert_mature ? undefined : 'converts still arriving'}>
                            {cell.converts.toLocaleString()}/{cell.trials.toLocaleString()} · {fmtPct(cell.rate)}{suffix}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

      {/* ── Do they grow after converting? ── */}
      <h2 style={h2}>Do they grow after converting?</h2>
      <p style={{ ...sectionLabel, margin: '0 0 4px' }}>
        Growth of converts by cohort quarter × size band, measured at {monthLabel(month)}: share that grew MRR ≥10%, share that churned to $0, and the median MRR multiple (now ÷ at-convert). Cohorts under 12 months old are still maturing.
      </p>
      <p style={{ fontSize: 12, color: '#374151', margin: '0 0 8px', fontFamily: fontSans, fontStyle: 'italic' }}>
        2024 cohorts: $5M+ converts grew 42.6% / churned 40.5% / median 1.55×; &lt;$1M grew 10.2% / churned 70.6% / median 1.0×.
      </p>
      {loading && !growth
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading growth…</p>
        : !growth || growth.length === 0
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>No growth data in this slice.</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontFamily: fontMono, fontSize: 13, margin: '4px 0 8px' }}>
                <thead>
                  <tr style={{ textAlign: 'right', color: '#6b7280', fontFamily: fontSans, fontSize: 12 }}>
                    <th style={{ textAlign: 'left', padding: '6px 16px 6px 0' }}>Cohort</th>
                    <th style={{ textAlign: 'left', padding: '6px 16px 6px 0' }}>Band</th>
                    <th style={{ padding: '6px 16px 6px 0' }}>Converts</th>
                    <th style={{ padding: '6px 16px 6px 0' }}>% grew ≥10%</th>
                    <th style={{ padding: '6px 16px 6px 0' }}>% gone</th>
                    <th style={{ padding: '6px 0' }}>Median mult.</th>
                  </tr>
                </thead>
                <tbody>
                  {growth.map((g) => (
                    <tr key={`${g.cohort_quarter}:${g.band}`} style={{ borderTop: '1px solid #eef0f2', color: g.mature ? '#1a1a1a' : '#9ca3af' }}>
                      <td style={{ textAlign: 'left', padding: '6px 16px 6px 0', fontFamily: fontSans, whiteSpace: 'nowrap' }}>
                        {cohortLabel(g.cohort_quarter)}{g.mature ? '' : ' (maturing)'}
                      </td>
                      <td style={{ textAlign: 'left', padding: '6px 16px 6px 0', whiteSpace: 'nowrap' }}>{g.band}</td>
                      <td style={{ textAlign: 'right', padding: '6px 16px 6px 0' }}>{g.converts.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', padding: '6px 16px 6px 0' }}>{fmtPct(g.pct_grew)}</td>
                      <td style={{ textAlign: 'right', padding: '6px 16px 6px 0' }}>{fmtPct(g.pct_gone)}</td>
                      <td style={{ textAlign: 'right', padding: '6px 0' }}>{g.converts > 0 ? `${g.median_multiple.toFixed(2)}×` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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

      {/* ── Sleeping giants ── */}
      <h2 style={h2}>Sleeping giants</h2>
      <p style={{ ...sectionLabel, margin: '0 0 8px' }}>
        Active customers with $5M+ reported sales paying under ${GIANT_MAX_MRR}/mo — big businesses on a tiny plan. Multi-account entities (Accounts &gt; 1) can be franchise networks masquerading as one giant.
      </p>
      {loading && !giants
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading accounts…</p>
        : !giants || giants.length === 0
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>No sleeping giants in this slice.</p>
          : (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '4px 0 12px' }}>
                <StatCard label="Sleeping giants" value={giants.length.toLocaleString()} />
                <StatCard label="Their combined MRR" value={fmtUsd(giants.reduce((s, g) => s + g.mrr, 0))} />
                <StatCard label="Avg MRR, engaged $5M+ peers" value={giantsPeer ? fmtUsd(giantsPeer.avg_peer_mrr) : '—'} />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontFamily: fontMono, fontSize: 13, margin: '4px 0 8px' }}>
                  <thead>
                    <tr style={{ textAlign: 'right', color: '#6b7280', fontFamily: fontSans, fontSize: 12 }}>
                      <th style={{ textAlign: 'left', padding: '6px 16px 6px 0' }}>Company</th>
                      <th style={{ padding: '6px 16px 6px 0' }}>Reported sales</th>
                      <th style={{ padding: '6px 16px 6px 0' }}>Method MRR</th>
                      <th style={{ padding: '6px 16px 6px 0' }}>Tenure (yrs)</th>
                      <th style={{ textAlign: 'center', padding: '6px 16px 6px 0' }}>Customized</th>
                      <th style={{ textAlign: 'left', padding: '6px 16px 6px 0' }}>Industry</th>
                      <th style={{ textAlign: 'center', padding: '6px 16px 6px 0' }}>US</th>
                      <th style={{ padding: '6px 0' }}>Accounts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {giants.map((g) => (
                      <tr key={g.entity_record_id} style={{ borderTop: '1px solid #eef0f2', color: '#1a1a1a' }}>
                        <td style={{ textAlign: 'left', padding: '6px 16px 6px 0', fontFamily: fontSans, whiteSpace: 'nowrap' }}>{g.company || '—'}</td>
                        <td style={{ textAlign: 'right', padding: '6px 16px 6px 0' }}>{fmtUsd(g.sales)}</td>
                        <td style={{ textAlign: 'right', padding: '6px 16px 6px 0' }}>{fmtUsd(g.mrr)}</td>
                        <td style={{ textAlign: 'right', padding: '6px 16px 6px 0' }}>{g.tenure_years.toFixed(1)}</td>
                        <td style={{ textAlign: 'center', padding: '6px 16px 6px 0' }}>{g.is_customized ? '✓' : '—'}</td>
                        <td style={{ textAlign: 'left', padding: '6px 16px 6px 0', fontFamily: fontSans, whiteSpace: 'nowrap' }}>{g.l1 || '—'}</td>
                        <td style={{ textAlign: 'center', padding: '6px 16px 6px 0' }}>{g.is_us ? '✓' : '—'}</td>
                        <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: g.account_count > 1 ? 700 : 400, color: g.account_count > 1 ? '#b45309' : '#1a1a1a' }}>
                          {g.account_count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

      {/* fine print */}
      <p style={{ fontSize: 11, color: '#9ca3af', margin: '24px 0 0', fontFamily: fontSans, maxWidth: 880, lineHeight: 1.5 }}>
        Business size = the customer's most recent month of QuickBooks invoices + sales receipts × 12, refreshed nightly on active accounts. No currency normalization (~30% of the base is non-US). "No data" = no synced invoice history — for trials that is mostly never-synced signups, and it is signal, not noise. Customization = bought project hours (int_customer_proserv). Trial-quality lines are conditioned on sync (the sales field populates after first sync), so a shift in sync rate can look like a quality shift; the convert-side lines are immune.
      </p>
    </div>
  );
}
