import React, { useState, useRef, useEffect } from 'react';
import { formatValue } from './utils';

const styles = {
  tile: {
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: 6,
    position: 'relative',
    transition: 'background 150ms ease-out',
  },
  tileHover: {
    background: '#f0f4ff',
  },
  label: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#6b7280',
    marginBottom: 2,
  },
  value: {
    fontSize: 28,
    fontWeight: 700,
    fontFamily: "'DM Sans', sans-serif",
    color: '#1a1a1a',
    lineHeight: 1.2,
  },
  delta: {
    fontSize: 12,
    fontFamily: "'DM Sans', sans-serif",
  },
  noData: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
};

export default function KpiTile({ label, value, format, deltaPercent, deltaTooltip, noData, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (!tooltipOpen) return;
    function close(e) {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) setTooltipOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [tooltipOpen]);

  if (noData) {
    return (
      <div style={styles.tile}>
        <div style={styles.label}>{label}</div>
        <div style={styles.noData}>No data</div>
      </div>
    );
  }

  const formatted = formatValue(value, format);

  let deltaEl = null;
  if (deltaPercent != null) {
    const color = deltaPercent > 0 ? '#059669' : deltaPercent < 0 ? '#dc2626' : '#6b7280';
    const arrow = deltaPercent > 0 ? '\u2191' : deltaPercent < 0 ? '\u2193' : '';
    const sign = deltaPercent > 0 ? '+' : '';
    deltaEl = (
      <div style={{ ...styles.delta, color }}>
        {arrow} {sign}{deltaPercent.toFixed(1)}%
        {deltaTooltip && (
          <span
            style={{ marginLeft: 4, cursor: 'pointer', color: '#9ca3af', fontSize: 11 }}
            onClick={(e) => { e.stopPropagation(); setTooltipOpen(o => !o); }}
          >ⓘ</span>
        )}
      </div>
    );
  }

  const tooltipEl = tooltipOpen && deltaTooltip ? (
    <div
      ref={tooltipRef}
      style={{
        position: 'absolute', bottom: '100%', left: 0, zIndex: 50,
        background: '#1f2937', color: '#f9fafb', borderRadius: 6,
        padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)', marginBottom: 4,
      }}
    >
      <div>This month: {formatValue(deltaTooltip.current, deltaTooltip.format)}</div>
      <div>Last month: {formatValue(deltaTooltip.prior, deltaTooltip.format)}</div>
      <div style={{ marginTop: 3, color: '#d1d5db' }}>
        {deltaPercent > 0 ? '+' : ''}{deltaPercent?.toFixed(1)}% vs last month
      </div>
    </div>
  ) : null;

  return (
    <div
      style={{ ...styles.tile, ...(hovered ? styles.tileHover : {}), position: 'relative' }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {tooltipEl}
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{formatted}</div>
      {deltaEl}
    </div>
  );
}
