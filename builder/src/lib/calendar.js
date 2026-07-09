// PS Hub's own Google Calendar connection — separate from the main BQ OAuth
// gate in lib/bigquery.js so Nic/Justin (who never touch PS Hub) are never
// prompted for calendar access just to open the metrics dashboard.
const CALENDAR_CLIENT_ID = '546732685010-nojjfak7esmun2taour8r5pakrsrg3aq.apps.googleusercontent.com';
const TOKEN_KEY = 'ps_hub_calendar_token';

let calToken = localStorage.getItem(TOKEN_KEY);

export function getCalendarToken() {
  return calToken;
}

export async function initCalendarAuth(onSuccess, onFail) {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (!stored) { onFail?.(); return; }
  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1',
      { headers: { Authorization: `Bearer ${stored}` } },
    );
    if (res.ok) {
      calToken = stored;
      onSuccess?.(stored);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      calToken = null;
      onFail?.();
    }
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    calToken = null;
    onFail?.();
  }
}

export function connectCalendar(onSuccess) {
  if (!window.google?.accounts?.oauth2) return;
  google.accounts.oauth2.initTokenClient({
    client_id: CALENDAR_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    prompt: '',
    callback: (r) => {
      if (r.access_token) {
        calToken = r.access_token;
        localStorage.setItem(TOKEN_KEY, calToken);
        onSuccess?.(calToken);
      }
    },
  }).requestAccessToken();
}

export function disconnectCalendar() {
  calToken = null;
  localStorage.removeItem(TOKEN_KEY);
}

// Fetch today's events (local calendar day) from the signed-in user's
// primary calendar.
export async function fetchTodayEvents(token) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Failed to load calendar (${res.status})`);
  const data = await res.json();
  return (data.items || []).map((e) => ({
    id: e.id,
    title: e.summary || '(no title)',
    start: e.start?.dateTime || e.start?.date || null,
    allDay: !e.start?.dateTime,
    htmlLink: e.htmlLink,
  }));
}

// PS call events follow "Method Consulting Booked: {Account}" (PPU) and
// "Method Free Hour Booked: {Account}" (Free Hour) naming, same convention
// used by the call-prep/team-call-prep routines. Fall back to a loose
// substring match against known account names for anything else on the
// calendar (internal syncs, etc. simply won't match).
const CALL_PREFIXES = [/^Method Consulting Booked:\s*/i, /^Method Free Hour Booked:\s*/i];

export function matchEventToAccount(event, accounts) {
  let name = event.title;
  for (const re of CALL_PREFIXES) {
    if (re.test(name)) { name = name.replace(re, '').trim(); break; }
  }
  const lower = name.toLowerCase();
  return accounts.find((a) => {
    const accLower = (a.name || '').toLowerCase();
    return accLower && (lower.includes(accLower) || accLower.includes(lower));
  }) || null;
}
