// builder/src/components/scorecards/MotionFunnelDrill.jsx
// Controller for the Motion + Lifecycle Funnel scorecard.
// Wires together date-window / lens controls, fetchMotionFunnel → toMotionFunnel
// → MotionFunnelChart, and an optional lens-compare table.
//
// Props contract mirrors FunnelDrill exactly: { cfg, bqConnected, onConnect }.

import { useState, useEffect } from 'react';
import { ChartErrorBoundary } from '../EChart';
import MotionFunnelChart from './MotionFunnelChart';
import { fetchMotionFunnel, fetchMotionLens } from '../../lib/motionFunnelData';
import { LENSES } from '../../lib/motionFunnelSql';
import { toMotionFunnel } from '../../lib/motionFunnelTransform';
import { isCohortMature } from '../../lib/funnelTransform';

// ── date helpers ────────────────────────────────────────────────────────────

// Earliest allowed start: Activity tracking begins in 2024.
const MIN_START = '2024-01-01';

function todayISO() { return new Date().toISOString().slice(0, 10); }

// Return a YYYY-MM-01 string N months before a given YYYY-MM-01 string.
function monthFloorNMonthsAgo(isoMonth, n) {
  const d = new Date(isoMonth + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 7) + '-01';
}

// Convert any ISO date string to its month floor: YYYY-MM-01.
function toMonthFloor(iso) {
  return iso.slice(0, 7) + '-01';
}

// Current month floor.
function currentMonthFloor() {
  return toMonthFloor(todayISO());
}

// Default start: 24 months ago, clamped to MIN_START.
function defaultStart(endMonthFloor) {
  const s = monthFloorNMonthsAgo(endMonthFloor, 24);
  return s < MIN_START ? MIN_START : s;
}

// For isCohortMature we need a scalar day, use the end-month floor as cohort month.
const MATURITY_DAYS = 365; // 12-month horizon is the longest retention bucket

const sectionLabel = { fontSize: 13, color: '#6b7280', fontFamily: "'DM Sans', sans-serif" };

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

const AMBER_BANNER = {
  background: '#fef3c7',
  border: '1px solid #fcd34d',
  color: '#b45309',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'DM Sans', sans-serif",
  marginBottom: 10,
};

// ── component ───────────────────────────────────────────────────────────────

export default function MotionFunnelDrill({ cfg, bqConnected, onConnect }) {
  const endDefault = currentMonthFloor();
  const startDefault = defaultStart(endDefault);

  const [startMonth, setStartMonth] = useState(startDefault); // YYYY-MM-01
  const [endMonth, setEndMonth] = useState(endDefault);       // YYYY-MM-01
  const [lens, setLens] = useState(null);

  const [paths, setPaths] = useState(null);
  const [lensRows, setLensRows] = useState(null);

  const [funnelLoading, setFunnelLoading] = useState(false);
  const [lensLoading, setLensLoading] = useState(false);
  const [error, setError] = useState(null);

  // Is the latest selected end-month fully mature (12-month horizon elapsed)?
  const mature = isCohortMature(endMonth, todayISO(), MATURITY_DAYS);
  // Show a softer "recent cohorts still maturing" note when end is within 12 months.
  const recentEndWarning = !mature;

  // ── month-input helpers ──────────────────────────────────────────────────

  // Convert a month input value (YYYY-MM) to a YYYY-MM-01 floor, clamped.
  const parseMonthInput = (val, clampMin, clampMax) => {
    if (!val) return clampMin;
    const floor = val.length === 7 ? val + '-01' : toMonthFloor(val);
    if (clampMin && floor < clampMin) return clampMin;
    if (clampMax && floor > clampMax) return clampMax;
    return floor;
  };

  // For <input type="month"> we need YYYY-MM; strip the day.
  const toMonthInputVal = (isoFloor) => isoFloor.slice(0, 7);

  const handleStartChange = (e) => {
    const val = parseMonthInput(e.target.value, MIN_START, endMonth);
    setStartMonth(val);
  };

  const handleEndChange = (e) => {
    const val = parseMonthInput(e.target.value, startMonth, currentMonthFloor());
    setEndMonth(val);
  };

  const applyPreset = (months) => {
    const end = currentMonthFloor();
    const start = monthFloorNMonthsAgo(end, months);
    setEndMonth(end);
    setStartMonth(start < MIN_START ? MIN_START : start);
  };

  // ── fetch funnel on window change ────────────────────────────────────────

  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    setFunnelLoading(true);
    setError(null);
    setPaths(null);

    fetchMotionFunnel({ startMonth, endMonth })
      .then((rows) => {
        if (cancelled) return;
        setPaths(toMotionFunnel(rows));
      })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setFunnelLoading(false); });

    return () => { cancelled = true; };
  }, [bqConnected, startMonth, endMonth]);

  // ── fetch lens breakdown when lens changes ───────────────────────────────

  useEffect(() => {
    if (!lens) { setLensRows(null); return; }
    if (!bqConnected) return;
    let cancelled = false;
    setLensLoading(true);
    fetchMotionLens({ startMonth, endMonth, lens })
      .then((rows) => { if (!cancelled) setLensRows(rows); })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLensLoading(false); });
    return () => { cancelled = true; };
  }, [bqConnected, startMonth, endMonth, lens]);

  // ── stage-click: V1 stub (L3 account drill is out of V1 scope) ───────────

  const handleStageClick = (motion, stageKey) => {
    // V1: no-op. Future: fetch accounts filtered by motion + stageKey using
    // buildMotionLensSql-style account queries for L3 drill-through.
    console.debug('[MotionFunnelDrill] stage clicked (L3 drill not yet implemented):', motion, stageKey);
  };

  // ── lens change handler ──────────────────────────────────────────────────

  const handleLensChange = (e) => {
    const val = e.target.value || null;
    setLens(val);
    setLensRows(null);
  };

  // ── unauthed prompt (mirrors FunnelDrill) ────────────────────────────────

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
          fontSize: 13, color: '#6b7280', margin: '0 0 20px',
          fontFamily: "'DM Sans', sans-serif", maxWidth: 760,
        }}>
          {cfg.subtitle}
        </p>
      )}

      {/* always-on caveat banners */}
      <div style={{ ...AMBER_BANNER }}>
        ⚠ Talked-to-us is tracked from 2024; earlier sign-ups read as self-serve.
      </div>
      <div style={{ ...AMBER_BANNER }}>
        ⚠ Industry breakdown is sparse for trials, fuller for converts — expect a large Unclassified bucket up top.
      </div>

      {/* signup-month window + preset buttons + lens selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', margin: '8px 0 20px' }}>
        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          Signup month — Start
          <input
            type="month"
            value={toMonthInputVal(startMonth)}
            min={toMonthInputVal(MIN_START)}
            max={toMonthInputVal(endMonth)}
            onChange={handleStartChange}
            style={{
              padding: '5px 8px', fontSize: 14, fontWeight: 700, borderRadius: 6,
              border: '1px solid #d1d5db', fontFamily: "'DM Sans', sans-serif",
              background: '#fff', color: '#1a1a1a',
            }}
          />
        </label>
        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          End
          <input
            type="month"
            value={toMonthInputVal(endMonth)}
            min={toMonthInputVal(startMonth)}
            max={toMonthInputVal(currentMonthFloor())}
            onChange={handleEndChange}
            style={{
              padding: '5px 8px', fontSize: 14, fontWeight: 700, borderRadius: 6,
              border: '1px solid #d1d5db', fontFamily: "'DM Sans', sans-serif",
              background: '#fff', color: '#1a1a1a',
            }}
          />
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[6, 12, 24].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => applyPreset(m)}
              style={{
                padding: '5px 12px', fontSize: 13, fontWeight: 600, borderRadius: 999,
                border: '1px solid #d1d5db', background: '#fff', color: '#374151',
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Last {m} mo
            </button>
          ))}
        </div>

        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          Lens
          <select
            value={lens ?? ''}
            onChange={handleLensChange}
            style={{
              padding: '5px 8px', fontSize: 14, fontWeight: 700, borderRadius: 6,
              border: '1px solid #d1d5db', fontFamily: "'DM Sans', sans-serif",
              background: '#fff', color: '#1a1a1a',
            }}
          >
            {LENSES.map((l) => (
              <option key={l.key ?? 'none'} value={l.key ?? ''}>{l.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* recent-cohorts maturing note */}
      {recentEndWarning && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: '#b45309',
          background: '#fef3c7', borderRadius: 6,
          padding: '6px 10px', marginBottom: 14,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          ⚠ Recent cohorts are still maturing — later retention buckets may be incomplete.
        </div>
      )}

      {/* error banner */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
          borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {`Could not load data: ${error.message}`}
        </div>
      )}

      {/* funnel chart */}
      {funnelLoading && !paths && (
        <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading motion funnel…</p>
      )}
      {paths && (
        <ChartErrorBoundary>
          <MotionFunnelChart
            paths={paths}
            mature={!recentEndWarning}
            onStageClick={handleStageClick}
          />
        </ChartErrorBoundary>
      )}

      {/* lens-compare table */}
      {lens && (
        lensLoading && !lensRows
          ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading lens breakdown…</p>
          : lensRows && lensRows.length > 0 && (
            <div style={{ overflowX: 'auto', margin: '24px 0 0' }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: '#374151',
                marginBottom: 8, fontFamily: "'DM Sans', sans-serif",
              }}>
                Breakdown by {LENSES.find((l) => l.key === lens)?.label ?? lens}
              </div>
              <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 740 }}>
                <thead>
                  <tr>
                    {['Motion', 'Lens value', 'Trials', 'Sync %', 'Convert %'].map((h, i) => (
                      <th key={h} style={{
                        textAlign: i < 2 ? 'left' : 'right',
                        padding: '8px 12px',
                        fontSize: 11, fontWeight: 700, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '.04em',
                        borderBottom: '2px solid #e2e5e9', whiteSpace: 'nowrap',
                        fontFamily: "'DM Sans', sans-serif",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lensRows.map((row, idx) => {
                    const trials = Number(row.trials) || 0;
                    const synced = Number(row.synced) || 0;
                    const converted = Number(row.converted) || 0;
                    const syncPct = trials > 0 ? synced / trials : null;
                    const convertPct = trials > 0 ? converted / trials : null;
                    return (
                      <tr key={`${row.motion}:${row.lens_value}:${idx}`}>
                        <td style={tdText}>{row.motion ?? '—'}</td>
                        <td style={tdText}>{row.lens_value ?? '—'}</td>
                        <td style={tdNum}>{trials.toLocaleString()}</td>
                        <td style={tdNum}>{pct(syncPct)}</td>
                        <td style={tdNum}>{pct(convertPct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  );
}

const tdText = {
  textAlign: 'left', padding: '7px 12px', fontSize: 13, fontWeight: 600,
  color: '#374151', borderBottom: '1px solid #f1f3f5',
  fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
};

const tdNum = {
  textAlign: 'right', padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
  fontSize: 13, color: '#374151', borderBottom: '1px solid #f1f3f5', whiteSpace: 'nowrap',
};
