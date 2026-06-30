// builder/src/components/scorecards/TaxonomyPanel.jsx
// "What these labels mean & how we assign them" reference panel on the GRR by
// Industry page, so the industry and bucket labels are legible to anyone,
// including leadership. Content is static (industryTaxonomy.js), sourced from the
// V7.1 classification documentation. Each L1 card expands to its L2
// sub-industries. L3 definitions are a later pass.
import { useState } from 'react';
import {
  L1_DEFINITIONS, SPECIAL_BUCKETS, HOW_WE_LABEL, TAXONOMY_VERSION, TAXONOMY_SOURCE,
} from '../../config/industryTaxonomy';

const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";

const card = { border: '1px solid #e2e5e9', borderRadius: 8, padding: '12px 14px', background: '#fff' };
const cardName = { fontSize: 14, fontWeight: 700, color: '#1a1a1a', fontFamily: fontSans };
const cardOne = { fontSize: 12.5, color: '#059669', fontWeight: 600, fontFamily: fontSans, margin: '2px 0 6px' };
const cardDesc = { fontSize: 12.5, color: '#4b5563', fontFamily: fontSans, lineHeight: 1.45 };
const sub = { fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', fontFamily: fontSans, margin: '18px 0 10px' };
const l2link = { marginTop: 8, fontSize: 11.5, fontWeight: 700, color: '#2563eb', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: fontSans };

function L1Card({ d }) {
  const [showL2, setShowL2] = useState(false);
  return (
    <div style={card}>
      <div style={cardName}>{d.name}</div>
      <div style={cardOne}>{d.oneLiner}</div>
      <div style={cardDesc}>{d.description}</div>
      {d.l2?.length > 0 && (
        <>
          <button style={l2link} onClick={() => setShowL2((s) => !s)}>
            {showL2 ? '▾' : '▸'} {d.l2.length} sub-industries (L2)
          </button>
          {showL2 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {d.l2.map((s) => (
                <div key={s.name} style={{ fontSize: 12, color: '#4b5563', fontFamily: fontSans, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, color: '#1a1a1a' }}>{s.name}.</span> {s.oneLiner}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TaxonomyPanel() {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ border: '1px solid #e2e5e9', borderRadius: 10, background: '#f9fafb', margin: '8px 0 20px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 13, color: '#6b7280', fontFamily: fontMono, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>▸</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', fontFamily: fontSans }}>
          What these labels mean &amp; how we assign them
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#eef2f7', border: '1px solid #e2e5e9', borderRadius: 999, padding: '2px 9px', fontFamily: fontSans, whiteSpace: 'nowrap' }}>
          {TAXONOMY_VERSION}
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 16px 18px' }}>
          <p style={{ fontSize: 12.5, color: '#4b5563', fontFamily: fontSans, lineHeight: 1.5, margin: '0 0 6px', maxWidth: 880 }}>
            {HOW_WE_LABEL.summary}
          </p>

          <div style={sub}>Industries (L1, click for sub-industries)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
            {L1_DEFINITIONS.map((d) => <L1Card key={d.name} d={d} />)}
          </div>

          <div style={sub}>Other buckets on the chart</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
            {SPECIAL_BUCKETS.map((d) => (
              <div key={d.name} style={{ ...card, background: '#f8fafc' }}>
                <div style={cardName}>{d.name}</div>
                <div style={cardDesc}>{d.description}</div>
              </div>
            ))}
          </div>

          <div style={sub}>How we assign labels</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {HOW_WE_LABEL.principles.map((p) => (
              <div key={p.name} style={{ fontSize: 12.5, color: '#4b5563', fontFamily: fontSans, lineHeight: 1.45 }}>
                <strong style={{ color: '#1a1a1a' }}>{p.name}.</strong> {p.text}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', fontFamily: fontSans, lineHeight: 1.45, margin: '10px 0 0' }}>
            {HOW_WE_LABEL.validation}
          </p>

          <p style={{ fontSize: 11, color: '#9ca3af', fontFamily: fontSans, margin: '14px 0 0' }}>
            {TAXONOMY_SOURCE}. L3 sub-industry definitions are a later pass.
          </p>
        </div>
      )}
    </div>
  );
}
