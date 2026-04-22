export const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

// Shared headers. Mutated by setCurrentUserEmail() when UserContext resolves.
// RLS policies on `metrics` read the x-method-email header to decide admin access.
export const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

export function setCurrentUserEmail(email) {
  if (email) {
    headers['x-method-email'] = email;
  } else {
    delete headers['x-method-email'];
  }
}

// Fetch with 15s timeout to prevent indefinite hangs
async function fetchWithTimeout(url, opts = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('Request timed out. Please check your connection and try again.');
    throw e;
  }
}

export async function fetchUsers() {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/users?select=*&order=name`, { headers });
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  return res.json();
}

export async function fetchUserByEmail(email) {
  if (!email) return null;
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to lookup user (${res.status})`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function upsertUserByEmail(email, name) {
  if (!email) return null;
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/users?on_conflict=email`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ email, name: name || email.split('@')[0], role: 'viewer' }),
  });
  if (!res.ok) throw new Error(`Upsert user failed: ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function fetchMetrics() {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/metrics?select=*&order=id`, { headers });
  if (!res.ok) throw new Error(`Failed to load metrics (${res.status})`);
  return res.json();
}

export function groupMetrics(metrics) {
  return {
    primitives: metrics.filter(m => m.metric_type === 'primitive'),
    derived: metrics.filter(m => m.metric_type === 'derived'),
  };
}

export async function fetchApprovedDimensions(metricId) {
  const url = metricId
    ? `${SUPABASE_URL}/rest/v1/approved_dimensions?metric_id=eq.${metricId}&order=dimension_name`
    : `${SUPABASE_URL}/rest/v1/approved_dimensions?order=metric_id,dimension_name`;
  const res = await fetchWithTimeout(url, { headers });
  if (!res.ok) throw new Error(`Failed to load dimensions (${res.status})`);
  return res.json();
}

export async function fetchAllApprovedDimensions() {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/approved_dimensions?order=metric_id,dimension_name`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load dimensions (${res.status})`);
  return res.json();
}

export async function saveChart({ name, createdBy, createdByAvatar, createdByUser, metricIds, gwSpec }) {
  const body = {
    name,
    created_by: createdBy,
    metric_ids: metricIds,
    gw_spec: gwSpec,
  };
  if (createdByAvatar) body.created_by_avatar = createdByAvatar;
  if (createdByUser) body.created_by_user = createdByUser;
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/saved_charts`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  return res.json();
}

export async function updateChart(id, { gwSpec, updatedBy }) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/saved_charts?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ gw_spec: gwSpec, updated_by: updatedBy, updated_at: new Date().toISOString() }),
    }
  );
  if (!res.ok) throw new Error(`Update chart failed: ${res.status}`);
  return res.json();
}

export async function loadCharts(userEmail) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/saved_charts?created_by=eq.${encodeURIComponent(userEmail)}&order=created_at.desc`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load failed: ${res.status}`);
  return res.json();
}

export async function loadChart(id) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/saved_charts?id=eq.${id}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load chart failed: ${res.status}`);
  const data = await res.json();
  return data[0] || null;
}

export async function fetchDashboards() {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboards?order=updated_at.desc`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load dashboards failed: ${res.status}`);
  return res.json();
}

export async function fetchDashboard(id) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboards?id=eq.${id}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load dashboard failed: ${res.status}`);
  const data = await res.json();
  return data[0] || null;
}

export async function createDashboard({ name, createdBy, createdByUser, layout }) {
  const body = { name, created_by: createdBy, layout: layout || [] };
  if (createdByUser) body.created_by_user = createdByUser;
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/dashboards`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Create dashboard failed: ${res.status}`);
  return res.json();
}

/**
 * Duplicate a dashboard under the current user. Also clones each referenced
 * saved_chart so edits on the copy don't affect the original.
 */
export async function duplicateDashboard(dashboardId, currentUser) {
  const srcRes = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboards?id=eq.${dashboardId}`,
    { headers }
  );
  if (!srcRes.ok) throw new Error(`Load source dashboard failed: ${srcRes.status}`);
  const [src] = await srcRes.json();
  if (!src) throw new Error('Source dashboard not found');

  const srcLayout = Array.isArray(src.layout) ? src.layout : [];
  const chartIds = srcLayout.map(item => item.i).filter(Boolean);

  const chartsRes = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/saved_charts?id=in.(${chartIds.join(',')})`,
    { headers }
  );
  if (!chartsRes.ok) throw new Error(`Load charts failed: ${chartsRes.status}`);
  const srcCharts = await chartsRes.json();

  const chartIdMap = {};
  for (const c of srcCharts) {
    const newId = crypto.randomUUID();
    chartIdMap[c.id] = newId;
    const cloneBody = {
      id: newId,
      name: c.name,
      description: c.description || null,
      created_by: currentUser.email,
      created_by_user: currentUser.id,
      metric_ids: c.metric_ids,
      gw_spec: c.gw_spec,
      is_approved: false,
    };
    const r = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/saved_charts`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(cloneBody),
    });
    if (!r.ok) throw new Error(`Clone chart failed: ${r.status}`);
  }

  const newLayout = srcLayout.map(item => ({ ...item, i: chartIdMap[item.i] || item.i }));
  const dbBody = {
    name: `${src.name} (copy)`,
    created_by: currentUser.email,
    created_by_user: currentUser.id,
    layout: newLayout,
    is_approved: false,
  };
  const dbRes = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/dashboards`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(dbBody),
  });
  if (!dbRes.ok) throw new Error(`Create dashboard copy failed: ${dbRes.status}`);
  const [newDashboard] = await dbRes.json();
  return newDashboard;
}

/**
 * Generate a shareable URL for a dashboard. The ?view=shared query param
 * tells the page to render in view-only mode.
 */
export function dashboardShareUrl(dashboardId) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const basePath = typeof window !== 'undefined' ? window.location.pathname.replace(/\/$/, '') : '';
  return `${origin}${basePath}/#/dashboards/${dashboardId}?view=shared`;
}

export async function updateDashboard(id, updates) {
  const res = await fetchWithTimeout(
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

export async function saveConversation({ id, userEmail, title, messages, currentChartSpec }) {
  const body = {
    user_email: userEmail,
    title,
    messages,
    current_chart_spec: currentChartSpec,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/conversations?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Save conversation failed: ${res.status}`);
    return res.json();
  } else {
    body.id = crypto.randomUUID();
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Create conversation failed: ${res.status}`);
    return res.json();
  }
}

export async function loadConversations(userEmail) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/conversations?user_email=eq.${encodeURIComponent(userEmail)}&order=updated_at.desc&limit=20`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load conversations failed: ${res.status}`);
  return res.json();
}

export async function loadConversation(id) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/conversations?id=eq.${id}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load conversation failed: ${res.status}`);
  const data = await res.json();
  return data[0] || null;
}

export async function loadChartsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/saved_charts?id=in.(${ids.join(',')})`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load charts failed: ${res.status}`);
  return res.json();
}

// Dashboard stars
// Ownership-aware queries
export async function fetchDashboardsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboards?id=in.(${ids.join(',')})&order=name`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load dashboards by ids (${res.status})`);
  return res.json();
}

export async function fetchMyDashboards(userId) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboards?created_by_user=eq.${userId}&order=name`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load dashboards (${res.status})`);
  return res.json();
}

export async function fetchApprovedDashboardsList() {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboards?is_approved=eq.true&order=name`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load approved dashboards (${res.status})`);
  return res.json();
}

export async function fetchAllDashboards() {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboards?order=name`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load dashboards (${res.status})`);
  return res.json();
}

export async function fetchMyCharts(userId) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/saved_charts?created_by_user=eq.${userId}&order=updated_at.desc.nullsfirst,created_at.desc`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load charts (${res.status})`);
  return res.json();
}

export async function fetchApprovedCharts() {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/saved_charts?is_approved=eq.true&order=name`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load approved charts (${res.status})`);
  return res.json();
}

export async function fetchAllCharts() {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/saved_charts?select=*&order=updated_at.desc.nullsfirst,created_at.desc`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load charts (${res.status})`);
  return res.json();
}

export async function deleteChart(id) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/saved_charts?id=eq.${id}`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) throw new Error(`Delete chart failed: ${res.status}`);
}

export async function deleteDashboard(id) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboards?id=eq.${id}`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) throw new Error(`Delete dashboard failed: ${res.status}`);
}

export async function setApproved(table, id, approved) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ is_approved: approved }),
    }
  );
  if (!res.ok) throw new Error(`Set approved failed: ${res.status}`);
}

export function computeChartUsageCounts(dashboards) {
  const counts = {};
  for (const db of dashboards) {
    for (const item of (db.layout || [])) {
      const chartId = String(item.i);
      counts[chartId] = (counts[chartId] || 0) + 1;
    }
  }
  return counts;
}

export async function fetchStars(userId) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboard_stars?user_id=eq.${userId}&select=dashboard_id`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load stars (${res.status})`);
  const data = await res.json();
  return data.map(s => s.dashboard_id);
}

export async function starDashboard(dashboardId, userId) {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/dashboard_stars`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ dashboard_id: dashboardId, user_id: userId }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`Star failed: ${res.status}`);
}

export async function unstarDashboard(dashboardId, userId) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboard_stars?dashboard_id=eq.${dashboardId}&user_id=eq.${userId}`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) throw new Error(`Unstar failed: ${res.status}`);
}

// Dashboard folders
export async function fetchFolders(userId) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboard_folders?user_id=eq.${userId}&order=sort_order`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load folders (${res.status})`);
  return res.json();
}

export async function createFolder(name, userId) {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/dashboard_folders`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ name, user_id: userId }),
  });
  if (!res.ok) throw new Error(`Create folder failed: ${res.status}`);
  return res.json();
}

export async function deleteFolder(id) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboard_folders?id=eq.${id}`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) throw new Error(`Delete folder failed: ${res.status}`);
}

export async function moveDashboardToFolder(dashboardId, folderId) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboards?id=eq.${dashboardId}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ folder_id: folderId }),
    }
  );
  if (!res.ok) throw new Error(`Move failed: ${res.status}`);
}

// Dashboard views (recently viewed)
export async function recordDashboardView(dashboardId, userId) {
  await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/dashboard_views`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ dashboard_id: dashboardId, user_id: userId }),
  });
}

export async function recordView(dashboardId, userId) {
  if (!dashboardId || !userId) return;
  await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/dashboard_views`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ dashboard_id: dashboardId, user_id: userId }),
  }).catch(() => {}); // fire-and-forget, never block the page
}

export async function fetchRecentViews(userId, limit = 10) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/dashboard_views?user_id=eq.${userId}&order=viewed_at.desc&limit=${limit}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to load recent views (${res.status})`);
  return res.json();
}

export async function invokeAiChart(body) {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/ai-chart`, {
    method: 'POST',
    headers: {
      ...headers,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  }, 30000); // 30s timeout for AI generation
  if (!res.ok) throw new Error(`AI function failed: ${res.status}`);
  return res.json();
}

export async function saveFeedback({ userEmail, source, messageIndex, chartId, sentiment, notes, chartSpec }) {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/feedback`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_email: userEmail || 'anonymous',
      source,
      message_index: messageIndex || null,
      chart_id: chartId || null,
      sentiment,
      notes: notes || null,
      chart_spec: chartSpec || null,
    }),
  });
  if (!res.ok) throw new Error(`Save feedback failed: ${res.status}`);
}

export async function fetchAllConversations(limit = 200) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/conversations?order=updated_at.desc&limit=${limit}`,
    { headers }
  );
  if (!res.ok) throw new Error(`fetchAllConversations failed: ${res.status}`);
  return res.json();
}

export async function fetchAllFeedback(limit = 200) {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/feedback?order=created_at.desc&limit=${limit}`,
    { headers }
  );
  if (!res.ok) throw new Error(`fetchAllFeedback failed: ${res.status}`);
  return res.json();
}
