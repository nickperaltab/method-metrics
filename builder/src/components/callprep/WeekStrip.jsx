// The week strip at the top of /call-prep/:consultant — the signed-in rep's own
// Google Calendar, one column per day, read-only.
//
// The whole day is shown, not just the calls: an account-matched event gets the
// account name and a Prep button, everything else still renders so the strip
// reads as your actual day. "Account calls only" filters down to the matched
// ones. Matching is the title/attendee heuristic in lib/googleCalendar.js, so
// showing everything by default also means a mis-match never hides a meeting.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { connectCalendar } from '../../lib/bigquery';
import { computeFlags } from '../../lib/callPrep';
import {
  CalendarAccessError,
  CalendarScopeError,
  addDays,
  fetchCalendarEvents,
  fetchCalendarList,
  formatEventTime,
  localIsoDate,
  matchCalendarForConsultant,
  matchEvents,
  startOfWeek,
  weekDays,
} from '../../lib/googleCalendar';

// Mon–Fri always get a column. Saturday and Sunday only earn one when something
// is actually scheduled, so a normal week doesn't waste 28% of the width.
const WEEKDAY_COLUMNS = 5;
const FULL_WEEK = 7;

const s = {
  panel: { border: '1px solid #e2e5e9', borderRadius: 8, background: '#fff', padding: 16, marginBottom: 28 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 },
  range: { fontSize: 13, fontWeight: 600, color: '#1a1a1a' },
  nav: { display: 'flex', gap: 6 },
  navBtn: {
    padding: '4px 10px', fontSize: 12, fontFamily: "'DM Sans', sans-serif",
    color: '#374151', background: '#fff', border: '1px solid #e2e5e9',
    borderRadius: 6, cursor: 'pointer',
  },
  navBtnOn: { color: '#fff', background: '#047857', borderColor: '#047857', fontWeight: 600 },

  grid: { display: 'grid', gap: 8 },
  col: { minWidth: 0 },
  colHead: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b7280',
    paddingBottom: 6, borderBottom: '1px solid #e2e5e9', marginBottom: 8,
  },
  colHeadToday: { color: '#047857' },

  event: { border: '1px solid #e2e5e9', borderRadius: 6, padding: '8px 10px', marginBottom: 6, background: '#fff' },
  eventUnmatched: { background: '#f8f9fa' },
  time: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280', marginBottom: 2 },
  eventTitle: { fontSize: 13, color: '#1a1a1a', lineHeight: 1.3, overflowWrap: 'anywhere' },
  account: { fontSize: 12, color: '#6b7280', marginTop: 2, overflowWrap: 'anywhere' },
  declined: { fontSize: 11, color: '#6b7280', fontStyle: 'italic' },
  prep: {
    display: 'inline-block', marginTop: 6, padding: '3px 10px', fontSize: 12,
    fontWeight: 600, color: '#fff', background: '#047857', borderRadius: 4,
    textDecoration: 'none',
  },
  // A call with no brief written for that day. Muted rather than green so the
  // eye lands on the prepped calls first, and paired with the chip below —
  // never colour alone.
  prepMissing: {
    display: 'inline-block', marginTop: 6, padding: '3px 10px', fontSize: 12,
    fontWeight: 600, color: '#374151', background: '#fff',
    border: '1px solid #e2e5e9', borderRadius: 4, textDecoration: 'none',
  },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  chipWarn: {
    fontSize: 10.5, fontWeight: 600, color: '#b45309', background: '#fffbeb',
    border: '1px solid #fde68a', borderRadius: 3, padding: '1px 6px',
  },
  chipMuted: {
    fontSize: 10.5, fontWeight: 600, color: '#6b7280', background: '#f8f9fa',
    border: '1px solid #e2e5e9', borderRadius: 3, padding: '1px 6px',
  },
  guess: { fontSize: 11, color: '#6b7280', marginTop: 4 },
  empty: { fontSize: 12, color: '#6b7280', padding: '6px 0' },

  footer: { marginTop: 12, fontSize: 12, color: '#6b7280' },

  connect: { textAlign: 'center', padding: '20px 0' },
  connectText: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  connectBtn: {
    padding: '8px 18px', fontSize: 14, fontWeight: 600, color: '#fff',
    background: '#047857', border: 'none', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  note: { fontSize: 13, color: '#6b7280', padding: '8px 0' },
  error: { fontSize: 13, color: '#b91c1c', padding: '8px 0' },
};

const monthDay = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
const dayName = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString([], { weekday: 'short' });
/** "Monday, August 10" — the accessible name for a day column. */
const fullDay = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

const MAX_CHIPS = 2;

export default function WeekStrip({ accounts, consultant, ownBook, preps }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [callsOnly, setCallsOnly] = useState(false);
  // null = still resolving, false = no subscribed calendar for this consultant.
  const [calendar, setCalendar] = useState(ownBook ? { id: 'primary', primary: true } : null);
  const [resolved, setResolved] = useState(ownBook);

  // Someone else's book: only their calendar counts, and only if this user is
  // already subscribed to it. We never guess an address.
  useEffect(() => {
    if (ownBook) {
      setCalendar({ id: 'primary', primary: true });
      setResolved(true);
      return undefined;
    }
    let cancelled = false;
    setResolved(false);
    setCalendar(null);
    fetchCalendarList()
      .then((list) => {
        if (cancelled) return;
        setCalendar(matchCalendarForConsultant(consultant, list));
        setResolved(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e);
        setResolved(true);
      });
    return () => { cancelled = true; };
  }, [consultant, ownBook]);

  // Always fetch the whole week; which columns get rendered is decided below,
  // after we know where the events actually landed.
  const allDays = weekDays(weekStart, FULL_WEEK);
  const from = allDays[0];
  const to = allDays[allDays.length - 1];

  const load = useCallback(() => {
    if (!calendar) return undefined;
    let cancelled = false;
    setEvents(null);
    setError(null);
    fetchCalendarEvents(from, to, { calendarId: calendar.id })
      .then((list) => { if (!cancelled) setEvents(list); })
      .catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, [from, to, calendar]);

  useEffect(() => load(), [load]);

  const connect = () => connectCalendar(() => load());

  // "Was a brief written for this account on this day?" — the prep history is
  // already loaded by the page, so answering it costs a Set rather than a query.
  const prepDays = useMemo(
    () => new Set((preps ?? []).map((p) => `${p.accountRecordId}|${p.snapshotDate}`)),
    [preps]
  );
  // Latest-snapshot flags per account, so a failing sync is visible on the
  // calendar card instead of one click into the brief.
  const flagsByAccount = useMemo(() => {
    const today = localIsoDate();
    return new Map((accounts ?? []).map((a) => [a.accountRecordId, computeFlags(a, today)]));
  }, [accounts]);

  if (error instanceof CalendarScopeError) {
    return (
      <div style={s.panel}>
        <div style={s.connect}>
          <p style={s.connectText}>Connect your Google Calendar to see this week’s calls.</p>
          <button type="button" style={s.connectBtn} onClick={connect}>Connect calendar</button>
        </div>
      </div>
    );
  }

  if (!resolved) {
    return <div style={s.panel}><div style={s.note}>Looking for {consultant}’s calendar…</div></div>;
  }
  if (!calendar) {
    return (
      <div style={s.panel}>
        <div style={s.note}>
          You’re not subscribed to {consultant}’s calendar. Add it in Google Calendar to see their week here.
        </div>
      </div>
    );
  }

  const matched = events ? matchEvents(events, accounts) : [];
  const callCount = matched.filter((e) => e.match).length;
  const visible = callsOnly ? matched.filter((e) => e.match) : matched;
  const todayIso = localIsoDate();

  // Weekend columns are driven by the full event set, not the filtered one, so
  // toggling "Account calls only" can't make a column appear and disappear.
  const days = allDays.filter(
    (iso, i) => i < WEEKDAY_COLUMNS || matched.some((e) => e.day === iso)
  );

  return (
    <div style={s.panel}>
      <div style={s.head}>
        <span style={s.range}>
          {monthDay(days[0])} – {monthDay(days[days.length - 1])}
          {!calendar.primary && calendar.summary ? ` · ${calendar.summary}` : ''}
        </span>
        <div style={s.nav}>
          <button
            type="button"
            aria-pressed={callsOnly}
            style={{ ...s.navBtn, ...(callsOnly ? s.navBtnOn : null) }}
            onClick={() => setCallsOnly((v) => !v)}
          >
            Account calls only
          </button>
          <button type="button" style={s.navBtn} onClick={() => setWeekStart(addDays(weekStart, -7))}>
            Previous
          </button>
          <button type="button" style={s.navBtn} onClick={() => setWeekStart(startOfWeek())}>
            This week
          </button>
          <button type="button" style={s.navBtn} onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Next
          </button>
        </div>
      </div>

      {error instanceof CalendarAccessError
        ? <div style={s.error}>You don’t have read access to {consultant}’s calendar.</div>
        : error && <div style={s.error}>Couldn’t load the calendar: {error.message}</div>}
      {!events && !error && <div style={s.note}>Loading the calendar…</div>}

      {events && !matched.length && (
        <div style={s.note}>Nothing on the calendar this week.</div>
      )}

      {events && matched.length > 0 && (
        <>
          <div style={{ ...s.grid, gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((iso) => {
              const dayEvents = visible.filter((e) => e.day === iso);
              const isToday = iso === todayIso;
              return (
                // role="group" rather than a heading: it puts the day's name in
                // the accessibility tree without inventing a heading level that
                // would break the page's hierarchy.
                <div key={iso} style={s.col} role="group" aria-label={fullDay(iso)}>
                  <div style={{ ...s.colHead, ...(isToday ? s.colHeadToday : null) }}>
                    {dayName(iso)} {monthDay(iso)}{isToday ? ' · today' : ''}
                  </div>
                  {!dayEvents.length && <div style={s.empty}>No events</div>}
                  {dayEvents.map((event) => {
                    const account = event.match?.account;
                    // A prep is only "missing" for a call that hasn't happened.
                    // On a past day it's history, not something to act on.
                    const prepped = account
                      && prepDays.has(`${account.accountRecordId}|${event.day}`);
                    const missingPrep = Boolean(account) && !prepped && event.day >= todayIso;
                    const flags = account ? (flagsByAccount.get(account.accountRecordId) ?? []) : [];
                    const overflow = flags.length - MAX_CHIPS;
                    return (
                      <div
                        key={event.id}
                        style={{ ...s.event, ...(event.match ? null : s.eventUnmatched) }}
                      >
                        <div style={s.time}>{formatEventTime(event)}</div>
                        <div style={s.eventTitle}>{event.title}</div>
                        {event.declined && <div style={s.declined}>You declined</div>}
                        {account && (
                          <>
                            <div style={s.account}>{account.accountName}</div>
                            {flags.length > 0 && (
                              <div style={s.chipRow}>
                                {flags.slice(0, MAX_CHIPS).map((f) => (
                                  <span key={f} style={s.chipWarn}>{f}</span>
                                ))}
                                {overflow > 0 && <span style={s.chipMuted}>+{overflow}</span>}
                              </div>
                            )}
                            <Link
                              style={missingPrep ? s.prepMissing : s.prep}
                              to={`/call-prep/account/${encodeURIComponent(account.accountRecordId)}`}
                            >
                              {missingPrep ? 'Open' : 'Prep'}
                            </Link>
                            {missingPrep && <div style={s.chipRow}><span style={s.chipWarn}>no prep</span></div>}
                            {event.match.via === 'attendee' && (
                              <div style={s.guess}>Best guess</div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div style={s.footer}>
            {callsOnly
              ? `${visible.length} of ${matched.length} events · linked to an account`
              : `${matched.length} events · ${callCount} linked to an account`}
          </div>
        </>
      )}
    </div>
  );
}
