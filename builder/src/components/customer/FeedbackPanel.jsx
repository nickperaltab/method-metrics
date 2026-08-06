// Call feedback for one customer: how the calls on this account have been scored,
// which rubric section is weakest, and anything flagged as an escalation risk.
//
// Percentages in the audit tables are 0–100, not fractions — don't run them
// through formatRatio(), which multiplies.

import { s, tone, SectionHead, Tag } from '../projects/ui';

const styles = {
  headline: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 },
  card: { border: '1px solid #e2e5e9', borderRadius: 8, padding: '16px 18px', background: '#fff' },
  value: { fontSize: 30, fontWeight: 700, lineHeight: 1.05, marginBottom: 6 },
  parts: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#6b7280' },
  explain: { fontSize: 12, color: '#6b7280', marginTop: 8, lineHeight: 1.45 },
  sectionRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  sectionLabel: { fontSize: 13, color: '#374151', width: 110, flexShrink: 0 },
  track: { flex: 1, height: 8, background: '#f0f1f3', borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  sectionPct: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#374151', width: 44, textAlign: 'right' },
  escalation: {
    border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8,
    padding: '14px 16px', marginBottom: 12,
  },
  escalationLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#b91c1c', marginBottom: 6,
  },
  text: { fontSize: 13, color: '#374151', lineHeight: 1.55 },
};

const COLOUR = { good: '#047857', warn: '#b45309', bad: '#b91c1c', neutral: '#6b7280' };

/** Score bands for a 0–100 audit percentage. */
export function scoreTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'good';
  if (pct >= 65) return 'warn';
  return 'bad';
}

const pct = (n) => (n == null ? '—' : `${Math.round(n)}%`);

export default function FeedbackPanel({ audits, summary, caveat }) {
  if (!summary) {
    return (
      <section style={s.section}>
        <SectionHead title="Call feedback" aside="none yet" />
        <div style={s.empty}>
          {caveat ?? 'No call audits for this customer yet.'}
        </div>
      </section>
    );
  }

  const { averagePct, latest, delta, flagged, escalations, sections, count } = summary;
  const worst = sections[0];

  return (
    <section style={s.section}>
      <SectionHead
        title="Call feedback"
        aside={`${count} audit${count === 1 ? '' : 's'} · newest ${latest?.date ?? '—'}`}
      />

      <div style={styles.headline}>
        <div style={styles.card}>
          <div style={s.statLabel}>Average score</div>
          <div style={{ ...styles.value, color: COLOUR[scoreTone(averagePct)] }}>{pct(averagePct)}</div>
          <div style={styles.parts}>across {summary.scoredCount} scored call{summary.scoredCount === 1 ? '' : 's'}</div>
          {/* A rubric score of our call, not a customer-satisfaction measure. */}
          <div style={styles.explain}>Audit rubric score, 0–100.</div>
        </div>

        <div style={styles.card}>
          <div style={s.statLabel}>Latest call</div>
          <div style={{ ...styles.value, color: COLOUR[scoreTone(latest?.overallPct)] }}>
            {pct(latest?.overallPct)}
          </div>
          <div style={styles.parts}>
            {delta == null
              ? 'no earlier scored call'
              : `${delta > 0 ? '+' : ''}${Math.round(delta)} pts vs. previous`}
          </div>
          {/* No "by the audit" fallback: attributing a score to a system reads as if
              nobody was accountable for it. */}
          <div style={styles.explain}>
            {latest?.rating
              ? (latest.consultant
                ? `Rated “${latest.rating}” by ${latest.consultant}.`
                : `Rated “${latest.rating}”.`)
              : ''}
          </div>
        </div>

        <div style={styles.card}>
          <div style={s.statLabel}>Weakest section</div>
          <div style={{ ...styles.value, color: COLOUR[scoreTone(worst?.averagePct)] }}>
            {pct(worst?.averagePct)}
          </div>
          <div style={styles.parts}>{worst?.label ?? '—'}</div>
          <div style={styles.explain}>
            Lowest section average across all audits.
          </div>
        </div>
      </div>

      {escalations.map((audit) => (
        <div key={audit.auditId} style={styles.escalation}>
          <div style={styles.escalationLabel}>Escalation risk · {audit.date}</div>
          <div style={styles.text}>{audit.escalationEvidence ?? 'Flagged as an escalation risk.'}</div>
        </div>
      ))}

      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ ...s.statLabel, marginBottom: 10 }}>Section averages</div>
        {sections.map((section) => (
          <div key={section.label} style={styles.sectionRow}>
            <div style={styles.sectionLabel}>{section.label}</div>
            <div style={styles.track}>
              <div style={{
                ...styles.fill,
                width: `${Math.max(0, Math.min(100, section.averagePct))}%`,
                background: COLOUR[scoreTone(section.averagePct)],
              }} />
            </div>
            <div style={styles.sectionPct}>{pct(section.averagePct)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {flagged > 0 && <Tag kind="bad">{flagged} flagged</Tag>}
        {[...new Set(audits.map((a) => a.kind))].map((kind) => (
          <Tag key={kind}>{kind === 'FREE' ? 'free-hour rubric' : 'PPU rubric'}</Tag>
        ))}
        <span style={s.hint}>Each audit is in the timeline below.</span>
      </div>
    </section>
  );
}

/** Shared by the header stat row so the colour bands stay in one place. */
export function ScorePill({ value }) {
  return <span style={tone[scoreTone(value)]}>{pct(value)}</span>;
}
