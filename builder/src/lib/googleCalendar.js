// Google Calendar read layer for the call-prep week strip.
//
// Read-only, and only ever the signed-in user's own primary calendar. Reading a
// teammate's calendar would need their address plus a sharing grant we don't
// have, so /call-prep/:consultant hides the strip when you're looking at
// someone else's book.
//
// Why this exists at all: call_prep.snapshots knows WHICH accounts you're
// talking to on a given day but not WHEN — call_prep.brief_content was the only
// source of clock times and stopped being written on 2026-07-16. The calendar
// supplies the times, the snapshots supply the prep.

import { getBqToken } from './bigquery.js';
import { localIsoDate } from './psOverview.js';
import { MOCK_MODE } from '../dev/mockMode.js';
import { mockCalendarEvents, mockCalendarList } from '../dev/mockCalendar.js';

// Re-exported so calendar consumers don't reach into the PS overview layer for
// a date helper. One implementation, two entry points.
export { localIsoDate };

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const eventsUrl = (calendarId) =>
  `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
const CALENDAR_LIST_URL = `${CALENDAR_BASE}/users/me/calendarList`;

/** Thrown when the stored token predates the calendar scope, or consent was declined. */
export class CalendarScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalendarScopeError';
  }
}

/** Thrown when the calendar exists but this user can't read it. */
export class CalendarAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalendarAccessError';
  }
}

/** Monday of the week containing `date`, as a Date at local midnight. */
export function startOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** The `days` consecutive dates starting at `start`, as YYYY-MM-DD. */
export function weekDays(start, days = 5) {
  return Array.from({ length: days }, (_, i) => localIsoDate(addDays(start, i)));
}

/**
 * A calendar event flattened to what the strip renders. All-day events carry a
 * `date` instead of a `dateTime`; both normalize to a local YYYY-MM-DD day so
 * grouping by column never has to care which it was.
 */
export function normalizeEvent(raw) {
  const startRaw = raw?.start?.dateTime || raw?.start?.date || null;
  const allDay = !raw?.start?.dateTime;
  const startDate = startRaw ? new Date(startRaw) : null;
  return {
    id: raw?.id ?? null,
    title: raw?.summary ?? '(no title)',
    day: allDay ? String(startRaw).slice(0, 10) : localIsoDate(startDate),
    startsAt: allDay ? null : startDate,
    allDay,
    attendees: (raw?.attendees ?? [])
      .map((a) => String(a?.email ?? '').toLowerCase())
      .filter(Boolean),
    htmlLink: raw?.htmlLink ?? null,
    declined: (raw?.attendees ?? []).some((a) => a?.self && a?.responseStatus === 'declined'),
  };
}

/** "9:00 AM", or "All day". */
export function formatEventTime(event) {
  if (!event.startsAt) return 'All day';
  return event.startsAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * GET a Calendar API URL, mapping the failure modes onto distinct errors.
 *
 * `ownAccess` says whether the resource is inherently the signed-in user's (their
 * own calendar, their own subscription list) or someone else's calendar. It only
 * decides the fallback when Google's message is unrecognizable: on your own
 * resource an ambiguous 403 is almost always the token missing the scope, and on
 * a teammate's calendar it's almost always sharing.
 */
async function calendarGet(url, fetchImpl, { ownAccess = true } = {}) {
  const token = getBqToken();
  if (!token) throw new CalendarScopeError('Not connected to Google');

  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return res.json();

  // A 403 is three different problems wearing one status code, and only one of
  // them is fixed by re-consenting:
  //   - missing scope                → CalendarScopeError, show the Connect button
  //   - API off in the Cloud console → plain Error; clicking Connect loops forever
  //   - can't read that calendar     → CalendarAccessError, sharing fixes it, not us
  const detail = await res.json().catch(() => null);
  const message = detail?.error?.message || `Calendar request failed (${res.status})`;
  if (res.status === 404) throw new CalendarAccessError(message);
  if (res.status === 401 || res.status === 403) {
    if (/has not been used in project|accessNotConfigured|API has not been/i.test(message)) {
      throw new Error(message);
    }
    if (/scope|insufficient authentication|credential/i.test(message)) {
      throw new CalendarScopeError('Calendar access not granted');
    }
    throw ownAccess ? new CalendarScopeError('Calendar access not granted') : new CalendarAccessError(message);
  }
  throw new Error(message);
}

/**
 * Events between two local dates, inclusive of `fromIso`, inclusive of `toIso`.
 * Singles and recurring instances both come back expanded. `calendarId` defaults
 * to the signed-in user's own calendar; pass a teammate's address to read theirs,
 * which works only where they've shared it and you're subscribed.
 */
export async function fetchCalendarEvents(
  fromIso,
  toIso,
  { fetchImpl = fetch, calendarId = 'primary' } = {}
) {
  if (MOCK_MODE) return mockCalendarEvents(fromIso, toIso, calendarId).map(normalizeEvent);

  const timeMin = new Date(`${fromIso}T00:00:00`).toISOString();
  const timeMax = new Date(`${toIso}T23:59:59`).toISOString();
  const url = `${eventsUrl(calendarId)}?${new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })}`;

  const body = await calendarGet(url, fetchImpl, { ownAccess: calendarId === 'primary' });
  return (body.items ?? []).map(normalizeEvent);
}

/**
 * The calendars this user is subscribed to and can at least read. This is what
 * makes a teammate's book viewable: we never guess an address, we only offer
 * what Google already says is visible.
 */
export async function fetchCalendarList({ fetchImpl = fetch } = {}) {
  if (MOCK_MODE) return mockCalendarList();

  const url = `${CALENDAR_LIST_URL}?${new URLSearchParams({
    minAccessRole: 'reader',
    showHidden: 'true',
    maxResults: '250',
  })}`;
  const body = await calendarGet(url, fetchImpl);
  return (body.items ?? []).map((c) => ({
    id: c.id,
    summary: c.summary ?? '',
    primary: Boolean(c.primary),
  }));
}

/**
 * Find the calendar belonging to a consultant named like `consultant`.
 *
 * The snapshots feed writes both "Sherry Zarei" and "S. Zarei", and a Google
 * calendar is titled either with a display name or just an address, so this
 * matches on first-initial + last name across both the title and the address —
 * the same fuzziness consultantPatternFromEmail applies in the other direction.
 */
export function matchCalendarForConsultant(consultant, calendars) {
  const words = normalizeText(consultant).split(' ').filter(Boolean);
  if (words.length < 2) return null;
  const initial = words[0][0];
  const last = words[words.length - 1];
  if (!initial || last.length < 2) return null;

  const nameMatches = (value) => {
    const parts = normalizeText(value).split(' ').filter(Boolean);
    if (parts.length < 2) return false;
    return parts[0][0] === initial && parts[parts.length - 1] === last;
  };

  for (const cal of calendars) {
    if (cal.primary) continue;
    const local = String(cal.id || '').split('@')[0];
    if (nameMatches(cal.summary) || nameMatches(local)) return cal;
  }
  return null;
}

// ── Event → account matching ────────────────────────────────────────────────
// There is no calendar id on an account and no domain column on int_accounts
// (checked 2026-08-10), so matching is a heuristic over the event title and the
// attendee list. It is tuned to under-match rather than over-match: a wrong
// account on a prep button is worse than an event the rep has to place himself.

// Words that carry no identifying signal, so they can't be the thing that
// matches an event to an account.
const STOPWORDS = new Set([
  'inc', 'llc', 'ltd', 'limited', 'co', 'company', 'corp', 'corporation', 'the',
  'and', 'of', 'group', 'holdings', 'holding', 'services', 'service', 'solutions',
  'systems', 'enterprises', 'industries', 'international', 'partners', 'associates',
  'products', 'supply', 'supplies', 'distribution', 'distributing', 'call', 'method',
]);

// Mailbox providers and our own domain — an attendee at one of these says
// nothing about which account the meeting is with.
const GENERIC_DOMAINS = new Set([
  'gmail', 'googlemail', 'outlook', 'hotmail', 'live', 'yahoo', 'aol', 'icloud',
  'me', 'msn', 'comcast', 'method', 'protonmail', 'zoom',
]);

const MIN_TOKEN = 5;

function normalizeText(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The distinctive words in an account name, longest first. */
export function accountTokens(name) {
  return normalizeText(name)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .sort((a, b) => b.length - a.length);
}

/** "sarah@acme-dist.co.uk" → "acme dist". Generic providers return null. */
function domainLabel(email) {
  const host = String(email).split('@')[1];
  if (!host) return null;
  const label = host.split('.')[0];
  if (!label || GENERIC_DOMAINS.has(label)) return null;
  return normalizeText(label);
}

/**
 * Best account for one event, or null. Returns the matched account plus how it
 * was matched, so the UI can be more careful about a domain-only guess.
 */
export function matchEvent(event, accounts) {
  const title = normalizeText(event.title);
  if (!title) return null;

  let best = null;
  const consider = (account, via, weight) => {
    if (!best || weight > best.weight) best = { account, via, weight };
  };

  for (const account of accounts) {
    const full = normalizeText(account.accountName);
    if (!full) continue;

    // Whole account name in the title — the only unambiguous signal.
    if (full.length >= 3 && title.includes(full)) {
      consider(account, 'title', 1000 + full.length);
      continue;
    }

    const tokens = accountTokens(account.accountName);
    const titleWords = new Set(title.split(' '));
    const hit = tokens.find((t) => t.length >= MIN_TOKEN && titleWords.has(t));
    if (hit) {
      consider(account, 'title', 500 + hit.length);
      continue;
    }

    // Attendee domain against the account's distinctive words. Containment in
    // either direction catches "Acme Distributing" ↔ acmedist.com.
    for (const email of event.attendees) {
      const label = domainLabel(email);
      if (!label) continue;
      const domainHit = tokens.find(
        (t) => t.length >= MIN_TOKEN && (label.includes(t) || t.includes(label))
      );
      if (domainHit) {
        consider(account, 'attendee', 100 + domainHit.length);
        break;
      }
    }
  }
  return best ? { account: best.account, via: best.via } : null;
}

/**
 * Attach `match` to every event. Callers decide what to do with the unmatched
 * ones — the strip hides them behind a count rather than dropping them silently,
 * because the heuristic above is the most likely thing here to be wrong.
 */
export function matchEvents(events, accounts) {
  return events.map((event) => ({ ...event, match: matchEvent(event, accounts) }));
}
