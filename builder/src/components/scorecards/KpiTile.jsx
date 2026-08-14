import React, { useState } from 'react';
import { formatValue } from './utils';
import { color, font, type, weight, radius, numeric, numericLg } from '../../styles/tokens';

const styles = {
  tile: {
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: radius.control,
    position: 'relative',
    transition: 'background 150ms ease-out',
  },
  tileHover: {
    background: color.surfaceAlt,
  },
  label: {
    fontSize: type.label,
    fontFamily: font.sans,
    fontWeight: weight.regular,
    color: color.inkMuted,
    marginBottom: 2,
  },
  value: {
    fontSize: type.valueLg,
    fontWeight: weight.medium,
    fontFamily: font.sans,
    color: color.ink,
    lineHeight: 1.2,
    ...numericLg,
  },
  delta: {
    fontSize: type.label,
    fontFamily: font.sans,
    ...numeric,
  },
  // An em dash, not italic "No data": italics in a data grid read as an error
  // state. inkMuted, not inkFaint — the reader has to perceive it.
  noData: {
    fontSize: type.valueLg,
    fontWeight: weight.regular,
    fontFamily: font.sans,
    color: color.inkMuted,
    lineHeight: 1.2,
  },
};

export default function KpiTile({ label, value, format, deltaPercent, noData, onClick }) {
  const [hovered, setHovered] = useState(false);

  if (noData) {
    return (
      <div style={styles.tile}>
        <div style={styles.label}>{label}</div>
        <div style={styles.noData}>—</div>
      </div>
    );
  }

  const formatted = formatValue(value, format);

  let deltaEl = null;
  if (deltaPercent != null) {
    const deltaColor = deltaPercent > 0 ? color.positive : deltaPercent < 0 ? color.negative : color.neutral;
    const arrow = deltaPercent > 0 ? '↑' : deltaPercent < 0 ? '↓' : '';
    const sign = deltaPercent > 0 ? '+' : '';
    deltaEl = (
      <div style={{ ...styles.delta, color: deltaColor }}>
        {arrow} {sign}{deltaPercent.toFixed(1)}%
      </div>
    );
  }

  return (
    <div
      style={{ ...styles.tile, ...(hovered ? styles.tileHover : {}) }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{formatted}</div>
      {deltaEl}
      {hovered && <span style={{ position: 'absolute', top: 6, right: 8, fontSize: 14, color: color.accentText }}>ⓘ</span>}
    </div>
  );
}
