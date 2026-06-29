import { useState } from 'react';
import { RETENTION_HORIZONS } from '../../lib/motionFunnelTransform';

const fontMono = "'JetBrains Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

const STAGE_COLORS = {
  trial:      '#2563eb', // blue
  synced:     '#059669', // green
  converted:  '#0891b2', // cyan
  customized: '#7c3aed', // violet
};
const COLOR_MUTED = '#6b7280';
const COLOR_AMBER = '#b45309';
const BG_AMBER    = '#fef3c7';

// Mini retention bar color (muted teal)
const COLOR_RETENTION = '#0d9488';

/**
 * Two-path motion funnel: "Talked to us" | "Self-serve".
 * Each column renders Trial→Sync→Converted→Customized bars, a demo show-rate
 * chip (talked only), and a retention tail at m1/m3/m6/m12.
 *
 * @param {{talked: object, self_serve: object}} props.paths - output of toMotionFunnel()
 * @param {boolean} props.mature - false renders an amber "still maturing" note
 * @param {(motion:string, stageKey:string)=>void} props.onStageClick
 */
export default function MotionFunnelChart({ paths = {}, mature = true, onStageClick }) {
  const [hovered, setHovered] = useState(null); // `${motion}:${stageKey}`

  const { talked = {}, self_serve = {} } = paths;

  const columns = [
    { key: 'talked',     label: 'Talked to us', path: talked },
    { key: 'self_serve', label: 'Self-serve',   path: self_serve },
  ];

  return (
    <div style={{ width: '100%', fontFamily: fontSans, userSelect: 'none' }}>
      {!mature && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: COLOR_AMBER,
          background: BG_AMBER, borderRadius: 6,
          padding: '6px 10px', marginBottom: 12,
        }}>
          ⚠ cohort still maturing — counts will rise
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {columns.map(({ key: motion, label, path }) => (
          <PathColumn
            key={motion}
            motion={motion}
            label={label}
            path={path}
            showShowRate={motion === 'talked'}
            hovered={hovered}
            setHovered={setHovered}
            onStageClick={onStageClick}
          />
        ))}
      </div>
    </div>
  );
}

// ─── per-motion column ──────────────────────────────────────────────────────

function PathColumn({ motion, label, path, showShowRate, hovered, setHovered, onStageClick }) {
  const { stages = [], showRate = null, retention = [] } = path;

  return (
    <div style={{ minWidth: 0 }}>
      {/* column heading */}
      <div style={{
        fontSize: 13, fontWeight: 700, color: '#111827',
        marginBottom: showShowRate ? 6 : 10,
        letterSpacing: '-0.01em',
      }}>
        {label}
      </div>

      {/* demo show-rate chip (talked column only) */}
      {showShowRate && (
        <div style={{ marginBottom: 10 }}>
          <span style={{
            fontFamily: fontMono, fontSize: 11, fontWeight: 600,
            color: '#374151',
            background: '#f3f4f6', border: '1px solid #e5e7eb',
            borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap',
          }}>
            demo show rate{' '}
            <span style={{ color: showRate == null ? COLOR_MUTED : '#111827' }}>
              {showRate == null ? '—' : `${Math.round(showRate * 100)}%`}
            </span>
          </span>
        </div>
      )}

      {/* stage bars */}
      {stages.length === 0 ? (
        <div style={{
          color: '#9ca3af', fontSize: 13, fontFamily: fontSans,
          minHeight: 80, display: 'flex', alignItems: 'center',
        }}>
          No data
        </div>
      ) : (
        stages.map((stage, i) => {
          const hoverKey = `${motion}:${stage.key}`;
          const isHovered = hovered === hoverKey;
          const fill = STAGE_COLORS[stage.key] || COLOR_MUTED;
          const widthPct = Math.max(0, Math.min(1, stage.pctOfTrials || 0)) * 100;
          const pctLabel = Math.round((stage.pctOfTrials || 0) * 100);

          return (
            <div key={stage.key}>
              {/* bar row */}
              <div
                onClick={() => onStageClick && onStageClick(motion, stage.key)}
                onMouseEnter={() => setHovered(hoverKey)}
                onMouseLeave={() => setHovered((h) => (h === hoverKey ? null : h))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer', padding: '4px 6px', borderRadius: 4,
                  background: isHovered ? 'rgba(0,0,0,0.04)' : 'transparent',
                  transition: 'background 120ms ease',
                }}
              >
                {/* bar track + fill */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: `${widthPct}%`,
                    minWidth: 2,
                    height: 30,
                    background: fill,
                    borderRadius: 3,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 10,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                    filter: isHovered ? 'brightness(1.08)' : 'none',
                    transition: 'filter 120ms ease',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}>
                    <span style={{
                      fontFamily: fontSans, fontSize: 12, fontWeight: 700,
                      color: '#ffffff', whiteSpace: 'nowrap',
                    }}>
                      {stage.label}
                    </span>
                  </div>
                </div>

                {/* count + share */}
                <div style={{
                  flexShrink: 0,
                  fontFamily: fontMono, fontSize: 12, fontWeight: 600,
                  color: '#374151', whiteSpace: 'nowrap',
                }}>
                  {stage.count}
                  <span style={{ color: COLOR_MUTED, fontWeight: 500, marginLeft: 5 }}>
                    ({pctLabel}%)
                  </span>
                </div>
              </div>

              {/* drop-off line between consecutive bars */}
              {stage.dropToNext != null && i < stages.length - 1 && (
                <div style={{
                  fontFamily: fontSans, fontSize: 11, fontWeight: 500,
                  color: COLOR_MUTED, padding: '3px 6px 3px 16px',
                  whiteSpace: 'nowrap',
                }}>
                  ↓ {Math.round(stage.dropToNext * 100)}% drop
                </div>
              )}
            </div>
          );
        })
      )}

      {/* retention tail */}
      <RetentionTail retention={retention} />
    </div>
  );
}

// ─── retention tail ─────────────────────────────────────────────────────────

function RetentionTail({ retention }) {
  if (!retention || retention.length === 0) return null;

  // Build a map keyed by horizon month for quick lookup
  const byK = Object.fromEntries(retention.map((r) => [r.k, r]));

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: COLOR_MUTED,
        marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        Retention
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {RETENTION_HORIZONS.map((k) => {
          const rec = byK[k] || { k, mature: false, rate: null };
          const isNull = rec.rate == null;
          const pctLabel = isNull ? 'n/a' : `${Math.round(rec.rate * 100)}%`;
          const barHeight = isNull ? 8 : Math.max(4, Math.round(rec.rate * 48));

          return (
            <div key={k} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              minWidth: 36,
            }}>
              {/* pct label above bar */}
              <span style={{
                fontFamily: fontMono, fontSize: 11, fontWeight: 600,
                color: isNull ? COLOR_MUTED : '#374151',
                whiteSpace: 'nowrap',
              }}>
                {pctLabel}
              </span>

              {/* bar */}
              <div style={{
                width: 28,
                height: barHeight,
                background: isNull ? '#d1d5db' : COLOR_RETENTION,
                borderRadius: 3,
                opacity: isNull ? 0.55 : 1,
                transition: 'height 200ms ease',
              }} />

              {/* horizon label */}
              <span style={{
                fontFamily: fontSans, fontSize: 11, fontWeight: 500,
                color: COLOR_MUTED,
              }}>
                m{k}
              </span>

              {/* not-mature label */}
              {isNull && (
                <span style={{
                  fontFamily: fontSans, fontSize: 9, fontWeight: 500,
                  color: COLOR_MUTED, whiteSpace: 'nowrap',
                  textAlign: 'center', lineHeight: 1.2,
                }}>
                  not mature
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
