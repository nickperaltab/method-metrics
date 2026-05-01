// Disconnected admin page — no nav link, direct URL only.
// Hash route: #/exports/saas-data
//
// Builds the SAAS Data Excel from BigQuery, populating a copy of the
// SaaSRevTemplate.xlsx file shipped in /public/templates. See
// docs/saas-data-export-mapping.md for the column-mapping audit and
// known caveats with how the source classifier buckets revenue.

import { useState } from 'react';
import { buildSaasDataExport, downloadBlob } from '../lib/saasDataExport';

function defaultMonthRange() {
  // Default to the most recently closed month, expressed in UTC midnight
  // bounds (matches the published file's FromDateFilter/ToDateFilter
  // semantics).
  const now = new Date();
  const fromY = now.getUTCFullYear();
  const fromM = now.getUTCMonth(); // 0-indexed, current month
  // Previous month start → previous month end (= current month start).
  const from = new Date(Date.UTC(fromY, fromM - 1, 1));
  const to   = new Date(Date.UTC(fromY, fromM, 1));
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  };
}

export default function SaasDataExport({ bqConnected }) {
  const initial = defaultMonthRange();
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const onGenerate = async () => {
    setBusy(true); setError(''); setStatus('Starting…');
    try {
      const from = new Date(`${fromDate}T00:00:00Z`);
      const to   = new Date(`${toDate}T00:00:00Z`);
      if (!(from < to)) throw new Error('From-date must be before To-date');

      const baseUrl = import.meta.env.BASE_URL || '/';
      const templateUrl = `${baseUrl}templates/SaaSRevTemplate.xlsx`;

      const blob = await buildSaasDataExport({
        fromDate: from,
        toDate: to,
        templateUrl,
        onProgress: setStatus,
      });
      const ymd = `${fromDate}_to_${toDate}`;
      downloadBlob(blob, `saasrevenue_${ymd}.xlsx`);
      setStatus('Done. Check your downloads.');
    } catch (e) {
      console.error('[saas-export]', e);
      setError(e?.message || String(e));
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 32, fontFamily: "'DM Sans', sans-serif", maxWidth: 720 }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
        letterSpacing: '.12em', textTransform: 'uppercase', color: '#059669',
        background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4,
        padding: '5px 10px', display: 'inline-block', marginBottom: 16,
      }}>SAAS Data Export</div>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px' }}>
        SaaS Data → Excel
      </h1>
      <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.5, margin: '0 0 24px' }}>
        Generates the same workbook marketing reads each month
        (Invoices / CreditMemos / Accounts + the formula-driven Marketing Metrics tab).
        Reads from BigQuery; uses the SaaSRevTemplate so all downstream formulas keep working.
        See <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 3 }}>docs/saas-data-export-mapping.md</code> for caveats.
      </p>

      {!bqConnected && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6,
          padding: 12, marginBottom: 16, fontSize: 13, color: '#92400e',
        }}>
          BigQuery not connected. Sign in via the main app first, then come back to this URL.
        </div>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        marginBottom: 16, maxWidth: 480,
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>From (UTC, inclusive)</span>
          <input
            type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            disabled={busy}
            style={{
              padding: '8px 10px', fontSize: 14, border: '1px solid #d1d5db',
              borderRadius: 6, fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>To (UTC, exclusive)</span>
          <input
            type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            disabled={busy}
            style={{
              padding: '8px 10px', fontSize: 14, border: '1px solid #d1d5db',
              borderRadius: 6, fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </label>
      </div>

      <button
        onClick={onGenerate}
        disabled={busy || !bqConnected}
        style={{
          padding: '10px 24px', background: busy || !bqConnected ? '#9ca3af' : '#059669',
          color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600,
          cursor: busy || !bqConnected ? 'not-allowed' : 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {busy ? 'Generating…' : 'Generate Excel'}
      </button>

      {status && (
        <div style={{ marginTop: 16, fontSize: 13, color: '#374151' }}>
          {status}
        </div>
      )}
      {error && (
        <div style={{
          marginTop: 16, padding: 12, fontSize: 13, color: '#991b1b',
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
        }}>
          {error}
        </div>
      )}

      <div style={{
        marginTop: 32, padding: 16, background: '#f9fafb',
        border: '1px solid #e5e7eb', borderRadius: 6,
        fontSize: 12, lineHeight: 1.55, color: '#4b5563',
      }}>
        <strong>Notes</strong>
        <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
          <li><code>RefNumber</code> is left blank (not synced to BigQuery).</li>
          <li><code>IsPartnerManaged</code> = <code>Account.Channel = 'Managed'</code> (the source flag <em>DeveloperChargedForAccount</em> lands in BQ only as the Channel category).</li>
          <li><code>Currency</code> derived from the QB company prefix in <code>AccountFullName</code> (<em>US-Sales</em> / <em>CAN-Sales</em>) — equivalent to the AR-account name on the original invoice.</li>
          <li><code>UncategorizedPortion</code> computed as the residual of <code>Amount</code> minus all classified buckets — surfaces non-zero if BQ encounters an unfamiliar GL account.</li>
          <li><code>CustomerGrouping</code> computed period-relative from the account dates, mirroring the API exactly.</li>
          <li>Classic vs New SaaS split is done at the line level by GL-account pattern, matching the API's classifier (one invoice can have both Classic and New lines).</li>
          <li>The <em>Marketing Metrics</em> tab is built by Excel formulas in the template — recomputes on file open.</li>
        </ul>
      </div>
    </div>
  );
}
