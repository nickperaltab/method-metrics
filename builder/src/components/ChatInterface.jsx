import React, { useRef, useEffect } from 'react';
import EChart from './EChart';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 52px)',
    background: '#06080a',
  },
  header: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '8px 24px',
    borderBottom: '1px solid #1a1e24',
  },
  newThreadBtn: {
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    color: '#5a6370',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  userMsg: {
    alignSelf: 'flex-end',
    background: '#1a1e24',
    color: '#edf0f3',
    padding: '10px 16px',
    borderRadius: '12px 12px 4px 12px',
    maxWidth: '70%',
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: 'pre-wrap',
  },
  assistantMsg: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  assistantText: {
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    color: '#c8cdd3',
    padding: '10px 16px',
    borderRadius: '12px 12px 12px 4px',
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: 'pre-wrap',
  },
  chartWrap: {
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 8,
    height: 350,
    overflow: 'hidden',
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: '12px 24px',
    borderTop: '1px solid #1a1e24',
    background: '#0c0f12',
  },
  input: {
    flex: 1,
    background: '#06080a',
    border: '1px solid #1a1e24',
    color: '#edf0f3',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    outline: 'none',
  },
  sendBtn: {
    background: '#0a1f17',
    border: '1px solid #34d399',
    color: '#34d399',
    padding: '10px 20px',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    fontWeight: 600,
  },
  loadingDot: {
    alignSelf: 'flex-start',
    color: '#5a6370',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    padding: '10px 16px',
  },
};

export default function ChatInterface({ messages, onSend, loading, onNewThread }) {
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function handleSubmit(e) {
    e.preventDefault();
    const val = inputRef.current?.value?.trim();
    if (!val || loading) return;
    inputRef.current.value = '';
    onSend(val);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.newThreadBtn} onClick={onNewThread}>
          New Thread
        </button>
      </div>

      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={{ color: '#5a6370', textAlign: 'center', marginTop: 80, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
            Describe the chart you want to build.
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === 'user') {
            return <div key={i} style={styles.userMsg}>{msg.content}</div>;
          }
          return (
            <div key={i} style={styles.assistantMsg}>
              {msg.content && <div style={styles.assistantText}>{msg.content}</div>}
              {msg.chartOption && (
                <div style={styles.chartWrap}>
                  <EChart option={msg.chartOption} />
                </div>
              )}
            </div>
          );
        })}
        {loading && <div style={styles.loadingDot}>Thinking...</div>}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} style={styles.inputRow}>
        <input
          ref={inputRef}
          style={styles.input}
          placeholder="Ask for a chart or modify the current one..."
          disabled={loading}
        />
        <button type="submit" style={{ ...styles.sendBtn, opacity: loading ? 0.5 : 1 }} disabled={loading}>
          Send
        </button>
      </form>
    </div>
  );
}
