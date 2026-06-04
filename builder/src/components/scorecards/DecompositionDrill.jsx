// builder/src/components/scorecards/DecompositionDrill.jsx
// Controller for the Net SaaS movement drilldown scorecard. Wires together the
// L1 waterfall bridge (NetSaasBridge), the L2 split panel (L2Panel), the L3
// account table (NetSaasAccountTable), the drill breadcrumb, and the global
// filter bar. Owns all fetch orchestration + drill state.
//
// This is the longest scorecard file by design — it's the orchestration layer.
// Small date helpers live at the top; handlers stay flat and tidy.

import { useState, useEffect, useCallback } from 'react';
import { ChartErrorBoundary } from '../EChart';
import NetSaasBridge from './NetSaasBridge';
import L2Panel from './L2Panel';
import NetSaasAccountTable from './NetSaasAccountTable';
import DrillBreadcrumb from './DrillBreadcrumb';
import GlobalFilterBar from './GlobalFilterBar';
import { normalizeBridge, applyLens } from '../../lib/netSaasTransform';
import {
  fetchBridge,
  fetchDimSplit,
  fetchComponentSplit,
  fetchAccountTable,
  fetchCohortAgeChurn,
  fetchFilterOptions,
  fetchRate,
} from '../../lib/netSaasData';

// ── date helpers ────────────────────────────────────────────────────────────
function firstOfMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function isoMonth(d) {
  return d.toISOString().slice(0, 10); // 'YYYY-MM-01'
}
// latest *complete* month = first day of the month before the current calendar
// month. The data models exclude the in-progress month anyway.
function latestCompleteMonth() {
  const n = new Date();
  return isoMonth(firstOfMonth(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1))));
}
function monthLabel(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
// Last N months (first-of-month ISO strings), most recent first, anchored to the
// latest complete month.
function recentMonths(n) {
  const out = [];
  const base = new Date(latestCompleteMonth() + 'T00:00:00Z');
  for (let i = 0; i < n; i++) {
    out.push(isoMonth(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1))));
  }
  return out;
}

// Friendly message for fetch failures; surfaces a connect prompt for auth errors.
function isAuthError(err) {
  return /not connected|session expired|reconnect/i.test(err?.message || '');
}

const sectionLabel = {
  fontSize: 13, color: '#6b7280', fontFamily: "'DM Sans', sans-serif",
};

export default function DecompositionDrill({ config, bqConnected, onConnect }) {
  const cfg = config;

  const [filters, setFilters] = useState({});
  const [filterOptions, setFilterOptions] = useState({});
  const [month, setMonth] = useState(latestCompleteMonth());
  const [grain, setGrain] = useState('monthly');
  const [lens, setLens] = useState('netSaas');

  const grainCfg = cfg.grains[grain];
  const lensCfg = cfg.lenses[lens];

  const [drill, setDrill] = useState(null); // null at L1, else { bar, dim, slice }
  const [bridge, setBridge] = useState(null);
  const [rate, setRate] = useState(null);
  const [l2, setL2] = useState(null);
  const [l3, setL3] = useState(null);

  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [l2Loading, setL2Loading] = useState(false);
  const [l3Loading, setL3Loading] = useState(false);
  const [error, setError] = useState(null);

  // ── L1: fetch the current bridge whenever filters / month change ──
  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    setBridgeLoading(true);
    setError(null);
    // Reset drill on filter/month change so we never show stale L2/L3.
    setDrill(null);
    setL2(null);
    setL3(null);

    const bridgeView = grainCfg.bridgeView;

    Promise.all([
      fetchBridge({ month, filters, bridgeView }),
      lensCfg.rate ? fetchRate({ metric: grainCfg[lensCfg.rate + 'Metric'], period: month }) : Promise.resolve(null),
    ])
      .then(([cur, rateVal]) => {
        if (cancelled) return;
        // Apply the active lens after normalizing. Start value drives % labels.
        const curBars = normalizeBridge(cur, cfg);
        const start = curBars.find((b) => b.key === 'start')?.value ?? 0;
        setBridge(applyLens(curBars, lensCfg, start));
        setRate(lensCfg.rate ? rateVal : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setBridgeLoading(false);
      });

    return () => { cancelled = true; };
  }, [filters, month, bqConnected, cfg, grain, lens, grainCfg, lensCfg]);

  // ── load distinct filter values once BQ is connected (reference data) ────────
  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    const dims = [...cfg.filters.primary, ...cfg.filters.overflow];
    fetchFilterOptions({ dims, bridgeView: grainCfg.bridgeView })
      .then((opts) => { if (!cancelled) setFilterOptions(opts); })
      .catch(() => { /* leave options empty on failure — dropdowns still show "All" */ });
    return () => { cancelled = true; };
  }, [bqConnected, cfg, grainCfg]);

  // ── L2 fetch (shared by bar click + dim change) ─────────────────────────────
  const loadL2 = useCallback((barKey, dim) => {
    const spec = cfg.drills[barKey];
    if (!spec) return;
    setL2Loading(true);
    setError(null);
    // Clear stale L2 data before the async fetch. Without this, switching from a
    // component-mode bar (data = {seats,apps,price}) to a dimension-mode bar
    // (data = [{bucket,value}]) would briefly render L2Panel with the previous
    // shape, and the loading guard (l2Loading && !l2) wouldn't fire because l2
    // is still truthy — causing a render crash on the shape mismatch.
    setL2(null);

    const { bridgeView, decompView } = grainCfg;
    const fetchFor = (m) => {
      if (spec.mode === 'component') {
        return fetchComponentSplit({ month: m, movementKind: spec.movementKind, filters, decompView, bridgeView });
      }
      // dimension mode
      if (dim === 'CohortAge') return fetchCohortAgeChurn({ month: m, filters, bridgeView });
      return fetchDimSplit({ month: m, measure: spec.measure, dim, filters, bridgeView });
    };

    fetchFor(month)
      .then((cur) => setL2(cur))
      .catch((e) => setError(e))
      .finally(() => setL2Loading(false));
  }, [cfg, filters, month, grainCfg]);

  // ── handlers ────────────────────────────────────────────────────────────────
  const handleBarClick = (barKey) => {
    const spec = cfg.drills[barKey];
    if (!spec) return;
    const dim = spec.mode === 'dimension' ? (spec.defaultDim || null) : null;
    setDrill({ bar: barKey, dim, slice: null });
    setL3(null);
    loadL2(barKey, dim);
  };

  const handleDimChange = (dim) => {
    if (!drill) return;
    setDrill((d) => ({ ...d, dim, slice: null }));
    setL3(null);
    loadL2(drill.bar, dim);
  };

  const handleSliceClick = (slice) => {
    if (!drill) return;
    setDrill((d) => ({ ...d, slice }));
    setL3Loading(true);
    setError(null);
    fetchAccountTable({ month, drill: drill.bar, dim: drill.dim, slice, filters, bridgeView: grainCfg.bridgeView, decompView: grainCfg.decompView })
      .then((rows) => setL3(rows))
      .catch((e) => setError(e))
      .finally(() => setL3Loading(false));
  };

  const handleNavigate = (level) => {
    if (level === 0) {
      setDrill(null);
      setL2(null);
      setL3(null);
    } else if (level === 1) {
      setDrill((d) => (d ? { ...d, slice: null } : d));
      setL3(null);
    }
    // level 2 is the leaf — no-op (already there)
  };

  // ── breadcrumb trail from drill state ───────────────────────────────────────
  const trail = [{ level: 0, label: 'Net SaaS' }];
  if (drill) {
    const bar = cfg.bridge.find((b) => b.key === drill.bar);
    trail.push({ level: 1, label: bar?.label || drill.bar });
    if (drill.slice) trail.push({ level: 2, label: String(drill.slice) });
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

  const activeSpec = drill ? cfg.drills[drill.bar] : null;

  return (
    <div style={{ padding: 32, maxWidth: 1400 }}>
      <h1 style={{
        fontSize: 28, fontWeight: 700, color: '#1a1a1a', margin: '0 0 24px',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {cfg.title}
      </h1>

      {/* 1. global filters */}
      <GlobalFilterBar
        filters={filters}
        options={filterOptions}
        onFilterChange={setFilters}
        primary={cfg.filters.primary}
        overflow={cfg.filters.overflow}
      />

      {/* 2. grain + lens + period controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
        margin: '8px 0 20px',
      }}>
        {/* grain segmented toggle (prominent — annual vs monthly GRR differ a lot) */}
        <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db' }}>
          {Object.entries(cfg.grains).map(([key, g]) => {
            const active = grain === key;
            return (
              <button
                key={key}
                onClick={() => setGrain(key)}
                style={{
                  padding: '6px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  border: 'none', fontFamily: "'DM Sans', sans-serif",
                  background: active ? '#059669' : '#fff',
                  color: active ? '#fff' : '#374151',
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        {/* lens selector */}
        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          Lens
          <select
            value={lens}
            onChange={(e) => setLens(e.target.value)}
            style={{
              padding: '5px 8px', fontSize: 14, fontWeight: 700, borderRadius: 6,
              border: '1px solid #d1d5db', fontFamily: "'DM Sans', sans-serif",
              background: '#fff', color: '#1a1a1a',
            }}
          >
            {Object.entries(cfg.lenses).map(([key, l]) => (
              <option key={key} value={key}>{l.label}</option>
            ))}
          </select>
        </label>

        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{
            padding: '5px 8px', fontSize: 16, fontWeight: 700, borderRadius: 6,
            border: '1px solid #d1d5db', fontFamily: "'DM Sans', sans-serif",
            background: '#fff', color: '#1a1a1a',
          }}
        >
          {recentMonths(6).map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
          borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {isAuthError(error)
            ? <>BigQuery session issue. <button onClick={onConnect} style={{ color: '#b91c1c', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Reconnect</button>.</>
            : `Could not load data: ${error.message}`}
        </div>
      )}

      {/* 3a. headline rate (GRR/NRR lenses only) */}
      {lensCfg.rate && (
        <div style={{ margin: '0 0 4px' }}>
          <span style={{
            fontSize: 32, fontWeight: 700, color: '#1a1a1a',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {lensCfg.label}{' '}
            {rate != null ? (rate * 100).toFixed(1) + '%' : '—'}
          </span>
          <span style={{ ...sectionLabel, marginLeft: 10 }}>
            {grainCfg.label} · {monthLabel(month)}
          </span>
        </div>
      )}

      {/* 3b. L1 waterfall bridge */}
      {bridgeLoading && !bridge && (
        <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading bridge…</p>
      )}
      {bridge && (
        <ChartErrorBoundary>
          <NetSaasBridge
            bars={bridge}
            lens={lens}
            onBarClick={handleBarClick}
          />
        </ChartErrorBoundary>
      )}

      {/* 4. breadcrumb */}
      {drill && <DrillBreadcrumb trail={trail} onNavigate={handleNavigate} />}

      {/* 5. L2 split panel */}
      {drill && (
        l2Loading && !l2
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading split…</p>
          : (
            <ChartErrorBoundary>
              <L2Panel
                drill={drill.bar}
                mode={activeSpec?.mode}
                data={l2}
                dims={activeSpec?.dims}
                activeDim={drill.dim}
                onDimChange={handleDimChange}
                onSliceClick={handleSliceClick}
                showDelta={false}
                priorData={null}
              />
            </ChartErrorBoundary>
          )
      )}

      {/* 6. L3 account table */}
      {drill?.slice && (
        l3Loading && !l3
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading accounts…</p>
          : <ChartErrorBoundary><NetSaasAccountTable rows={l3} drill={drill.bar} config={cfg} /></ChartErrorBoundary>
      )}
    </div>
  );
}
