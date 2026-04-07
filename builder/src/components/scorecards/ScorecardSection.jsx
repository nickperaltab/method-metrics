import React from 'react';
import KpiColumn from './KpiColumn';
import Chart from './Chart';
import DataTable from './DataTable';
import RawTable from './RawTable';

const GRAIN_OPTIONS = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
  { label: 'Quarterly', value: 'quarter' },
];

export default function ScorecardSection({ section, dataMap, onMetricClick, filterLastNMonths, grain, onGrain }) {
  // Raw table sections render differently — full width, no chart grid
  if (section.type === 'rawTable') {
    return (
      <div style={{ marginBottom: 48 }}>
        <h2 style={{
          fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 16,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {section.title}
        </h2>
        <RawTable config={section} dataMap={dataMap} />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{
          fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: 0,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {section.title}
        </h2>
        {onGrain && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {GRAIN_OPTIONS.map(opt => (
              <button
                key={opt.label}
                onClick={() => onGrain(opt.value)}
                style={{
                  padding: '4px 12px', fontSize: 12,
                  fontWeight: grain === opt.value ? 600 : 400,
                  fontFamily: "'DM Sans', sans-serif",
                  background: grain === opt.value ? '#2563eb' : '#f3f4f6',
                  color: grain === opt.value ? '#fff' : '#6b7280',
                  border: 'none', borderRadius: 16, cursor: 'pointer',
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
        gridTemplateColumns: section.kpis
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
