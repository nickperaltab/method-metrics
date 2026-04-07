import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { SCORECARDS } from '../config/scorecards';
import useScorecardData from '../hooks/useScorecardData';
import ScorecardSection from '../components/scorecards/ScorecardSection';
import Chart from '../components/scorecards/Chart';
import MetricInspector from '../components/scorecards/MetricInspector';

const DATE_PRESETS = [
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '12M', value: 12 },
  { label: 'All', value: null },
];

const GRAIN_OPTIONS = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
  { label: 'Quarterly', value: 'quarter' },
];

function PillGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(opt => (
        <button
          key={opt.label}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '4px 12px', fontSize: 12,
            fontWeight: value === opt.value ? 600 : 400,
            fontFamily: "'DM Sans', sans-serif",
            background: value === opt.value ? '#2563eb' : '#f3f4f6',
            color: value === opt.value ? '#fff' : '#6b7280',
            border: 'none', borderRadius: 16, cursor: 'pointer',
            transition: 'background 150ms, color 150ms',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ScoreCardFilters({ lastNMonths, onLastNMonths, grain, onGrain }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: "'DM Sans', sans-serif" }}>RANGE</span>
        <PillGroup options={DATE_PRESETS} value={lastNMonths} onChange={onLastNMonths} />
      </div>
      <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: "'DM Sans', sans-serif" }}>GRAIN</span>
        <PillGroup options={GRAIN_OPTIONS} value={grain} onChange={onGrain} />
      </div>
    </div>
  );
}

function BreakdownTabs({ sections, dataMap, onMetricClick, filterLastNMonths, grain }) {
  const [active, setActive] = useState(0);

  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{
        fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 16,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Breakdowns
      </h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {sections.map((section, i) => (
          <button
            key={section.title}
            onClick={() => setActive(i)}
            style={{
              padding: '6px 16px', fontSize: 13,
              fontWeight: active === i ? 600 : 400,
              fontFamily: "'DM Sans', sans-serif",
              background: active === i ? '#2563eb' : '#f3f4f6',
              color: active === i ? '#fff' : '#374151',
              border: 'none', borderRadius: 20, cursor: 'pointer',
              transition: 'background 150ms, color 150ms',
            }}
          >
            {section.title.replace(/^By /, '')}
          </button>
        ))}
      </div>

      {sections[active] && (
        <div>
          {(sections[active].charts || []).map((chart, i) => (
            <Chart
              key={i}
              config={chart}
              dataMap={dataMap}
              onMetricClick={onMetricClick}
              filterLastNMonths={filterLastNMonths}
              grain={grain}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Scorecard({ metrics, bqConnected, onConnect }) {
  const { id } = useParams();
  const config = SCORECARDS[id];
  const { dataMap, loading } = useScorecardData(config, metrics, bqConnected);
  const [inspected, setInspected] = useState(null);
  const [filterLastNMonths, setFilterLastNMonths] = useState(null);
  const [grain, setGrain] = useState('month');

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
          <div style={{ width: '30%', height: '100%', background: '#059669', borderRadius: 2 }} />
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
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 32,
      }}>
        <h1 style={{
          fontSize: 28, fontWeight: 700, color: '#1a1a1a', margin: 0,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {config.title}
        </h1>
        <ScoreCardFilters
          lastNMonths={filterLastNMonths} onLastNMonths={setFilterLastNMonths}
          grain={grain} onGrain={setGrain}
        />
      </div>

      {ungrouped.map(section => (
        <ScorecardSection
          key={section.title}
          section={section}
          dataMap={dataMap}
          onMetricClick={handleMetricClick}
          filterLastNMonths={filterLastNMonths}
          grain={grain}
        />
      ))}

      {breakdownSections.length > 0 && (
        <BreakdownTabs
          sections={breakdownSections}
          dataMap={dataMap}
          onMetricClick={handleMetricClick}
          filterLastNMonths={filterLastNMonths}
          grain={grain}
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
