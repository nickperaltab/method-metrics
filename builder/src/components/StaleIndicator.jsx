import React from 'react';

function formatAge(refreshedAt) {
  if (!refreshedAt) return '';
  const ageHours = Math.round((Date.now() - new Date(refreshedAt).getTime()) / 3600000);
  if (ageHours < 1) return 'just now';
  if (ageHours < 2) return '1 hour ago';
  return `${ageHours} hours ago`;
}

export default function StaleIndicator({ freshness, refreshedAt }) {
  if (freshness !== 'stale') return null;
  return (
    <div
      role="status"
      style={{
        fontSize: 12,
        color: '#92400e',
        background: '#fef3c7',
        border: '1px solid #fde68a',
        borderRadius: 6,
        padding: '6px 12px',
        marginBottom: 16,
        display: 'inline-block',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      Data refreshed {formatAge(refreshedAt)} — may be slightly stale
    </div>
  );
}
