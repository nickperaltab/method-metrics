import React from 'react';
import KpiColumn from './KpiColumn';
import Chart from './Chart';
import DataTable from './DataTable';
import RawTable from './RawTable';

export default function ScorecardSection({ section, dataMap, onMetricClick, filterLastNMonths }) {
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
      <h2 style={{
        fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 16,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {section.title}
      </h2>

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
          <Chart key={i} config={chart} dataMap={dataMap} onMetricClick={onMetricClick} filterLastNMonths={filterLastNMonths} />
        ))}
      </div>

      {(section.tables || []).map((table, i) => (
        <DataTable key={i} config={table} dataMap={dataMap} onMetricClick={onMetricClick} />
      ))}
    </div>
  );
}
