import React, { useState } from 'react';

const styles = {
  container: { display: 'flex', gap: 8, padding: '0 0 16px 0' },
  input: {
    flex: 1, background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 8,
    color: '#edf0f3', padding: '12px 16px', fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none',
  },
  button: {
    background: '#0a1f17', border: '1px solid #34d399', color: '#34d399', padding: '12px 20px',
    borderRadius: 8, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
  },
  explanation: { color: '#5a6370', fontSize: 12, padding: '4px 0', fontStyle: 'italic' },
  error: { color: '#f87171', fontSize: 12, padding: '4px 0' },
};

export default function AiPrompt({ onResult, loading, error, explanation }) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (prompt.trim()) onResult(prompt.trim());
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={styles.container}>
        <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the chart you want... e.g. 'Show me trials by month'"
          style={styles.input} disabled={loading} />
        <button type="submit" style={{ ...styles.button, opacity: loading ? 0.5 : 1 }} disabled={loading}>
          {loading ? 'Thinking...' : 'Build Chart'}
        </button>
      </form>
      {explanation && <div style={styles.explanation}>{explanation}</div>}
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}
