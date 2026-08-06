// What the customer has actually told us, extracted from call transcripts by the
// customer_signals pipeline.
//
// Shown as a per-field latest, not the latest row: signals are extracted per
// call, and an older call often carries a field a newer one never mentioned. Each
// value is dated so a stale "pain" can't masquerade as current.

import { s, SectionHead, Tag } from '../projects/ui';

const styles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 },
  card: { border: '1px solid #e2e5e9', borderRadius: 8, padding: '14px 16px', background: '#fff' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  label: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b7280',
  },
  // This date is the panel's whole point — it's what stops a stale "pain" reading as
  // current — so it can't be the least legible text on the screen (was 1.91:1).
  date: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280' },
  text: { fontSize: 13, color: '#374151', lineHeight: 1.55 },
  evidence: {
    fontSize: 12, color: '#6b7280', lineHeight: 1.5, marginTop: 20,
    borderLeft: '3px solid #e2e5e9', paddingLeft: 12, fontStyle: 'italic',
  },
};

// Ordered as a story, not alphabetically: where they are, what hurts, what it
// costs, what forces the timing, who decides.
const FIELDS = [
  { key: 'situation', label: 'Situation' },
  { key: 'pain', label: 'Pain' },
  { key: 'impact', label: 'Impact' },
  { key: 'criticalEvent', label: 'Critical event' },
  { key: 'decision', label: 'Decision process' },
  { key: 'statedGoals', label: 'Stated goals' },
  { key: 'whitespaceSignals', label: 'Whitespace' },
];

export default function SignalsPanel({ signals, latest }) {
  const populated = FIELDS.filter((f) => latest[f.key]);

  if (!populated.length) {
    return (
      <section style={s.section}>
        <SectionHead title="What they’ve told us" aside="extracted from call transcripts" />
        {/* Coverage is thin upstream (76 accounts) — documented in
            docs/ps-customer-page.md rather than explained here. */}
        <div style={s.empty}>
          No extracted signals for this customer. Read the call transcripts in the timeline below.
        </div>
      </section>
    );
  }

  const newest = signals.find((sig) => sig.date)?.date;
  const evidence = signals.find((sig) => sig.evidence);

  return (
    <section style={s.section}>
      <SectionHead
        title="What they’ve told us"
        aside={`${signals.length} extracted call${signals.length === 1 ? '' : 's'} · newest ${newest ?? '—'}`}
      />
      <div style={styles.grid}>
        {populated.map((field) => {
          const entry = latest[field.key];
          return (
            <div key={field.key} style={styles.card}>
              <div style={styles.head}>
                <span style={styles.label}>{field.label}</span>
                <span style={styles.date}>{entry.date}</span>
              </div>
              <div style={styles.text}>{entry.value}</div>
            </div>
          );
        })}
      </div>
      {evidence && (
        <div style={styles.evidence}>
          {evidence.evidence}
          <div style={{ ...styles.date, fontStyle: 'normal', marginTop: 6 }}>
            verbatim evidence · {evidence.date}
          </div>
        </div>
      )}
      {/* Per-field latest, so a value can be older than the newest call. The count
          is already in the section aside above. */}
      <div style={{ ...s.hint, marginTop: 12 }}>
        Each value is dated by the call it came from.
      </div>
    </section>
  );
}
