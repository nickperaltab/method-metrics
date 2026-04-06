import React from 'react';
import { useParams } from 'react-router-dom';
import { SCORECARDS } from '../config/scorecards';
import useScorecardData from '../hooks/useScorecardData';
import ScorecardSection from '../components/scorecards/ScorecardSection';

export default function Scorecard({ metrics, bqConnected, onConnect }) {
  const { id } = useParams();
  const config = SCORECARDS[id];
  const { dataMap, loading, progress } = useScorecardData(config, metrics, bqConnected);

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
        <p>Loading metrics... {progress.loaded} / {progress.total}</p>
        <div style={{
          width: 200, height: 4, background: '#e2e5e9', borderRadius: 2,
          margin: '12px auto', overflow: 'hidden',
        }}>
          <div style={{
            width: progress.total ? `${(progress.loaded / progress.total) * 100}%` : 0,
            height: '100%', background: '#059669', borderRadius: 2,
            transition: 'width 0.3s',
          }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 1400 }}>
      <h1 style={{
        fontSize: 28, fontWeight: 700, color: '#1a1a1a', marginBottom: 32,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {config.title}
      </h1>
      {config.sections.map(section => (
        <ScorecardSection key={section.title} section={section} dataMap={dataMap} />
      ))}
    </div>
  );
}
