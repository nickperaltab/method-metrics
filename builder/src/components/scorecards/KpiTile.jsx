import React, { useState } from 'react';
import { formatValue } from './utils';
import { color, font, type, weight, radius, numeric, numericLg } from '../../styles/tokens';
import { FOCUSABLE, NoDataCell } from './ui';

const styles = {
  tile: {
    // Button chrome reset. This is the click-through to the Metric Inspector —
    // the primary interaction on all 22 scorecards — so it has to be a real
    // button, not a div with a handler.
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    margin: 0,
    font: 'inherit',
    textAlign: 'left',
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
  // state. inkMuted, not inkFaint — the reader has to perceive it. The text
  // half is carried for assistive tech by <NoDataCell>.
  noData: {
    fontSize: type.valueLg,
    fontWeight: weight.regular,
    fontFamily: font.sans,
    color: color.inkMuted,
    lineHeight: 1.2,
  },
};

export default function KpiTile({ label, value, format, deltaPercent, noData, onClick }) {
  // One flag for hover and focus, so a keyboard user gets the same background
  // change and the same ⓘ affordance a mouse user gets.
  const [active, setActive] = useState(false);

  if (noData) {
    return (
      <div style={{ ...styles.tile, cursor: 'default' }}>
        <div style={styles.label}>{label}</div>
        <NoDataCell style={styles.noData} />
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
    <button
      type="button"
      className={FOCUSABLE}
      style={{ ...styles.tile, ...(active ? styles.tileHover : {}) }}
      onClick={onClick}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{formatted}</div>
      {deltaEl}
      {active && (
        <span aria-hidden="true" style={{ position: 'absolute', top: 6, right: 8, fontSize: 14, color: color.accentText }}>ⓘ</span>
      )}
    </button>
  );
}
