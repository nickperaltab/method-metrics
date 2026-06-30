// builder/src/components/scorecards/MotionFunnelDrill.jsx
// Controller for the Motion & Lifecycle Funnel Sankey scorecard.
// Wires together goal toggle, split-by controls, fetchJoint → MotionSankeyChart,
// and a 1/3/6/12-month retention panel below.
//
// Props contract: { cfg, bqConnected, onConnect }.

import { useState, useEffect } from 'react';
import { ChartErrorBoundary } from '../EChart';
import MotionSankeyChart from './MotionSankeyChart';
import { fetchJoint, fetchSplitValues, fetchGoalRetention } from '../../lib/motionFunnelData';
import { SPLITS } from '../../lib/motionFunnelSql';

// ── date helpers ─────────────────────────────────────────────────────────────

// Earliest allowed start: Activity tracking begins in 2024.
const MIN_START = '2024-01';

function todayISO() { return new Date().toISOString().slice(0, 10); }

// Return a YYYY-MM string N months before a given YYYY-MM string.
function monthNMonthsAgo(isoMonth, n) {
  const [y, m] = isoMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Current month as YYYY-MM.
function currentMonth() {
  return todayISO().slice(0, 7);
}

// Clamp a YYYY-MM value to MIN_START.
function clampStart(val) {
  return val < MIN_START ? MIN_START : val;
}

// Convert YYYY-MM to the YYYY-MM-01 floor that the SQL layer expects.
function toFloor(ym) { return ym + '-01'; }

// ── style tokens ─────────────────────────────────────────────────────────────

const font = "'DM Sans', sans-serif";
const mono = "'JetBrains Mono', monospace";

const sectionLabel = { fontSize: 13, color: '#6b7280', fontFamily: font };

const AMBER_BANNER = {
  background: '#fef3c7',
  border: '1px solid #fcd34d',
  color: '#b45309',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: font,
  marginBottom: 10,
};

const inputStyle = {
  padding: '5px 8px', fontSize: 14, fontWeight: 700, borderRadius: 6,
  border: '1px solid #d1d5db', fontFamily: font,
  background: '#fff', color: '#1a1a1a',
};

const presetBtn = {
  padding: '5px 12px', fontSize: 13, fontWeight: 600, borderRadius: 999,
  border: '1px solid #d1d5db', background: '#fff', color: '#374151',
  cursor: 'pointer', fontFamily: font,
};

// ── retention helpers ─────────────────────────────────────────────────────────

const RETENTION_MONTHS = [1, 3, 6, 12];

function retentionRate(row, k) {
  const e = Number(row?.[`e${k}`] ?? 0);
  const r = Number(row?.[`r${k}`] ?? 0);
  if (e === 0) return null;
  return { rate: r / e, n: e };
}

function pctFmt(v) {
  return v == null ? null : `${Math.round(v * 100)}%`;
}

const goalLabels = {
  paid: { short: 'Paid project hours', cohort: 'customers who bought project hours' },
  convert: { short: 'Convert', cohort: 'converted customers' },
};

// ── component ─────────────────────────────────────────────────────────────────

export default function MotionFunnelDrill({ cfg, bqConnected, onConnect }) {
  const endDefault = currentMonth();
  const startDefault = clampStart(monthNMonthsAgo(endDefault, 24));

  // Goal: 'paid' | 'convert'
  const [goal, setGoal] = useState('paid');

  // Signup-month window (YYYY-MM values for <input type="month">)
  const [startMonth, setStartMonth] = useState(startDefault);
  const [endMonth, setEndMonth] = useState(endDefault);

  // Split-by
  const [splitKey, setSplitKey] = useState(null);
  const [splitValue, setSplitValue] = useState(null);
  const [splitOptions, setSplitOptions] = useState([]); // [{value, n}]

  // Data
  const [jointRows, setJointRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [retentionRow, setRetentionRow] = useState(null);

  // Loading / error
  const [jointLoading, setJointLoading] = useState(false);
  const [splitValLoading, setSplitValLoading] = useState(false);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── month-input helpers ───────────────────────────────────────────────────

  const handleStartChange = (e) => {
    let val = e.target.value; // YYYY-MM
    if (!val) return;
    if (val < MIN_START) val = MIN_START;
    if (val > endMonth) val = endMonth;
    setStartMonth(val);
    setSplitValue(null);
  };

  const handleEndChange = (e) => {
    let val = e.target.value;
    if (!val) return;
    const cur = currentMonth();
    if (val > cur) val = cur;
    if (val < startMonth) val = startMonth;
    setEndMonth(val);
    setSplitValue(null);
  };

  const applyPreset = (months) => {
    const end = currentMonth();
    const start = clampStart(monthNMonthsAgo(end, months));
    setEndMonth(end);
    setStartMonth(start);
    setSplitValue(null);
  };

  // ── split-key change ──────────────────────────────────────────────────────

  const handleSplitKeyChange = (e) => {
    const val = e.target.value || null;
    setSplitKey(val);
    setSplitValue(null);
    setSplitOptions([]);
  };

  const handleSplitValueChange = (e) => {
    const val = e.target.value || null;
    setSplitValue(val);
  };

  // ── fetch joint distribution ──────────────────────────────────────────────

  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    setJointLoading(true);
    setError(null);
    setJointRows([]);
    setTotal(0);

    fetchJoint({
      startMonth: toFloor(startMonth),
      endMonth: toFloor(endMonth),
      splitKey: splitKey || null,
      splitValue: splitValue || null,
    })
      .then(({ rows }) => {
        if (cancelled) return;
        setJointRows(rows);
        const t = rows.reduce((a, r) => a + (Number(r.n) || 0), 0);
        setTotal(t);
      })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setJointLoading(false); });

    return () => { cancelled = true; };
  }, [bqConnected, startMonth, endMonth, splitKey, splitValue]);

  // ── fetch split values when splitKey changes ──────────────────────────────

  useEffect(() => {
    if (!splitKey || !bqConnected) { setSplitOptions([]); return; }
    let cancelled = false;
    setSplitValLoading(true);

    fetchSplitValues({
      startMonth: toFloor(startMonth),
      endMonth: toFloor(endMonth),
      splitKey,
    })
      .then(({ rows }) => {
        if (cancelled) return;
        setSplitOptions(rows ?? []);
      })
      .catch(() => { if (!cancelled) setSplitOptions([]); })
      .finally(() => { if (!cancelled) setSplitValLoading(false); });

    return () => { cancelled = true; };
  }, [bqConnected, startMonth, endMonth, splitKey]);

  // ── fetch retention curve ─────────────────────────────────────────────────

  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    setRetentionLoading(true);
    setRetentionRow(null);

    fetchGoalRetention({
      startMonth: toFloor(startMonth),
      endMonth: toFloor(endMonth),
      goal,
      splitKey: splitKey || null,
      splitValue: splitValue || null,
    })
      .then(({ rows }) => {
        if (cancelled) return;
        setRetentionRow(rows?.[0] ?? null);
      })
      .catch(() => { if (!cancelled) setRetentionRow(null); })
      .finally(() => { if (!cancelled) setRetentionLoading(false); });

    return () => { cancelled = true; };
  }, [bqConnected, startMonth, endMonth, goal, splitKey, splitValue]);

  // ── unauthed prompt (mirrors FunnelDrill) ─────────────────────────────────

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

  // ── render ────────────────────────────────────────────────────────────────

  const goalLabel = goalLabels[goal] ?? goalLabels.paid;

  return (
    <div style={{ padding: 32, maxWidth: 1400 }}>
      {/* header + Beta pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 4px' }}>
        <h1 style={{
          fontSize: 28, fontWeight: 700, color: '#1a1a1a', margin: 0, fontFamily: font,
        }}>
          {cfg.title}
        </h1>
        {cfg.status && cfg.status !== 'live' && cfg.status !== 'approved' && (
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
            color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d',
            borderRadius: 999, padding: '4px 12px', whiteSpace: 'nowrap',
            fontFamily: font, flexShrink: 0,
          }}>
            {cfg.status}
          </span>
        )}
      </div>
      {cfg.subtitle && (
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px', fontFamily: font, maxWidth: 760 }}>
          {cfg.subtitle}
        </p>
      )}

      {/* always-on caveat banner */}
      <div style={{ ...AMBER_BANNER }}>
        ⚠ Engagement tracked from 2024; ~477 bought project hours without a SaaS conversion
        (the Not-converted → Paid cross-flow); association, not proof.
      </div>

      {/* controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', margin: '8px 0 20px' }}>

        {/* goal toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...sectionLabel, marginRight: 2 }}>Goal</span>
          {[
            { key: 'paid', label: 'Paid project hours' },
            { key: 'convert', label: 'Convert' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setGoal(key)}
              style={{
                padding: '5px 14px', fontSize: 13, fontWeight: 600, borderRadius: 999,
                border: '1px solid',
                borderColor: goal === key ? '#7c3aed' : '#d1d5db',
                background: goal === key ? '#7c3aed' : '#fff',
                color: goal === key ? '#fff' : '#374151',
                cursor: 'pointer', fontFamily: font,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* signup-month window */}
        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          Signup month — Start
          <input
            type="month"
            value={startMonth}
            min={MIN_START}
            max={endMonth}
            onChange={handleStartChange}
            style={inputStyle}
          />
        </label>
        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          End
          <input
            type="month"
            value={endMonth}
            min={startMonth}
            max={currentMonth()}
            onChange={handleEndChange}
            style={inputStyle}
          />
        </label>

        {/* preset buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[6, 12, 24].map((m) => (
            <button key={m} type="button" onClick={() => applyPreset(m)} style={presetBtn}>
              Last {m} mo
            </button>
          ))}
        </div>

        {/* split-by key select */}
        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          Split by
          <select
            value={splitKey ?? ''}
            onChange={handleSplitKeyChange}
            style={inputStyle}
          >
            {SPLITS.map((s) => (
              <option key={s.key ?? 'none'} value={s.key ?? ''}>{s.label}</option>
            ))}
          </select>
        </label>

        {/* split value select — shown only when a splitKey is active */}
        {splitKey && (
          <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
            {SPLITS.find((s) => s.key === splitKey)?.label ?? splitKey}
            {splitValLoading
              ? <span style={{ fontSize: 13, color: '#9ca3af', fontFamily: font }}>loading…</span>
              : (
                <select
                  value={splitValue ?? ''}
                  onChange={handleSplitValueChange}
                  style={inputStyle}
                >
                  <option value="">All</option>
                  {splitOptions.map((opt) => {
                    const v = String(opt.value ?? '');
                    return (
                      <option key={v} value={v}>
                        {v || '(blank)'} ({Number(opt.n ?? 0).toLocaleString()})
                      </option>
                    );
                  })}
                </select>
              )
            }
          </label>
        )}
      </div>

      {/* error banner */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
          borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13,
          fontFamily: font,
        }}>
          {`Could not load data: ${error.message}`}
        </div>
      )}

      {/* Sankey chart */}
      {jointLoading && jointRows.length === 0 && (
        <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading motion funnel…</p>
      )}
      <ChartErrorBoundary>
        <MotionSankeyChart jointRows={jointRows} goal={goal} total={total} />
      </ChartErrorBoundary>

      {/* retention panel */}
      <div style={{ margin: '32px 0 0' }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 10, fontFamily: font,
        }}>
          Retention of {goalLabel.cohort}
        </div>
        {retentionLoading && !retentionRow
          ? <p style={{ ...sectionLabel, padding: '8px 0' }}>Loading retention…</p>
          : (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {RETENTION_MONTHS.map((k) => {
                const point = retentionRow ? retentionRate(retentionRow, k) : null;
                const rate = point?.rate ?? null;
                const n = point?.n ?? 0;
                const mature = point !== null && n > 0;
                return (
                  <div key={k} style={{
                    background: '#f9fafb', border: '1px solid #e5e7eb',
                    borderRadius: 10, padding: '14px 20px', minWidth: 110,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4, fontFamily: font }}>
                      {k} mo
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: mature ? '#1a1a1a' : '#d1d5db', fontFamily: mono }}>
                      {mature ? pctFmt(rate) : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, fontFamily: font }}>
                      {mature ? `n=${n.toLocaleString()}` : 'n/a / not mature'}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </div>
    </div>
  );
}
