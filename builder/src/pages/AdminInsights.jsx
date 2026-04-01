import React, { useState, useEffect } from 'react';
import { fetchAllConversations, fetchAllFeedback, SUPABASE_URL, headers } from '../lib/supabase';

const DIMENSION_KEYWORDS = ['by country', 'by channel', 'by vertical', 'by industry', 'by sync type', 'per country', 'distribution across', 'breakdown by', 'split by', 'stacked by'];

function hasDimensionIntent(prompt = '') {
  const lower = prompt.toLowerCase();
  return DIMENSION_KEYWORDS.some(kw => lower.includes(kw));
}

function diagnosisTag(prompt, aiSpec) {
  if (!aiSpec) return null;
  if (hasDimensionIntent(prompt) && !aiSpec.groupByDimension) {
    return { label: 'group_by missing?', color: '#ef4444', bg: '#fef2f2' };
  }
  return { label: 'ok', color: '#059669', bg: '#ecfdf5' };
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sqlPreview(sql, len = 100) {
  if (!sql) return '—';
  return sql.length > len ? sql.slice(0, len) + '…' : sql;
}

const styles = {
  page: { padding: '24px 32px', maxWidth: 1200, margin: '0 auto', fontFamily: "'DM Sans', sans-serif" },
  h1: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 24px' },
  h2: { fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: '0 0 12px', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 8, padding: 20, marginBottom: 24 },
  label: { fontSize: 10, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 },
  pill: { display: 'inline-block', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: '#e2e5e9', color: '#374151', margin: '2px 3px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" },
  th: { background: '#f1f3f5', color: '#6b7280', padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e5e9', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' },
  td: { padding: '8px 12px', borderBottom: '1px solid #e2e5e9', color: '#374151', verticalAlign: 'top' },
  pre: { background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 6, padding: 12, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto', color: '#374151' },
  expandedRow: { background: '#ffffff', padding: '12px 16px' },
  toggle: { background: 'none', border: 'none', color: '#059669', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: 0 },
  versionBadge: { display: 'inline-block', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', marginLeft: 8 },
  empty: { color: '#6b7280', fontSize: 13, padding: 16, textAlign: 'center' },
};

function Tag({ label, color, bg }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 3, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color, background: bg, border: `1px solid ${color}33` }}>
      {label}
    </span>
  );
}

function BuildRow({ event }) {
  const [expanded, setExpanded] = useState(false);
  const tag = diagnosisTag(event.prompt, event.aiSpec);
  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <td style={styles.td}>{formatTime(event.updatedAt)}</td>
        <td style={styles.td}>{event.userEmail || '—'}</td>
        <td style={{ ...styles.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.prompt || '—'}</td>
        <td style={styles.td}>{event.aiSpec?.echartsType || '—'}</td>
        <td style={styles.td}>{event.aiSpec?.groupByDimension || <span style={{ color: '#9ca3af' }}>null</span>}</td>
        <td style={styles.td}>{event.aiSpec?.metricIds?.join(', ') || '—'}</td>
        <td style={{ ...styles.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6b7280' }}>{sqlPreview(event.queryDetails?.[0]?.sql)}</td>
        <td style={styles.td}>{tag && <Tag {...tag} />}</td>
        <td style={{ ...styles.td, color: '#059669' }}>{expanded ? '▾' : '▸'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0 }}>
            <div style={styles.expandedRow}>
              {event.aiSpec && (
                <>
                  <div style={styles.label}>AI JSON</div>
                  <pre style={{ ...styles.pre, marginBottom: 12 }}>{JSON.stringify(event.aiSpec, null, 2)}</pre>
                </>
              )}
              {event.queryDetails?.map((q, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={styles.label}>{q.metricName} (id:{q.metricId}) — {q.dateColumn}</div>
                  <pre style={styles.pre}>{q.sql}</pre>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminInsights({ metrics = [] }) {
  const [info, setInfo] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [builds, setBuilds] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch edge function info
        const infoRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-chart`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'info' }),
        });
        if (infoRes.ok) setInfo(await infoRes.json());
      } catch { /* non-critical */ }

      try {
        const convos = await fetchAllConversations(300);
        // Parse all chart build events out of conversation message history
        const events = [];
        for (const conv of convos) {
          const msgs = conv.messages || [];
          for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            if (m.role === 'assistant' && m.aiSpec) {
              const prompt = msgs[i - 1]?.content || '';
              events.push({
                conversationId: conv.id,
                updatedAt: conv.updated_at,
                userEmail: conv.user_email,
                prompt,
                aiSpec: m.aiSpec,
                queryDetails: m.queryDetails || [],
              });
            }
          }
        }
        setBuilds(events.reverse()); // most recent first
      } catch { /* non-critical */ }

      try {
        const fb = await fetchAllFeedback(300);
        setFeedback(fb.filter(f => f.sentiment === 'down'));
      } catch { /* non-critical */ }

      setLoading(false);
    }
    load();
  }, []);

  const liveMetricCount = metrics.filter(m => m.status === 'live').length;

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>AI Insights</h1>

      {/* Section 1: System Info */}
      <div style={styles.card}>
        <h2 style={styles.h2}>System Info</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 16 }}>
          <div>
            <div style={styles.label}>Edge Function Version</div>
            <span style={{ fontSize: 13, color: '#1a1a1a' }}>
              ai-chart
              {info ? <span style={styles.versionBadge}>v{info.version}</span> : <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 8 }}>loading…</span>}
            </span>
          </div>
          <div>
            <div style={styles.label}>Live Metrics</div>
            <span style={{ fontSize: 13, color: '#1a1a1a', fontFamily: "'JetBrains Mono', monospace" }}>{liveMetricCount}</span>
          </div>
          <div>
            <div style={styles.label}>Model</div>
            <span style={{ fontSize: 13, color: '#1a1a1a', fontFamily: "'JetBrains Mono', monospace" }}>claude-sonnet-4-5</span>
          </div>
        </div>

        {info?.supported_chart_types && (
          <div style={{ marginBottom: 16 }}>
            <div style={styles.label}>Supported Chart Types</div>
            {info.supported_chart_types.map(t => <span key={t} style={styles.pill}>{t}</span>)}
          </div>
        )}

        <button style={styles.toggle} onClick={() => setShowPrompt(p => !p)}>
          {showPrompt ? '▾ Hide system prompt' : '▸ Show system prompt'}
        </button>
        {showPrompt && info?.system_prompt && (
          <pre style={{ ...styles.pre, marginTop: 10 }}>{info.system_prompt}</pre>
        )}
      </div>

      {/* Section 2: Build Log */}
      <div style={styles.card}>
        <h2 style={styles.h2}>Build Log {!loading && <span style={{ color: '#6b7280', fontWeight: 400 }}>({builds.length})</span>}</h2>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : builds.length === 0 ? (
          <div style={styles.empty}>No chart builds logged yet. Build a chart to see it here.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>User</th>
                  <th style={styles.th}>Prompt</th>
                  <th style={styles.th}>Chart type</th>
                  <th style={styles.th}>Group by</th>
                  <th style={styles.th}>Metrics</th>
                  <th style={styles.th}>SQL preview</th>
                  <th style={styles.th}>Diagnosis</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {builds.map((event, i) => <BuildRow key={i} event={event} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 3: Negative Feedback */}
      <div style={styles.card}>
        <h2 style={styles.h2}>Negative Feedback {!loading && <span style={{ color: '#6b7280', fontWeight: 400 }}>({feedback.length})</span>}</h2>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : feedback.length === 0 ? (
          <div style={styles.empty}>No negative feedback yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>User</th>
                  <th style={styles.th}>Notes</th>
                  <th style={styles.th}>Prompt</th>
                  <th style={styles.th}>Chart type</th>
                  <th style={styles.th}>SQL preview</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f, i) => (
                  <tr key={i}>
                    <td style={styles.td}>{formatTime(f.created_at)}</td>
                    <td style={styles.td}>{f.user_email || '—'}</td>
                    <td style={{ ...styles.td, maxWidth: 200 }}>{f.notes || <span style={{ color: '#9ca3af' }}>no notes</span>}</td>
                    <td style={{ ...styles.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.chart_spec?.prompt || '—'}</td>
                    <td style={styles.td}>{f.chart_spec?.queryDetails?.[0]?.metricName || '—'}</td>
                    <td style={{ ...styles.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6b7280' }}>{sqlPreview(f.chart_spec?.queryDetails?.[0]?.sql)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
