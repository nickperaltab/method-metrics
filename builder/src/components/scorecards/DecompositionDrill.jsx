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
import { normalizeBridge } from '../../lib/netSaasTransform';
import {
  fetchBridge,
  fetchDimSplit,
  fetchComponentSplit,
  fetchAccountTable,
  fetchCohortAgeChurn,
  fetchFilterOptions,
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
function priorMonth(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return isoMonth(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
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
  const [compareMonth, setCompareMonth] = useState(priorMonth(latestCompleteMonth()));
  const [showDelta, setShowDelta] = useState(true);

  const [drill, setDrill] = useState(null); // null at L1, else { bar, dim, slice }
  const [bridge, setBridge] = useState(null);
  const [priorBridge, setPriorBridge] = useState(null);
  const [l2, setL2] = useState(null);
  const [priorL2, setPriorL2] = useState(null);
  const [l3, setL3] = useState(null);

  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [l2Loading, setL2Loading] = useState(false);
  const [l3Loading, setL3Loading] = useState(false);
  const [error, setError] = useState(null);

  // ── L1: fetch current + comparison bridge whenever filters / months change ──
  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    setBridgeLoading(true);
    setError(null);
    // Reset drill on filter/month change so we never show stale L2/L3.
    setDrill(null);
    setL2(null);
    setPriorL2(null);
    setL3(null);

    Promise.all([
      fetchBridge({ month, filters }),
      showDelta ? fetchBridge({ month: compareMonth, filters }) : Promise.resolve(null),
    ])
      .then(([cur, prev]) => {
        if (cancelled) return;
        setBridge(normalizeBridge(cur, cfg));
        setPriorBridge(prev ? normalizeBridge(prev, cfg) : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setBridgeLoading(false);
      });

    return () => { cancelled = true; };
  }, [filters, month, compareMonth, showDelta, bqConnected, cfg]);

  // ── load distinct filter values once BQ is connected (reference data) ────────
  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    const dims = [...cfg.filters.primary, ...cfg.filters.overflow];
    fetchFilterOptions({ dims })
      .then((opts) => { if (!cancelled) setFilterOptions(opts); })
      .catch(() => { /* leave options empty on failure — dropdowns still show "All" */ });
    return () => { cancelled = true; };
  }, [bqConnected, cfg]);

  // ── L2 fetch (shared by bar click + dim change) ─────────────────────────────
  const loadL2 = useCallback((barKey, dim) => {
    const spec = cfg.drills[barKey];
    if (!spec) return;
    setL2Loading(true);
    setError(null);

    const fetchFor = (m) => {
      if (spec.mode === 'component') {
        return fetchComponentSplit({ month: m, movementKind: spec.movementKind, filters });
      }
      // dimension mode
      if (dim === 'CohortAge') return fetchCohortAgeChurn({ month: m, filters });
      return fetchDimSplit({ month: m, measure: spec.measure, dim, filters });
    };

    Promise.all([
      fetchFor(month),
      showDelta ? fetchFor(compareMonth) : Promise.resolve(null),
    ])
      .then(([cur, prev]) => {
        setL2(cur);
        setPriorL2(prev);
      })
      .catch((e) => setError(e))
      .finally(() => setL2Loading(false));
  }, [cfg, filters, month, compareMonth, showDelta]);

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
    fetchAccountTable({ month, drill: drill.bar, dim: drill.dim, slice, filters })
      .then((rows) => setL3(rows))
      .catch((e) => setError(e))
      .finally(() => setL3Loading(false));
  };

  const handleNavigate = (level) => {
    if (level === 0) {
      setDrill(null);
      setL2(null);
      setPriorL2(null);
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

      {/* 2. period + delta controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
        margin: '8px 0 20px',
      }}>
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
        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showDelta}
            onChange={(e) => setShowDelta(e.target.checked)}
          />
          Compare to
        </label>
        <select
          value={compareMonth}
          disabled={!showDelta}
          onChange={(e) => setCompareMonth(e.target.value)}
          style={{
            padding: '5px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db',
            fontFamily: "'DM Sans', sans-serif", background: showDelta ? '#fff' : '#f3f4f6',
            color: showDelta ? '#1a1a1a' : '#9ca3af',
          }}
        >
          {recentMonths(6).filter((m) => m !== month).map((m) => (
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

      {/* 3. L1 waterfall bridge */}
      {bridgeLoading && !bridge && (
        <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading bridge…</p>
      )}
      {bridge && (
        <ChartErrorBoundary>
          <NetSaasBridge
            bars={bridge}
            prior={showDelta ? priorBridge : null}
            showDelta={showDelta}
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
            <L2Panel
              drill={drill.bar}
              mode={activeSpec?.mode}
              data={l2}
              dims={activeSpec?.dims}
              activeDim={drill.dim}
              onDimChange={handleDimChange}
              onSliceClick={handleSliceClick}
              showDelta={showDelta}
              priorData={showDelta ? priorL2 : null}
            />
          )
      )}

      {/* 6. L3 account table */}
      {drill?.slice && (
        l3Loading && !l3
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading accounts…</p>
          : <NetSaasAccountTable rows={l3} drill={drill.bar} config={cfg} />
      )}
    </div>
  );
}
