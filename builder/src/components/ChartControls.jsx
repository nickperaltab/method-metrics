import React from 'react';

const TIME_RANGES = [
  { label: 'All', months: null },
  { label: 'YTD', months: 12 },
  { label: '6M', months: 6 },
  { label: '3M', months: 3 },
  { label: '1M', months: 1 },
];

const styles = {
  row: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 4,
    padding: '6px 0',
  },
  pill: {
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    color: '#5a6370',
    padding: '4px 12px',
    borderRadius: 12,
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 500,
    lineHeight: '16px',
  },
  pillActive: {
    background: '#0a1f17',
    border: '1px solid #34d399',
    color: '#34d399',
  },
};

export default function ChartControls({ selectedMonths, onTimeRangeChange }) {
  return (
    <div style={styles.row}>
      {TIME_RANGES.map(({ label, months }) => {
        const isActive = selectedMonths === months;
        return (
          <button
            key={label}
            style={{ ...styles.pill, ...(isActive ? styles.pillActive : {}) }}
            onClick={() => onTimeRangeChange(months)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
