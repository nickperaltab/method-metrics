const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

export async function fetchMetrics() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/metrics?select=*&order=id`, { headers });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

export function groupMetrics(metrics) {
  return {
    primitives: metrics.filter(m => m.metric_type === 'primitive'),
    foundational: metrics.filter(m => m.metric_type === 'foundational'),
    derived: metrics.filter(m => m.metric_type === 'derived' && m.formula),
    dimensions: metrics.filter(m => m.metric_type === 'dimension'),
  };
}

export async function saveChart({ name, createdBy, metricIds, gwSpec }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/saved_charts`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      name,
      created_by: createdBy,
      metric_ids: metricIds,
      gw_spec: gwSpec,
    }),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  return res.json();
}

export async function loadCharts(userEmail) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saved_charts?created_by=eq.${encodeURIComponent(userEmail)}&order=created_at.desc`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load failed: ${res.status}`);
  return res.json();
}

export async function fetchDashboards() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboards?order=updated_at.desc`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load dashboards failed: ${res.status}`);
  return res.json();
}

export async function fetchDashboard(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboards?id=eq.${id}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load dashboard failed: ${res.status}`);
  const data = await res.json();
  return data[0] || null;
}

export async function createDashboard({ name, createdBy, layout }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dashboards`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ name, created_by: createdBy, layout: layout || [] }),
  });
  if (!res.ok) throw new Error(`Create dashboard failed: ${res.status}`);
  return res.json();
}

export async function updateDashboard(id, updates) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboards?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
    }
  );
  if (!res.ok) throw new Error(`Update dashboard failed: ${res.status}`);
  return res.json();
}

export async function invokeAiChart(body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chart`, {
    method: 'POST',
    headers: {
      ...headers,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI function failed: ${res.status}`);
  return res.json();
}
