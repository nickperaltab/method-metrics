import React from 'react';
import KpiColumn from './KpiColumn';
import Chart from './Chart';
import DataTable from './DataTable';
import RawTable from './RawTable';
import ChannelTable from './ChannelTable';
import { card, color, font, type, weight, radius, sectionGap } from '../../styles/tokens';

const sectionTitleStyle = {
  fontSize: type.sectionTitle,
  fontWeight: weight.medium,
  color: color.ink,
  margin: 0,
  fontFamily: font.sans,
};

/**
 * Wrapper for every section. A card by default: surface on the page canvas,
 * hairline border, one shadow.
 *
 * `variant="plain"` is the opt-out, for a section a parent has already
 * contained — MethodMondayPaceView renders each expanded detail section inside
 * its own card, and boxing it again would double the containment. All three
 * section types (default, rawTable, channelTable) render correctly carded:
 * none of them draws a surface of its own, so none needs to opt out.
 */
function sectionWrapperStyle(variant) {
  if (variant === 'plain') return { marginBottom: sectionGap };
  return { ...card, marginBottom: sectionGap };
}

const GRAIN_OPTIONS = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
  { label: 'Quarterly', value: 'quarter' },
];

export default function ScorecardSection({ section, dataMap, onMetricClick, filterLastNMonths, grain, onGrain, variant }) {
  const wrapperStyle = sectionWrapperStyle(variant);

  // Raw table sections render differently — full width, no chart grid
  if (section.type === 'rawTable') {
    return (
      <div style={wrapperStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>
            {section.title}
          </h2>
          {section.metricId && onMetricClick && (
            <span
              onClick={() => onMetricClick(section.metricId, null, null)}
              style={{ fontSize: 14, color: color.inkMuted, cursor: 'pointer', transition: 'color 100ms' }}
              onMouseEnter={e => { e.target.style.color = color.accentText; }}
              onMouseLeave={e => { e.target.style.color = color.inkMuted; }}
            >ⓘ</span>
          )}
        </div>
        <RawTable config={section} dataMap={dataMap} />
      </div>
    );
  }

  // Channel breakdown table — dimension rows × metric columns, filters + drill-down.
  if (section.type === 'channelTable') {
    return (
      <div style={wrapperStyle}>
        <h2 style={{ ...sectionTitleStyle, margin: '0 0 16px' }}>
          {section.title}
        </h2>
        <ChannelTable config={section} dataMap={dataMap} onMetricClick={onMetricClick} />
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={sectionTitleStyle}>
            {section.title}
          </h2>
          {section.description && (
            <div style={{ fontSize: type.body, color: color.inkMuted, marginTop: 4, fontFamily: font.sans }}>
              {section.description}
            </div>
          )}
        </div>
        {onGrain && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {GRAIN_OPTIONS.map(opt => (
              <button
                key={opt.label}
                onClick={() => onGrain(opt.value)}
                style={{
                  padding: '4px 12px', fontSize: type.label,
                  fontWeight: grain === opt.value ? weight.medium : weight.regular,
                  fontFamily: font.sans,
                  background: grain === opt.value ? color.accentBg : color.surfaceAlt,
                  color: grain === opt.value ? color.accentText : color.inkMuted,
                  border: 'none', borderRadius: radius.control, cursor: 'pointer',
                  transition: 'background 150ms, color 150ms',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: section.layout === 'column'
          ? '1fr'
          : section.kpis
            ? '220px 1fr 1fr'
            : `repeat(${Math.min((section.charts || []).length, 2)}, 1fr)`,
        gap: 24,
        alignItems: 'stretch',
      }}>
        {section.kpis && (
          <KpiColumn kpis={section.kpis} dataMap={dataMap} onMetricClick={onMetricClick} />
        )}
        {(section.charts || []).map((chart, i) => (
          <Chart key={i} config={chart} dataMap={dataMap} onMetricClick={onMetricClick} filterLastNMonths={filterLastNMonths} grain={grain} />
        ))}
      </div>

      {(section.tables || []).map((table, i) => (
        <DataTable key={i} config={table} dataMap={dataMap} onMetricClick={onMetricClick} />
      ))}
    </div>
  );
}
