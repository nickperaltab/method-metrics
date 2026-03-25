import React, { useState } from 'react';

const styles = {
  sidebar: { background: '#06080a', border: '1px solid #1a1e24', borderRadius: 8, padding: 16, overflowY: 'auto', minWidth: 240, maxWidth: 280 },
  heading: { fontSize: 13, fontWeight: 600, color: '#5a6370', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, cursor: 'pointer', userSelect: 'none' },
  item: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#c8cdd3', transition: 'background .1s' },
  badge: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, padding: '1px 6px', borderRadius: 3, marginLeft: 'auto' },
  section: { marginBottom: 12 },
};

const TYPE_COLORS = { primitive: '#34d399', foundational: '#38bdf8', derived: '#fbbf24' };

export default function MetricPicker({ grouped, selectedMetricId, onSelect }) {
  const [expanded, setExpanded] = useState({ primitives: true, foundational: true, derived: true });
  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const renderSection = (label, key, metrics) => {
    const color = TYPE_COLORS[key === 'primitives' ? 'primitive' : key] || '#5a6370';
    return (
      <div style={styles.section} key={key}>
        <div style={styles.heading} onClick={() => toggle(key)}>
          {expanded[key] ? '▾' : '▸'} {label}
        </div>
        {expanded[key] && metrics.map(m => (
          <div key={m.id} style={{ ...styles.item, background: selectedMetricId === m.id ? '#0c0f12' : 'transparent', borderLeft: selectedMetricId === m.id ? `2px solid ${color}` : '2px solid transparent' }} onClick={() => onSelect(m)}>
            <span>{m.name}</span>
            <span style={{ ...styles.badge, color, border: `1px solid ${color}30`, background: `${color}10` }}>{m.metric_type}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={styles.sidebar}>
      {renderSection('Primitives', 'primitives', grouped.primitives)}
      {renderSection('Foundational', 'foundational', grouped.foundational)}
      {renderSection('Derived', 'derived', grouped.derived)}
    </div>
  );
}
