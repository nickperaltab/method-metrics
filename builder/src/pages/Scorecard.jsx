import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { SCORECARDS } from '../config/scorecards';
import useScorecardData from '../hooks/useScorecardData';
import ScorecardSection from '../components/scorecards/ScorecardSection';
import Chart from '../components/scorecards/Chart';
import MetricInspector from '../components/scorecards/MetricInspector';

function BreakdownTabs({ sections, dataMap, onMetricClick }) {
  const [active, setActive] = useState(0);

  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{
        fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 16,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Breakdowns
      </h2>

      {/* Tab buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {sections.map((section, i) => (
          <button
            key={section.title}
            onClick={() => setActive(i)}
            style={{
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: active === i ? 600 : 400,
              fontFamily: "'DM Sans', sans-serif",
              background: active === i ? '#2563eb' : '#f3f4f6',
              color: active === i ? '#fff' : '#374151',
              border: 'none',
              borderRadius: 20,
              cursor: 'pointer',
              transition: 'background 150ms, color 150ms',
            }}
          >
            {/* Strip "By " prefix for tab labels */}
            {section.title.replace(/^By /, '')}
          </button>
        ))}
      </div>

      {/* Active breakdown chart */}
      {sections[active] && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 24,
        }}>
          {(sections[active].charts || []).map((chart, i) => (
            <Chart key={i} config={chart} dataMap={dataMap} onMetricClick={onMetricClick} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Scorecard({ metrics, bqConnected, onConnect }) {
  const { id } = useParams();
  const config = SCORECARDS[id];
  const { dataMap, loading, progress } = useScorecardData(config, metrics, bqConnected);
  const [inspected, setInspected] = useState(null);

  const metricsCache = useMemo(() => {
    if (!metrics) return new Map();
    return new Map(metrics.map(m => [m.id, m]));
  }, [metrics]);

  if (!config) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
        <h2>Scorecard not found</h2>
        <p>No scorecard with ID "{id}"</p>
      </div>
    );
  }

  if (!bqConnected) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, color: '#1a1a1a', marginBottom: 8 }}>{config.title}</h2>
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

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
        <h2 style={{ fontSize: 20, color: '#1a1a1a', marginBottom: 8 }}>{config.title}</h2>
        <p>Loading data...</p>
        <div style={{
          width: 200, height: 4, background: '#e2e5e9', borderRadius: 2,
          margin: '12px auto', overflow: 'hidden',
        }}>
          <div style={{
            width: progress.total ? `${(progress.loaded / progress.total) * 100}%` : '10%',
            height: '100%', background: '#059669', borderRadius: 2,
            transition: 'width 0.3s',
          }} />
        </div>
      </div>
    );
  }

  const handleMetricClick = (metricId, value, format, customInfo) =>
    setInspected({ metricId, value, format, customInfo });

  const ungrouped = config.sections.filter(s => !s.group);
  const breakdownSections = config.sections.filter(s => s.group === 'breakdowns');

  return (
    <div style={{ padding: 32, maxWidth: 1400 }}>
      <h1 style={{
        fontSize: 28, fontWeight: 700, color: '#1a1a1a', marginBottom: 32,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {config.title}
      </h1>

      {ungrouped.map(section => (
        <ScorecardSection
          key={section.title}
          section={section}
          dataMap={dataMap}
          onMetricClick={handleMetricClick}
        />
      ))}

      {breakdownSections.length > 0 && (
        <BreakdownTabs
          sections={breakdownSections}
          dataMap={dataMap}
          onMetricClick={handleMetricClick}
        />
      )}

      <MetricInspector
        metricId={inspected?.metricId}
        currentValue={inspected?.value}
        valueFormat={inspected?.format}
        metricsCache={metricsCache}
        customInfo={inspected?.customInfo}
        onClose={() => setInspected(null)}
      />
    </div>
  );
}
