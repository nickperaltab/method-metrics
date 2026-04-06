import React from 'react';
import KpiColumn from './KpiColumn';
import Chart from './Chart';

export default function ScorecardSection({ section, dataMap }) {
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
        gridTemplateColumns: '220px 1fr 1fr',
        gap: 24,
        alignItems: 'stretch',
      }}>
        {/* Left: KPI column */}
        {section.kpis && (
          <KpiColumn kpis={section.kpis} dataMap={dataMap} />
        )}

        {/* Right: Charts — stretch to fill row height */}
        {(section.charts || []).map((chart, i) => (
          <Chart key={i} config={chart} dataMap={dataMap} />
        ))}
      </div>
    </div>
  );
}
