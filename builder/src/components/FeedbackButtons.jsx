import React, { useState } from 'react';
import { saveFeedback } from '../lib/supabase';
import posthog from '../lib/posthog';

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  btn: {
    background: 'transparent',
    border: '1px solid #e2e5e9',
    borderRadius: 6,
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: 14,
    color: '#6b7280',
    transition: 'all 0.15s',
  },
  btnActive: {
    borderColor: '#059669',
    color: '#059669',
  },
  btnDown: {
    borderColor: '#dc2626',
    color: '#dc2626',
  },
  noteArea: {
    width: '100%',
    marginTop: 6,
    padding: 8,
    background: '#f8f9fa',
    border: '1px solid #e2e5e9',
    borderRadius: 6,
    color: '#374151',
    fontSize: 12,
    fontFamily: "'DM Sans', sans-serif",
    resize: 'vertical',
    minHeight: 48,
    outline: 'none',
  },
  submitBtn: {
    marginTop: 4,
    padding: '4px 12px',
    background: '#dc2626',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  toast: {
    fontSize: 11,
    color: '#059669',
    marginLeft: 8,
  },
};

export default function FeedbackButtons({ userEmail, source, messageIndex, chartId, chartSpec }) {
  const [sentiment, setSentiment] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (s, n) => {
    setSaving(true);
    try {
      await saveFeedback({ userEmail, source, messageIndex, chartId, sentiment: s, notes: n || null, chartSpec });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      posthog.capture('chart_feedback_submitted', {
        sentiment: s,
        has_notes: !!(n && n.trim()),
        source,
        chart_id: chartId,
      });
    } catch { /* best-effort */ }
    setSaving(false);
  };

  const handleUp = () => {
    if (sentiment) return;
    setSentiment('up');
    submit('up', null);
  };

  const handleDown = () => {
    if (sentiment) return;
    setSentiment('down');
    setShowNotes(true);
  };

  const handleSubmitNotes = () => {
    submit('down', notes);
    setShowNotes(false);
  };

  return (
    <div>
      <div style={styles.row}>
        <button
          style={{ ...styles.btn, ...(sentiment === 'up' ? styles.btnActive : {}) }}
          onClick={handleUp}
          disabled={!!sentiment}
          title="This looks right"
        >
          👍
        </button>
        <button
          style={{ ...styles.btn, ...(sentiment === 'down' ? styles.btnDown : {}) }}
          onClick={handleDown}
          disabled={!!sentiment}
          title="Something's off"
        >
          👎
        </button>
        {saved && <span style={styles.toast}>Thanks for the feedback!</span>}
      </div>
      {showNotes && (
        <div>
          <textarea
            style={styles.noteArea}
            placeholder="What's wrong? (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            autoFocus
          />
          <button style={styles.submitBtn} onClick={handleSubmitNotes} disabled={saving}>
            {saving ? 'Sending...' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
}
