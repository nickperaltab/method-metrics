import React from 'react';

export default function ApprovedDashboards() {
  return (
    <div style={{ padding: 48, maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#edf0f3', marginBottom: 8 }}>
        Approved Dashboards
      </h1>
      <p style={{ color: '#5a6370', fontSize: 14, lineHeight: 1.6 }}>
        Admin-curated dashboards that are approved for team-wide use.
        These dashboards use only verified metrics and dimensions.
      </p>
    </div>
  );
}
