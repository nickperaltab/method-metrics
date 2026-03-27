import React, { useState } from 'react';
import { saveFeedback } from '../lib/supabase';

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  btn: {
    background: 'transparent',
    border: '1px solid #1a1e24',
    borderRadius: 6,
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: 14,
    color: '#5a6370',
    transition: 'all 0.15s',
  },
  btnActive: {
    borderColor: '#34d399',
    color: '#34d399',
  },
  btnDown: {
    borderColor: '#f87171',
    color: '#f87171',
  },
  noteArea: {
    width: '100%',
    marginTop: 6,
    padding: 8,
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 6,
    color: '#c8cdd3',
    fontSize: 12,
    fontFamily: "'DM Sans', sans-serif",
    resize: 'vertical',
    minHeight: 48,
    outline: 'none',
  },
  submitBtn: {
    marginTop: 4,
    padding: '4px 12px',
    background: '#f87171',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  toast: {
    fontSize: 11,
    color: '#34d399',
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
