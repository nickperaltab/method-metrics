import { useState } from 'react';

const fontMono = "'JetBrains Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

// Per-stage palette.
const STAGE_COLORS = {
  trial: '#2563eb',     // blue
  synced: '#059669',    // green
  converted: '#0891b2', // cyan
};
const COLOR_DEP = '#a855f7';    // DEP chip
const COLOR_MUTED = '#6b7280';  // muted text (drop-off, counts)
const COLOR_AMBER = '#b45309';  // amber note text
const BG_AMBER = '#fef3c7';     // amber note background

// Compact currency formatter, e.g. $1.2M / $120K / -$45K / $0.
function formatUsd(v) {
  if (v == null || isNaN(v)) return '';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * Stepped acquisition funnel: one horizontal bar per stage (Trial → Sync →
 * Converted), bar width proportional to the share of the trial cohort, with
 * drop-off % between bars and a $ annotation on the Converted bar.
 *
 * @param {object} props
 * @param {Array<{key:'trial'|'synced'|'converted', label:string, count:number,
 *   pctOfTrials:number, dropToNext:(number|null)}>} props.stages - output of
 *   normalizeFunnel(...). pctOfTrials/dropToNext are 0..1.
 * @param {{core_mrr:number, dep_mrr:number}} props.conversionMrr - $ annotation
 *   for the Converted bar.
 * @param {boolean} props.mature - false renders an amber "still maturing" note.
 * @param {(stageKey:string)=>void} props.onStageClick - called with stage key
 *   when a bar is clicked.
 */
export default function FunnelChart({ stages, conversionMrr, mature, onStageClick }) {
  const [hovered, setHovered] = useState(null); // stage key being hovered

  if (!stages || !stages.length) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', minHeight: 120, color: '#9ca3af', fontSize: 13,
        fontFamily: fontSans,
      }}>
        No funnel data
      </div>
    );
  }

  const mrr = conversionMrr || {};

  return (
    <div style={{ width: '100%', fontFamily: fontSans, userSelect: 'none' }}>
      {!mature && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: COLOR_AMBER,
          background: BG_AMBER, borderRadius: 6,
          padding: '6px 10px', marginBottom: 10,
        }}>
          ⚠ cohort still maturing — counts will rise
        </div>
      )}

      {stages.map((stage, i) => {
        const fill = STAGE_COLORS[stage.key] || COLOR_MUTED;
        const widthPct = Math.max(0, Math.min(1, stage.pctOfTrials || 0)) * 100;
        const pctLabel = Math.round((stage.pctOfTrials || 0) * 100);
        const isConverted = stage.key === 'converted';

        return (
          <div key={stage.key}>
            {/* the bar row */}
            <div
              onClick={() => onStageClick && onStageClick(stage.key)}
              onMouseEnter={() => setHovered(stage.key)}
              onMouseLeave={() => setHovered((h) => (h === stage.key ? null : h))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 4,
                background: hovered === stage.key ? 'rgba(0,0,0,0.04)' : 'transparent',
                transition: 'background 120ms ease',
              }}
            >
              {/* bar track + fill */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    width: `${widthPct}%`,
                    minWidth: 2,
                    height: 30,
                    background: fill,
                    borderRadius: 3,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 10,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                    filter: hovered === stage.key ? 'brightness(1.08)' : 'none',
                    transition: 'filter 120ms ease',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                >
                  <span style={{
                    fontFamily: fontSans, fontSize: 12, fontWeight: 700,
                    color: '#ffffff', whiteSpace: 'nowrap',
                  }}>
                    {stage.label}
                  </span>
                </div>
              </div>

              {/* count + share to the right of the bar */}
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

              {/* $ annotation on the Converted bar */}
              {isConverted && (
                <div style={{ flexShrink: 0, display: 'flex', gap: 6 }}>
                  <span style={{
                    fontFamily: fontMono, fontSize: 11, fontWeight: 600,
                    color: STAGE_COLORS.converted,
                    background: '#f3f4f6', border: '1px solid #e5e7eb',
                    borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
                  }}>
                    core {formatUsd(mrr.core_mrr)}
                  </span>
                  <span style={{
                    fontFamily: fontMono, fontSize: 11, fontWeight: 600,
                    color: COLOR_DEP,
                    background: '#f3f4f6', border: '1px solid #e5e7eb',
                    borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
                  }}>
                    DEP {formatUsd(mrr.dep_mrr)}
                  </span>
                </div>
              )}
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
      })}
    </div>
  );
}
