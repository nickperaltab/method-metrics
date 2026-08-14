import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SCORECARDS } from '../config/scorecards';
import posthog from '../lib/posthog';
import useScorecardData from '../hooks/useScorecardData';
import ScorecardSection from '../components/scorecards/ScorecardSection';
import DecompositionDrill from '../components/scorecards/DecompositionDrill';
import FunnelDrill from '../components/scorecards/FunnelDrill';
import MotionFunnelDrill from '../components/scorecards/MotionFunnelDrill';
import GrrIndustryDrill from '../components/scorecards/GrrIndustryDrill';
import IntakeMixDrill from '../components/scorecards/IntakeMixDrill';
import ChannelTrajectoryScorecard from '../components/scorecards/ChannelTrajectoryScorecard';
import CohortSurvivalChart from '../components/scorecards/CohortSurvivalChart';
import RetentionTriangle from '../components/scorecards/RetentionTriangle';
import MethodMondayPaceView from '../components/method-monday/MethodMondayPaceView';
import Chart from '../components/scorecards/Chart';
import MetricInspector from '../components/scorecards/MetricInspector';
import StaleIndicator from '../components/StaleIndicator';
import { card, color, font, type, weight, radius, sectionGap } from '../styles/tokens';
import { IconButton, Pill, ScorecardStyles } from '../components/scorecards/ui';

const DATE_PRESETS = [
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '12M', value: 12 },
  { label: 'All', value: 'all' },
];

const GRAIN_OPTIONS = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
  { label: 'Quarterly', value: 'quarter' },
];

function PillGroup({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 4 }}>
      {options.map(opt => (
        <Pill
          key={opt.label}
          label={opt.label}
          selected={value === opt.value}
          onClick={() => onChange(opt.value)}
        />
      ))}
    </div>
  );
}

function ScoreCardFilters({ lastNMonths, onLastNMonths }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <PillGroup
          options={DATE_PRESETS}
          value={lastNMonths}
          onChange={onLastNMonths}
          label="Date range"
        />
      </div>
    </div>
  );
}

function BreakdownTabs({ sections, dataMap, onMetricClick, filterLastNMonths, grain }) {
  const [active, setActive] = useState(0);

  return (
    <div style={{ ...card, marginBottom: sectionGap }}>
      <h2 style={{
        fontSize: type.sectionTitle, fontWeight: weight.medium, color: color.ink, marginBottom: 16,
        fontFamily: font.sans,
      }}>
        Breakdowns
      </h2>

      <div
        role="tablist"
        aria-label="Breakdowns"
        style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}
      >
        {sections.map((section, i) => (
          <Pill
            key={section.title}
            role="tab"
            size="lg"
            label={section.title.replace(/^By /, '')}
            selected={active === i}
            onClick={() => setActive(i)}
          />
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
  const { dataMap, loading, freshness, refreshedAt, needsBq } = useScorecardData(config, metrics, bqConnected);

  useEffect(() => {
    if (config?.id) posthog.capture('scorecard_opened', { scorecard_id: config.id });
  }, [config?.id]);
  const [inspected, setInspected] = useState(null);
  const [filterLastNMonths, setFilterLastNMonths] = useState('all');
  const [grain, setGrain] = useState('month');

  const metricsCache = useMemo(() => {
    if (!metrics) return new Map();
    return new Map(metrics.map(m => [m.id, m]));
  }, [metrics]);

  if (!config) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: color.inkMuted }}>
        <h2>Scorecard not found</h2>
        <p>Check the link or pick one from the sidebar.</p>
      </div>
    );
  }

  // Custom-renderer scorecards (e.g. Net SaaS drilldown) own their own data
  // fetching + layout; they have no `sections`, so branch before the section loop.
  if (config.renderer === 'netSaasDrill') {
    return <DecompositionDrill config={config} bqConnected={bqConnected} onConnect={onConnect} />;
  }
  if (config.renderer === 'funnelDrill') {
    return <FunnelDrill cfg={config} bqConnected={bqConnected} onConnect={onConnect} />;
  }
  if (config.renderer === 'motionFunnelDrill') {
    return <MotionFunnelDrill cfg={config} bqConnected={bqConnected} onConnect={onConnect} />;
  }
  if (config.renderer === 'grrIndustry') {
    return <GrrIndustryDrill cfg={config} bqConnected={bqConnected} onConnect={onConnect} />;
  }
  if (config.renderer === 'intakeMix') {
    return <IntakeMixDrill cfg={config} bqConnected={bqConnected} onConnect={onConnect} />;
  }
  if (config.renderer === 'channelTrajectory') {
    return <ChannelTrajectoryScorecard cfg={config} bqConnected={bqConnected} onConnect={onConnect} />;
  }

  if (needsBq && dataMap.size === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2 style={{ fontSize: type.valueMd, color: color.ink, marginBottom: 8 }}>{config.title}</h2>
        <p style={{ color: color.inkMuted, marginBottom: 16 }}>Connect to BigQuery to load scorecard data.</p>
        <button
          onClick={onConnect}
          style={{
            background: color.accentText, color: color.surface, border: 'none', borderRadius: radius.control,
            padding: '10px 24px', fontSize: 14, fontWeight: weight.medium, cursor: 'pointer',
          }}
        >
          Connect BigQuery
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: color.inkMuted }}>
        <h2 style={{ fontSize: type.valueMd, color: color.ink, marginBottom: 8 }}>{config.title}</h2>
        <p>Loading data...</p>
        <div style={{
          width: 200, height: 4, background: color.border, borderRadius: 2,
          margin: '12px auto', overflow: 'hidden',
        }}>
          <div style={{ width: '30%', height: '100%', background: color.accent, borderRadius: 2 }} />
        </div>
      </div>
    );
  }

  const handleMetricClick = (metricId, value, format, customInfo, deltaInfo) =>
    setInspected({ metricId, value, format, customInfo, deltaInfo });

  // Non-breakdown sections render in config order, so a custom-component section
  // sits exactly where it's placed in the array (e.g. above the Customer List).
  // `renderedBy` opts a section OUT of this loop entirely — it's still in
  // config.sections so collectMetricIds (lib/sql/plan.js) loads its kpis into
  // dataMap, but the named custom component (matched below) is responsible for
  // rendering it, e.g. inline inside an expanded row rather than as an
  // always-visible block. See method-monday-scorecard.js's "renderedBy" note.
  const mainSections = config.sections.filter(s => s.group !== 'breakdowns' && !s.renderedBy);
  const breakdownSections = config.sections.filter(s => s.group === 'breakdowns');

  return (
    // The wash sits on the full-width canvas, not on the 1400px content column,
    // so there is no seam where the content stops on a wide screen.
    <div style={{ background: color.canvasWash, minHeight: '100%' }}>
      <ScorecardStyles />
      <div style={{ padding: 32, maxWidth: 1400 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24,
        }}>
          <div>
            <h1 style={{
              fontSize: type.pageTitle, fontWeight: weight.medium, color: color.ink, margin: 0,
              fontFamily: font.sans,
            }}>
              {config.title}
            </h1>
            {config.description && (
              <div style={{ fontSize: type.body, color: color.inkMuted, marginTop: 4, maxWidth: 700, fontFamily: font.sans }}>
                {config.description}
              </div>
            )}
          </div>
          {!config.hideDateFilter && (
            <ScoreCardFilters
              lastNMonths={filterLastNMonths} onLastNMonths={setFilterLastNMonths}
            />
          )}
        </div>

        <StaleIndicator freshness={freshness} refreshedAt={refreshedAt} />

        {mainSections.map((section, i) => (
          section.component ? (
            // MethodMondayPaceView already draws its own card (surface, border,
            // radius.card), so it opts out rather than being boxed twice.
            <div
              key={section.title}
              style={section.component === 'methodMondayPace'
                ? { marginBottom: sectionGap }
                : { ...card, marginBottom: sectionGap }}
            >
              <h2 style={{
                fontSize: type.sectionTitle, fontWeight: weight.medium, color: color.ink, margin: '0 0 12px',
                fontFamily: font.sans,
              }}>
                {section.title}
                {section.dbtModel && (
                  <IconButton
                    label={`How ${section.title} is derived`}
                    onClick={() => setInspected({ dbtModel: section.dbtModel })}
                    style={{ marginLeft: 8, verticalAlign: 'middle' }}
                  />
                )}
              </h2>
              {section.component === 'cohortSurvival' && <CohortSurvivalChart />}
              {section.component === 'retentionTriangle' && <RetentionTriangle />}
              {section.component === 'methodMondayPace' && (
                <MethodMondayPaceView
                  dataMap={dataMap}
                  detailSections={config.sections.filter((s) => s.renderedBy === section.component)}
                  onMetricClick={handleMetricClick}
                />
              )}
            </div>
          ) : (
            <ScorecardSection
              key={section.title}
              section={section}
              dataMap={dataMap}
              onMetricClick={handleMetricClick}
              filterLastNMonths={filterLastNMonths}
              grain={i === 0 && !config.hideGrain ? grain : null}
              onGrain={i === 0 && !config.hideGrain ? setGrain : null}
            />
          )
        ))}

        {breakdownSections.length > 0 && (
          <BreakdownTabs
            sections={breakdownSections}
            dataMap={dataMap}
            onMetricClick={handleMetricClick}
            filterLastNMonths={filterLastNMonths}
            grain={null}
          />
        )}

        <MetricInspector
          metricId={inspected?.metricId}
          dbtModel={inspected?.dbtModel}
          currentValue={inspected?.value}
          valueFormat={inspected?.format}
          metricsCache={metricsCache}
          customInfo={inspected?.customInfo}
          deltaInfo={inspected?.deltaInfo}
          onClose={() => setInspected(null)}
        />
      </div>
    </div>
  );
}
