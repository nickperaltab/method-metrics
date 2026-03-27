import React from 'react';

const styles = {
  card: {
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 12,
    padding: 24,
    minWidth: 200,
    flex: '1 1 200px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#5a6370',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  value: {
    fontSize: 42,
    fontWeight: 700,
    fontFamily: "'DM Sans', sans-serif",
    color: '#edf0f3',
    lineHeight: 1.1,
  },
  delta: {
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
  },
};

export default function KpiCard({ metricName, value, delta, deltaPercent, isRate, hasError }) {
  if (hasError) {
    return (
      <div style={{ ...styles.card, borderColor: '#7f1d1d' }}>
        <div style={styles.label}>{metricName}</div>
        <div style={{ ...styles.value, fontSize: 16, color: '#f87171' }}>Data unavailable</div>
        <div style={{ ...styles.delta, color: '#5a6370' }}>Unable to load — try refreshing</div>
      </div>
    );
  }

  const formattedValue = isRate
    ? `${(value * 100).toFixed(1)}%`
    : Number(value).toLocaleString();

  let deltaColor = '#5a6370';
  let deltaText = '\u2014 no change';
  if (deltaPercent > 0) {
    deltaColor = '#34d399';
    deltaText = `\u2191 +${deltaPercent}% vs prior month`;
  } else if (deltaPercent < 0) {
    deltaColor = '#f87171';
    deltaText = `\u2193 ${deltaPercent}% vs prior month`;
  }

  return (
    <div style={styles.card}>
      <div style={styles.label}>{metricName}</div>
      <div style={styles.value}>{formattedValue}</div>
      <div style={{ ...styles.delta, color: deltaColor }}>{deltaText}</div>
    </div>
  );
}
