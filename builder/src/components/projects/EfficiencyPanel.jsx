// Delivered vs promised, for one project.
//
// Two headline ratings side by side rather than one blended score — they fail for
// different reasons (see lib/efficiency.js). Under them, the per-task table that
// explains the number, because a project-level percentage nobody can attribute
// to a task is just a vibe.

import { useMemo } from 'react';
import {
  itemEfficiency,
  projectEfficiency,
  formatRatio,
  formatHours,
  ratingTone,
} from '../../lib/efficiency';
import { s, tone, SectionHead, Tag } from './ui';

const styles = {
  headline: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 20 },
  card: { border: '1px solid #e2e5e9', borderRadius: 8, padding: '16px 18px', background: '#fff' },
  value: { fontSize: 30, fontWeight: 700, lineHeight: 1.05, marginBottom: 6 },
  parts: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#6b7280' },
  explain: { fontSize: 12, color: '#6b7280', marginTop: 8, lineHeight: 1.45 },
  over: { color: '#b91c1c', fontWeight: 700 },
  under: { color: '#047857', fontWeight: 700 },
};

const VALUE_COLOUR = {
  good: '#047857',
  warn: '#b45309',
  bad: '#b91c1c',
  neutral: '#6b7280',
};

// The rating used to be carried by the number's colour alone. A word next to it
// means the verdict survives greyscale, colour-blindness and a screen reader.
const VERDICT = { good: 'on target', warn: 'watch', bad: 'over', neutral: null };

function Headline({ label, ratio, parts, explain }) {
  const band = ratingTone(ratio);
  return (
    <div style={styles.card}>
      <div style={s.statLabel}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ ...styles.value, color: VALUE_COLOUR[band], marginBottom: 0 }}>
          {formatRatio(ratio)}
        </span>
        {VERDICT[band] && (
          <span style={{ ...styles.parts, color: VALUE_COLOUR[band], fontWeight: 600 }}>
            {VERDICT[band]}
          </span>
        )}
      </div>
      <div style={styles.parts}>{parts}</div>
      <div style={styles.explain}>{explain}</div>
    </div>
  );
}

export default function EfficiencyPanel({ project, items, workLog }) {
  const totals = useMemo(
    () => projectEfficiency(project, { items, workLog }),
    [project, items, workLog]
  );
  // Only tasks carrying a promise are measurable; the rest would read as 0%.
  const rows = useMemo(
    () => itemEfficiency(items, workLog).filter((r) => r.promisedHours != null),
    [items, workLog]
  );
  const unlinked = useMemo(
    () => workLog.filter((e) => !e.itemId).reduce((sum, e) => sum + e.hours, 0),
    [workLog]
  );

  return (
    <section style={s.section}>
      <SectionHead title="Delivered vs promised" aside="per item" />

      <div style={styles.headline}>
        <Headline
          label="Hours efficiency"
          ratio={totals.hoursEfficiency}
          parts={`${formatHours(totals.promisedHours)}h promised · ${formatHours(totals.loggedHours)}h logged`}
          explain={
            totals.hoursVariance > 0
              ? `${formatHours(totals.hoursVariance)}h over the promised total.`
              : totals.hoursVariance < 0
                ? `${formatHours(Math.abs(totals.hoursVariance))}h under the promised total.`
                : 'Exactly on the promised total.'
          }
        />
        <Headline
          label="Delivery reliability"
          ratio={totals.deliveryReliability}
          parts={`${totals.promisedOnTime} of ${totals.promisedTotal} promised item${totals.promisedTotal === 1 ? '' : 's'} on time`}
          explain="Open promises count as missed."
        />
        <Headline
          label="Budget used"
          ratio={totals.budgetUsed}
          parts={totals.hoursBudget == null
            ? 'no budget set'
            : `${formatHours(totals.loggedHours)}h of ${formatHours(totals.hoursBudget)}h quoted`}
          explain="Not included in the efficiency score."
        />
      </div>

      {!rows.length ? (
        <div style={s.empty}>No promised hours yet. Set them on a work item.</div>
      ) : (
        <table style={s.table} aria-label="Delivered vs promised by work item">
          <thead>
            <tr>
              <th scope="col" style={s.th}>Work item</th>
              <th scope="col" style={s.th}>Status</th>
              <th scope="col" style={{ ...s.th, ...s.thNum }}>Promised h</th>
              <th scope="col" style={{ ...s.th, ...s.thNum }}>Logged h</th>
              <th scope="col" style={{ ...s.th, ...s.thNum }}>Variance</th>
              <th scope="col" style={{ ...s.th, ...s.thNum }}>Hours eff</th>
              <th scope="col" style={s.th}>Commitment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item.itemId}>
                <td style={s.td}>{r.item.title}</td>
                <td style={s.td}><Tag>{r.item.status}</Tag></td>
                <td style={{ ...s.td, ...s.tdNum }}>{formatHours(r.promisedHours)}h</td>
                {/* 0h is a fact — nobody has touched it — not missing data, so it
                    doesn't get the em dash that means "unknown". */}
                <td style={{ ...s.td, ...s.tdNum }}>{formatHours(r.loggedHours)}h</td>
                <td style={{ ...s.td, ...s.tdNum }}>
                  {r.variance == null || r.loggedHours === 0 ? <span style={s.muted}>—</span> : (
                    <span style={r.variance > 0 ? styles.over : styles.under}>
                      {r.variance > 0 ? '+' : ''}{formatHours(r.variance)}h
                    </span>
                  )}
                </td>
                <td style={{ ...s.td, ...s.tdNum }}>
                  <span style={tone[ratingTone(r.efficiency)]}>{formatRatio(r.efficiency)}</span>
                </td>
                <td style={s.td}>
                  {!r.item.isPromised ? <span style={s.muted}>—</span>
                    : r.onTime ? <Tag kind="good">on time</Tag>
                      : r.item.isOpen ? <Tag kind="warn">outstanding</Tag>
                        : <Tag kind="bad">late</Tag>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {unlinked > 0 && (
        <div style={{ ...s.hint, marginTop: 12 }}>
          {formatHours(unlinked)}h isn’t linked to an item, so the rows won’t sum to the headline.
        </div>
      )}
    </section>
  );
}
