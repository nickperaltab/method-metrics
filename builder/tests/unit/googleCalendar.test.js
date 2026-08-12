import { describe, it, expect, beforeEach } from 'vitest';
import { _setBqToken } from '../../src/lib/bigquery.js';
import {
  accountTokens,
  addDays,
  fetchCalendarEvents,
  formatEventTime,
  matchEvent,
  matchEvents,
  normalizeEvent,
  startOfWeek,
  weekDays,
} from '../../src/lib/googleCalendar.js';
import {
  CalendarAccessError,
  CalendarScopeError,
  fetchCalendarList,
  matchCalendarForConsultant,
} from '../../src/lib/googleCalendar.js';
import {
  buildPrepHistorySql, PREP_HISTORY_LIMIT, CALL_PREP_TABLE, fetchPrepHistory,
  humanizeHook, pitchableMotions,
} from '../../src/lib/callPrep.js';

const account = (id, name) => ({ accountRecordId: id, accountName: name });

const ACCOUNTS = [
  account(1, 'Northwind Traders'),
  account(2, 'Harborview Dental Group'),
  account(3, 'Cedarline Millwork'),
  account(4, 'Pike & Powell Supply'),
];

const event = (over = {}) => ({ title: '', attendees: [], ...over });

describe('normalizeEvent', () => {
  it('buckets a timed event into its local day', () => {
    const e = normalizeEvent({
      id: 'a',
      summary: 'Northwind call',
      start: { dateTime: '2026-08-10T09:30:00' },
      attendees: [{ email: 'Dana@Northwind.com' }],
    });
    expect(e.day).toBe('2026-08-10');
    expect(e.allDay).toBe(false);
    expect(e.attendees).toEqual(['dana@northwind.com']);
  });

  it('treats a date-only event as all day without shifting the day', () => {
    const e = normalizeEvent({ id: 'b', summary: 'PTO', start: { date: '2026-08-11' } });
    expect(e.allDay).toBe(true);
    expect(e.day).toBe('2026-08-11');
    expect(formatEventTime(e)).toBe('All day');
  });

  it('flags an event the signed-in user declined', () => {
    const e = normalizeEvent({
      id: 'c',
      summary: 'Standup',
      start: { dateTime: '2026-08-10T09:00:00' },
      attendees: [
        { email: 'me@method.me', self: true, responseStatus: 'declined' },
        { email: 'other@method.me', responseStatus: 'accepted' },
      ],
    });
    expect(e.declined).toBe(true);
  });

  it('survives an event with no title or attendees', () => {
    const e = normalizeEvent({ id: 'd', start: { dateTime: '2026-08-10T09:00:00' } });
    expect(e.title).toBe('(no title)');
    expect(e.attendees).toEqual([]);
  });
});

describe('weekDays / startOfWeek', () => {
  it('starts the week on Monday regardless of which day is passed', () => {
    // 2026-08-13 is a Thursday; 2026-08-16 the Sunday after.
    expect(weekDays(startOfWeek(new Date(2026, 7, 13)), 5))
      .toEqual(['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']);
    expect(weekDays(startOfWeek(new Date(2026, 7, 16)), 5)[0]).toBe('2026-08-10');
  });

  it('steps whole weeks without drifting across a DST boundary', () => {
    // 2026-11-01 is the US DST fallback; adding 7 days must stay on Monday.
    const monday = startOfWeek(new Date(2026, 9, 26));
    expect(addDays(monday, 7).getDay()).toBe(1);
  });
});

describe('accountTokens', () => {
  it('drops filler words and keeps distinctive ones, longest first', () => {
    expect(accountTokens('Pike & Powell Supply Inc')).toEqual(['powell', 'pike']);
    expect(accountTokens('Bright Harbor Logistics')).toEqual(['logistics', 'bright', 'harbor']);
  });

  it('returns nothing for a name that is all filler', () => {
    expect(accountTokens('The Company LLC')).toEqual([]);
  });
});

describe('matchEvent', () => {
  it('matches the full account name in a title', () => {
    const m = matchEvent(event({ title: 'Northwind Traders — PPU session' }), ACCOUNTS);
    expect(m.account.accountRecordId).toBe(1);
    expect(m.via).toBe('title');
  });

  it('matches on one distinctive word when the full name is absent', () => {
    const m = matchEvent(event({ title: 'Harborview check-in' }), ACCOUNTS);
    expect(m.account.accountRecordId).toBe(2);
    expect(m.via).toBe('title');
  });

  it('falls back to the attendee domain when the title says nothing', () => {
    const m = matchEvent(
      event({ title: 'Quarterly workflow review', attendees: ['ap@cedarlinemillwork.com'] }),
      ACCOUNTS
    );
    expect(m.account.accountRecordId).toBe(3);
    expect(m.via).toBe('attendee');
  });

  it('prefers a title match over an attendee match', () => {
    const m = matchEvent(
      event({ title: 'Northwind Traders sync', attendees: ['ap@cedarlinemillwork.com'] }),
      ACCOUNTS
    );
    expect(m.account.accountRecordId).toBe(1);
    expect(m.via).toBe('title');
  });

  it('ignores mailbox providers and our own domain', () => {
    expect(matchEvent(event({ title: '1:1', attendees: ['someone@gmail.com'] }), ACCOUNTS)).toBeNull();
    expect(matchEvent(event({ title: 'PS standup', attendees: ['team@method.me'] }), ACCOUNTS)).toBeNull();
  });

  it('does not match on a short or filler word', () => {
    // "Supply" is a stopword and "Pike" is under the 5-char domain/title bar,
    // so a generic supply meeting must not land on Pike & Powell.
    expect(matchEvent(event({ title: 'Supply chain sync' }), ACCOUNTS)).toBeNull();
  });

  it('returns null for an untitled event with no attendees', () => {
    expect(matchEvent(event({ title: '' }), ACCOUNTS)).toBeNull();
  });

  it('returns null when the book is empty', () => {
    expect(matchEvent(event({ title: 'Northwind Traders' }), [])).toBeNull();
  });
});

describe('matchEvents', () => {
  it('attaches a match to every event, null where none was found', () => {
    const out = matchEvents(
      [event({ title: 'Northwind Traders' }), event({ title: 'Dentist' })],
      ACCOUNTS
    );
    expect(out[0].match.account.accountRecordId).toBe(1);
    expect(out[1].match).toBeNull();
    expect(out).toHaveLength(2);
  });
});

describe('fetchCalendarEvents', () => {
  const ok = (items) => async () => ({ ok: true, status: 200, json: async () => ({ items }) });

  beforeEach(() => _setBqToken('test-token'));

  it('raises CalendarScopeError before any request when there is no token', async () => {
    _setBqToken(null);
    let called = false;
    const fetchImpl = async () => { called = true; return ok([])(); };
    await expect(fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl }))
      .rejects.toBeInstanceOf(CalendarScopeError);
    expect(called).toBe(false);
  });

  it('requests an expanded, time-ordered window and normalizes the result', async () => {
    let seen = null;
    const fetchImpl = async (url) => {
      seen = url;
      return { ok: true, status: 200, json: async () => ({ items: [{ id: 'x', summary: 'Call', start: { dateTime: '2026-08-10T09:00:00' } }] }) };
    };
    const events = await fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl });
    expect(seen).toContain('singleEvents=true');
    expect(seen).toContain('orderBy=startTime');
    expect(events[0].day).toBe('2026-08-10');
  });

  it('raises CalendarScopeError on 403 so the UI can offer re-consent', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
    await expect(fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl }))
      .rejects.toBeInstanceOf(CalendarScopeError);
  });

  it('does not offer re-consent when the Calendar API is disabled on the project', async () => {
    // Same 403, different cause — clicking Connect can never fix this one.
    const fetchImpl = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Google Calendar API has not been used in project 546732685010 before or it is disabled.' } }),
    });
    const err = await fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl }).catch((e) => e);
    expect(err).not.toBeInstanceOf(CalendarScopeError);
    expect(err.message).toContain('has not been used in project');
  });

  it('raises a plain error on other failures', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const err = await fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl }).catch((e) => e);
    expect(err).not.toBeInstanceOf(CalendarScopeError);
    expect(err.message).toContain('500');
  });

  it('returns an empty list when the calendar has no events', async () => {
    expect(await fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl: ok([]) })).toEqual([]);
  });
});

describe('matchCalendarForConsultant', () => {
  const CALENDARS = [
    { id: 'b.saltzman@method.me', summary: 'Brandon Saltzman', primary: true },
    { id: 's.zarei@method.me', summary: 'Sherry Zarei', primary: false },
    { id: 'ps-team@method.me', summary: 'PS Team Events', primary: false },
  ];

  it('matches a full name against the calendar title', () => {
    expect(matchCalendarForConsultant('Sherry Zarei', CALENDARS).id).toBe('s.zarei@method.me');
  });

  it('matches the abbreviated convention the snapshots feed also writes', () => {
    expect(matchCalendarForConsultant('S. Zarei', CALENDARS).id).toBe('s.zarei@method.me');
  });

  it('falls back to the address when the calendar has no display name', () => {
    const bare = [{ id: 'v.gobin@method.me', summary: '', primary: false }];
    expect(matchCalendarForConsultant('Vinesh Gobin', bare).id).toBe('v.gobin@method.me');
  });

  it('never returns the signed-in user’s own calendar', () => {
    expect(matchCalendarForConsultant('Brandon Saltzman', CALENDARS)).toBeNull();
  });

  it('returns null when no subscribed calendar belongs to them', () => {
    expect(matchCalendarForConsultant('Vinesh Gobin', CALENDARS)).toBeNull();
  });

  it('returns null for a name with no first/last structure', () => {
    expect(matchCalendarForConsultant('Sherry', CALENDARS)).toBeNull();
    expect(matchCalendarForConsultant('', CALENDARS)).toBeNull();
  });

  it('does not match a different person sharing a last name initial', () => {
    // "Sam Zabinski" shares neither the last name nor the address.
    expect(matchCalendarForConsultant('Sam Zabinski', CALENDARS)).toBeNull();
  });
});

describe('fetchCalendarList', () => {
  beforeEach(() => _setBqToken('test-token'));

  it('asks only for calendars this user can read', async () => {
    let seen = null;
    const fetchImpl = async (url) => {
      seen = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [{ id: 'a@method.me', summary: 'A', primary: true }] }),
      };
    };
    const list = await fetchCalendarList({ fetchImpl });
    expect(seen).toContain('minAccessRole=reader');
    expect(list).toEqual([{ id: 'a@method.me', summary: 'A', primary: true }]);
  });
});

describe('reading a teammate’s calendar', () => {
  beforeEach(() => _setBqToken('test-token'));

  it('requests the named calendar rather than primary', async () => {
    let seen = null;
    const fetchImpl = async (url) => {
      seen = url;
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    };
    await fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl, calendarId: 's.zarei@method.me' });
    expect(seen).toContain(encodeURIComponent('s.zarei@method.me'));
  });

  it('reports a calendar it cannot read as an access problem, not a scope one', async () => {
    // Re-consenting would not help here, so the Connect button must not appear.
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Not Found' } }),
    });
    const err = await fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl, calendarId: 'x@method.me' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(CalendarAccessError);
    expect(err).not.toBeInstanceOf(CalendarScopeError);
  });

  it('resolves an unrecognizable 403 by whose calendar it is', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
    // Own calendar: most likely the token, so offer re-consent.
    await expect(fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl }))
      .rejects.toBeInstanceOf(CalendarScopeError);
    // Someone else's: most likely sharing, which re-consenting cannot fix.
    const err = await fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl, calendarId: 's.zarei@method.me' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(CalendarAccessError);
  });

  it('still treats a genuine scope failure as re-consentable', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Request had insufficient authentication scopes.' } }),
    });
    await expect(fetchCalendarEvents('2026-08-10', '2026-08-14', { fetchImpl }))
      .rejects.toBeInstanceOf(CalendarScopeError);
  });
});

describe('humanizeHook', () => {
  it('turns a known slug into a phrase that reads in a sentence', () => {
    expect(humanizeHook('overdue_invoice_reminders')).toBe('overdue invoice reminders');
    expect(humanizeHook('cc_fee_pass_through')).toBe('card fee pass-through');
    expect(humanizeHook('auto_invoicing')).toBe('automatic invoicing');
  });

  it('treats the literal "none" as no angle, not as an angle called none', () => {
    // The routine writes 'none' rather than leaving the column null.
    expect(humanizeHook('none')).toBeNull();
    expect(humanizeHook('None')).toBeNull();
    expect(humanizeHook(null)).toBeNull();
    expect(humanizeHook('')).toBeNull();
  });

  it('humanizes an unknown slug rather than leaking snake_case', () => {
    // The field started being written 2026-08-07 and is still changing, so new
    // slugs must not reach the brief raw.
    expect(humanizeHook('annual_prepay_discount')).toBe('annual prepay discount');
  });
});

describe('pitchableMotions', () => {
  const row = (motion, fit) => ({ motion, fit });

  it('keeps only what is worth call time, strongest first', () => {
    const out = pitchableMotions([
      row('dep', 'moderate'),
      row('ppu', 'current'),
      row('method_pay', 'strong'),
      row('free_hour', 'none'),
    ]);
    expect(out.map((r) => r.motion)).toEqual(['method_pay', 'dep']);
  });

  it('excludes a motion the account is already on', () => {
    // "current" is context, not an opportunity.
    expect(pitchableMotions([row('ppu', 'current')])).toEqual([]);
  });

  it('breaks ties on the brief reading order', () => {
    const out = pitchableMotions([row('free_hour', 'strong'), row('method_pay', 'strong')]);
    expect(out.map((r) => r.motion)).toEqual(['method_pay', 'free_hour']);
  });

  it('handles null and empty input', () => {
    expect(pitchableMotions(null)).toEqual([]);
    expect(pitchableMotions([])).toEqual([]);
  });
});

describe('buildPrepHistorySql', () => {
  it('reads every prep for one consultant, newest first, under a cap', () => {
    const sql = buildPrepHistorySql('Brandon Saltzman');
    expect(sql).toContain(CALL_PREP_TABLE);
    expect(sql).toContain("consultant = 'Brandon Saltzman'");
    expect(sql).toContain('ORDER BY snapshot_date DESC');
    expect(sql).toContain(`LIMIT ${PREP_HISTORY_LIMIT}`);
    // Unlike the book query it must NOT dedupe to the latest row per account.
    expect(sql).not.toContain('QUALIFY');
  });

  it('escapes a quote in the consultant name', () => {
    expect(buildPrepHistorySql("D'Angelo Reyes")).toContain("consultant = 'D\\'Angelo Reyes'");
  });

  it('rejects a non-numeric limit rather than interpolating it', () => {
    expect(() => buildPrepHistorySql('Someone', '5; DROP TABLE x')).toThrow();
  });

  it('normalizes rows through the shared snapshot normalizer', async () => {
    const query = async () => ({
      rows: [{ account_record_id: '900101', account_name: 'Northwind Traders', snapshot_date: '2026-08-10', cases_open_count: '2' }],
    });
    const [row] = await fetchPrepHistory('Brandon Saltzman', { query });
    expect(row.accountRecordId).toBe(900101);
    expect(row.casesOpenCount).toBe(2);
  });
});
