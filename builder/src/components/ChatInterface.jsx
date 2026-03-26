import React, { useRef, useEffect, useState } from 'react';
import EChart from './EChart';
import DataTableView from './DataTableView';
import KpiCard from './KpiCard';
import ChartDetails from './ChartDetails';

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
    gap: 8,
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
    maxWidth: '100%',
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
    height: 450,
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
  recentBtnWrap: {
    position: 'relative',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 8,
    width: 280,
    maxHeight: 260,
    overflowY: 'auto',
    zIndex: 100,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  dropdownItem: {
    padding: '10px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid #1a1e24',
  },
  dropdownTitle: {
    fontSize: 12,
    color: '#edf0f3',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dropdownDate: {
    fontSize: 10,
    color: '#5a6370',
    fontFamily: "'JetBrains Mono', monospace",
    marginTop: 2,
  },
};

export default function ChatInterface({
  messages, onSend, loading, onNewThread, metrics, onSaveChart,
  recentConversations, onLoadConversation,
}) {
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [showRecent, setShowRecent] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Find index of the last assistant message with a chart
  const lastChartIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].chartOption) return i;
    }
    return -1;
  })();

  function handleSubmit(e) {
    e.preventDefault();
    const val = inputRef.current?.value?.trim();
    if (!val || loading) return;
    inputRef.current.value = '';
    onSend(val);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        {recentConversations && recentConversations.length > 0 && (
          <div style={styles.recentBtnWrap}>
            <button
              style={styles.newThreadBtn}
              onClick={() => setShowRecent(!showRecent)}
            >
              Recent
            </button>
            {showRecent && (
              <div style={styles.dropdown}>
                {recentConversations.slice(0, 5).map(conv => (
                  <div
                    key={conv.id}
                    style={styles.dropdownItem}
                    onClick={() => {
                      setShowRecent(false);
                      onLoadConversation(conv.id);
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#111518'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={styles.dropdownTitle}>{conv.title || 'Untitled'}</div>
                    <div style={styles.dropdownDate}>
                      {conv.updated_at ? new Date(conv.updated_at).toLocaleDateString() : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button style={styles.newThreadBtn} onClick={onNewThread}>
          New Thread
        </button>
      </div>

      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ color: '#8b929b', fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}>
              What chart would you like to build?
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {['Trials by month', 'Sync rate trend', 'Trials vs Syncs', 'Conversion rate'].map(chip => (
                <button
                  key={chip}
                  onClick={() => onSend(chip)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #34d399',
                    color: '#34d399',
                    padding: '6px 14px',
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#0a1f17'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === 'user') {
            return <div key={i} style={styles.userMsg}>{msg.content}</div>;
          }
          const isLatestChart = i === lastChartIndex;
          return (
            <div key={i} style={styles.assistantMsg}>
              {msg.content && <div style={styles.assistantText}>{msg.content}</div>}
              {msg.chartOption && (
                <div style={styles.chartWrap}>
                  <EChart option={msg.chartOption} />
                </div>
              )}
              {msg.kpiData && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {msg.kpiData.map((kpi, ki) => <KpiCard key={ki} {...kpi} />)}
                </div>
              )}
              {msg.tableData && (
                <DataTableView labels={msg.tableData.labels} datasets={msg.tableData.datasets} />
              )}
              {(msg.chartOption || msg.kpiData || msg.tableData) && onSaveChart && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => onSaveChart(i)}
                    style={{
                      background: '#0a1f17', border: '1px solid #34d399', color: '#34d399',
                      padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                    }}
                  >
                    Save Chart
                  </button>
                </div>
              )}
              {msg.queryDetails && msg.queryDetails.length > 0 && (
                <ChartDetails queryDetails={msg.queryDetails} metrics={metrics} />
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
