// builder/src/components/scorecards/GrrIndustryDrill.jsx
// Controller for the "GRR by Industry" Labs scorecard. Owns the cohort-month
// state, the L1→L2→L3 industry drill path, the operating-model section, the
// per-section account tables, and the parity check between recombined segment
// GRR and the canonical v_metric__annual_grr. Mirrors FunnelDrill's structure.
import { useState, useEffect } from 'react';
import { ChartErrorBoundary } from '../EChart';
import GrrSegmentBars from './GrrSegmentBars';
import GrrAccountTable from './GrrAccountTable';
import DrillBreadcrumb from './DrillBreadcrumb';
import {
  fetchGrrSegments, fetchGrrAccounts, fetchAnnualGrrHeadline, computeAllUpGrr,
} from '../../lib/grrIndustryData';

// ── date helpers (same approach as DecompositionDrill) ──────────────────────
function isoMonth(d) { return d.toISOString().slice(0, 10); }
function latestCompleteMonth() {
  const n = new Date();
  return isoMonth(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)));
}
function recentMonths(n) {
  const base = new Date(latestCompleteMonth() + 'T00:00:00Z');
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(isoMonth(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1))));
  }
  return out;
}
function monthLabel(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const INDUSTRY_DIMS = ['l1', 'l2', 'l3'];
const DIM_LABEL = { l1: 'L1', l2: 'L2', l3: 'L3', operating_model: 'Operating model' };
const PARITY_TOLERANCE = 0.002;

const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";
const sectionLabel = { fontSize: 13, color: '#6b7280', fontFamily: fontSans };
const h2 = { fontSize: 18, fontWeight: 700, color: '#1a1a1a', margin: '32px 0 4px', fontFamily: fontSans };

export default function GrrIndustryDrill({ cfg, bqConnected, onConnect }) {
  const [month, setMonth] = useState(latestCompleteMonth());

  // Industry drill path: [] → L1 bars; [{dim:'l1',value:X}] → L2 bars within X; etc.
  const [path, setPath] = useState([]);
  const chartDim = INDUSTRY_DIMS[Math.min(path.length, 2)];
  const pathFilters = Object.fromEntries(path.map((p) => [p.dim, p.value]));

  const [industryRows, setIndustryRows] = useState(null);
  const [omRows, setOmRows] = useState(null);
  const [headlineGrr, setHeadlineGrr] = useState(null);
  const [l1Rows, setL1Rows] = useState(null); // unfiltered L1 rows, parity input

  // Per-section account drill: { label, filters } + fetched rows.
  const [industrySel, setIndustrySel] = useState(null);
  const [industryAccounts, setIndustryAccounts] = useState(null);
  const [omSel, setOmSel] = useState(null);
  const [omAccounts, setOmAccounts] = useState(null);

  const [chartsLoading, setChartsLoading] = useState(false);
  const [industryAccountsLoading, setIndustryAccountsLoading] = useState(false);
  const [omAccountsLoading, setOmAccountsLoading] = useState(false);
  const [error, setError] = useState(null);

  const clearAccounts = () => {
    setIndustrySel(null); setIndustryAccounts(null);
    setOmSel(null); setOmAccounts(null);
  };

  // ── headline + L1 + operating model: refetch on month change ──────────────
  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    setChartsLoading(true);
    setError(null);
    setPath([]);
    clearAccounts();
    Promise.all([
      fetchGrrSegments({ month, dimension: 'l1', filters: {} }),
      fetchGrrSegments({ month, dimension: 'operating_model', filters: {} }),
      fetchAnnualGrrHeadline({ month }),
    ])
      .then(([l1, om, headline]) => {
        if (cancelled) return;
        setL1Rows(l1);
        setIndustryRows(l1);
        setOmRows(om);
        setHeadlineGrr(headline);
      })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setChartsLoading(false); });
    return () => { cancelled = true; };
  }, [month, bqConnected]);

  // ── industry bars for deeper drill levels ──────────────────────────────────
  useEffect(() => {
    if (!bqConnected) return;
    if (path.length === 0) { setIndustryRows(l1Rows); return; }
    let cancelled = false;
    setChartsLoading(true);
    fetchGrrSegments({ month, dimension: chartDim, filters: pathFilters })
      .then((rows) => { if (!cancelled) setIndustryRows(rows); })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setChartsLoading(false); });
    return () => { cancelled = true; };
  }, [path]); // intentionally omits month/chartDim/pathFilters — only re-runs when path changes

  // ── handlers ───────────────────────────────────────────────────────────────
  const loadIndustryAccounts = (filters, label) => {
    setIndustrySel(label);
    setIndustryAccounts(null);
    setIndustryAccountsLoading(true);
    fetchGrrAccounts({ month, filters })
      .then(setIndustryAccounts)
      .catch(setError)
      .finally(() => setIndustryAccountsLoading(false));
  };

  const handleIndustryBarClick = (segment) => {
    const filters = { ...pathFilters, [chartDim]: segment };
    loadIndustryAccounts(filters, `${segment} (${DIM_LABEL[chartDim]})`);
    // Drill deeper unless at L3 or into Unclassified (children are all Unclassified).
    if (chartDim !== 'l3' && segment !== 'Unclassified') {
      setPath([...path, { dim: chartDim, value: segment }]);
    }
  };

  const handleOmBarClick = (segment) => {
    setOmSel(`${segment} (Operating model)`);
    setOmAccounts(null);
    setOmAccountsLoading(true);
    fetchGrrAccounts({ month, filters: { operating_model: segment } })
      .then(setOmAccounts)
      .catch(setError)
      .finally(() => setOmAccountsLoading(false));
  };

  const handleNavigate = (level) => {
    setPath(path.slice(0, level));
    setIndustrySel(null);
    setIndustryAccounts(null);
  };

  const trail = [
    { level: 0, label: 'All industries' },
    ...path.map((p, i) => ({ level: i + 1, label: p.value })),
  ];

  // ── parity gate: recombined L1 GRR vs canonical metric ────────────────────
  const allUp = l1Rows ? computeAllUpGrr(l1Rows) : null;
  const parityBroken = allUp != null && headlineGrr != null
    && Math.abs(allUp - headlineGrr) > PARITY_TOLERANCE;

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

      {/* cohort month + headline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', margin: '8px 0 8px' }}>
        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          Cohort month
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: '5px 8px', fontSize: 14, fontWeight: 700, borderRadius: 6, border: '1px solid #d1d5db', fontFamily: fontSans, background: '#fff', color: '#1a1a1a' }}
          >
            {recentMonths(12).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <div style={{ ...sectionLabel, fontFamily: fontMono }}>
          Annual GRR (all-up):{' '}
          <strong style={{ color: '#1a1a1a', fontSize: 15 }}>
            {headlineGrr == null ? '—' : `${(headlineGrr * 100).toFixed(1)}%`}
          </strong>
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 16px', fontFamily: fontSans, maxWidth: 760 }}>
        Labels are current-state: a reclassified account counts under its current label even for past cohorts.
      </p>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, fontFamily: fontSans }}>
          {`Could not load data: ${error.message}`}
        </div>
      )}
      {parityBroken && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#b45309', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, fontFamily: fontSans }}>
          {`Parity check failed: segment math gives ${(allUp * 100).toFixed(2)}% but v_metric__annual_grr says ${(headlineGrr * 100).toFixed(2)}%. Don't trust the segment numbers until this is resolved.`}
        </div>
      )}

      {/* ── Section 1: GRR by industry ── */}
      <h2 style={h2}>GRR by industry</h2>
      <p style={{ ...sectionLabel, margin: '0 0 8px' }}>
        Click a bar to see its accounts{chartDim !== 'l3' ? ' and drill one level deeper' : ''}.
      </p>
      {path.length > 0 && <DrillBreadcrumb trail={trail} onNavigate={handleNavigate} />}
      {chartsLoading && !industryRows
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading segments…</p>
        : <ChartErrorBoundary><GrrSegmentBars rows={industryRows} onSelect={handleIndustryBarClick} /></ChartErrorBoundary>}
      {industrySel && (
        <>
          <h3 style={{ ...h2, fontSize: 15, margin: '16px 0 4px' }}>Accounts — {industrySel}</h3>
          {industryAccountsLoading
            ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading accounts…</p>
            : <ChartErrorBoundary><GrrAccountTable key={industrySel} rows={industryAccounts} /></ChartErrorBoundary>}
        </>
      )}

      {/* ── Section 2: GRR by operating model ── */}
      <h2 style={h2}>GRR by operating model</h2>
      <p style={{ ...sectionLabel, margin: '0 0 8px' }}>How they go to market. Click a bar to see its accounts.</p>
      {chartsLoading && !omRows
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading segments…</p>
        : <ChartErrorBoundary><GrrSegmentBars rows={omRows} onSelect={handleOmBarClick} selected={omSel ? omSel.replace(' (Operating model)', '') : null} /></ChartErrorBoundary>}
      {omSel && (
        <>
          <h3 style={{ ...h2, fontSize: 15, margin: '16px 0 4px' }}>Accounts — {omSel}</h3>
          {omAccountsLoading
            ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading accounts…</p>
            : <ChartErrorBoundary><GrrAccountTable key={omSel} rows={omAccounts} /></ChartErrorBoundary>}
        </>
      )}
    </div>
  );
}
