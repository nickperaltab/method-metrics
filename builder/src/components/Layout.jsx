import React, { useState } from 'react';
import Sidebar from './Sidebar';

export default function Layout({ children, bqConnected, userEmail, onConnect }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#ffffff', color: '#374151', fontFamily: "'DM Sans', sans-serif" }}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Compact top bar — just BQ status */}
        <div style={{
          padding: '8px 24px',
          borderBottom: '1px solid #e2e5e9',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          background: '#ffffff',
          gap: 12,
        }}>
          {/* Mobile menu toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            data-testid="sidebar-toggle"
            style={{
              display: 'none',
              background: 'none',
              border: '1px solid #e2e5e9',
              color: '#374151',
              padding: '4px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 16,
              marginRight: 'auto',
            }}
          >
            {sidebarCollapsed ? '\u2630' : '\u2715'}
          </button>

          {bqConnected
            ? <span style={{ color: '#059669', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                &#9679; BQ Connected{userEmail ? ` (${userEmail})` : ''}
              </span>
            : <button
                onClick={onConnect}
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#059669',
                  padding: '4px 12px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                }}
              >
                Connect BigQuery
              </button>
          }
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
