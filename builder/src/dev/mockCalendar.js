// Fixture-backed stand-in for the Google Calendar API. Active only in MOCK_MODE.
//
// THIS FILE MUST STAY FAKE — same rule as fixtures/ps.js. Every meeting title,
// attendee and domain below is invented. Never paste a real calendar export here.
//
// Rows come back in the raw Google Calendar v3 shape, not the normalized one, so
// mock runs travel through the same normalizeEvent() path as production.
//
// The set deliberately covers all four matching outcomes, so the strip's hidden
// -events affordance is reachable offline:
//   - account name in full in the title      → matched via title
//   - one distinctive word in the title      → matched via title
//   - nothing in the title, attendee domain  → matched via attendee
//   - internal meetings and a declined call  → no match, hidden behind the count

const WEEKDAY_MEETINGS = [
  {
    hour: 9,
    minute: 0,
    summary: 'Northwind Traders — PPU session',
    attendees: ['dana@northwindtraders.com'],
  },
  {
    hour: 10,
    minute: 30,
    summary: 'Harborview check-in',
    attendees: ['ops@harborviewdental.com'],
  },
  {
    hour: 13,
    minute: 0,
    summary: 'Quarterly workflow review',
    attendees: ['ap@cedarlinemillwork.com'],
  },
  {
    hour: 14,
    minute: 30,
    summary: 'PS team standup',
    attendees: ['ps-team@method.me'],
  },
  {
    hour: 15,
    minute: 30,
    summary: 'Tallgrass Landscaping — sync troubleshooting',
    attendees: ['bill@tallgrasslandscaping.com'],
    declined: true,
  },
];

// One Saturday item, so the strip's "weekend only gets a column when something
// is on it" rule is reachable offline, and one all-day event.
const WEEKEND_MEETINGS = [
  { allDay: true, summary: 'On call — PS rotation', attendees: [] },
];

/** Every YYYY-MM-DD from `fromIso` to `toIso` inclusive. */
function daysBetween(fromIso, toIso) {
  const out = [];
  const end = new Date(`${toIso}T00:00:00`);
  for (let d = new Date(`${fromIso}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) {
    const pad = (n) => String(n).padStart(2, '0');
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}

const isWeekend = (iso) => [0, 6].includes(new Date(`${iso}T00:00:00`).getDay());

function localDateTime(iso, hour, minute) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${iso}T${pad(hour)}:${pad(minute)}:00`;
}

/**
 * Meetings across the requested range. Laid out per weekday rather than pinned
 * to fixed dates so paging to any week still shows something to design against.
 * The count varies by weekday index to keep the columns visibly uneven.
 */
/**
 * Calendars the mock user is "subscribed" to. Sherry is here so a teammate's
 * book renders offline; Vinesh deliberately is NOT, so the not-subscribed state
 * is reachable too (the ps fixtures give both of them accounts).
 */
export function mockCalendarList() {
  return [
    { id: 'b.saltzman@method.me', summary: 'Brandon Saltzman', primary: true },
    { id: 's.zarei@method.me', summary: 'Sherry Zarei', primary: false },
    { id: 'ps-team@method.me', summary: 'PS Team Events', primary: false },
  ];
}

export function mockCalendarEvents(fromIso, toIso, calendarId = 'primary') {
  // A teammate's calendar returns a thinner day, so switching books offline
  // visibly changes the strip instead of echoing the same fixture back.
  const perDay = calendarId === 'primary' ? null : 2;
  const events = [];
  const push = (iso, i, meeting) => {
    events.push({
      id: `mock-${iso}-${i}`,
      summary: meeting.summary,
      start: meeting.allDay
        ? { date: iso }
        : { dateTime: localDateTime(iso, meeting.hour, meeting.minute) },
      end: meeting.allDay
        ? { date: iso }
        : { dateTime: localDateTime(iso, meeting.hour + 1, meeting.minute) },
      htmlLink: 'https://calendar.google.com/calendar/u/0/r',
      attendees: [
        { email: 'b.saltzman@method.me', self: true, responseStatus: meeting.declined ? 'declined' : 'accepted' },
        ...meeting.attendees.map((email) => ({ email, responseStatus: 'accepted' })),
      ],
    });
  };

  let weekdayIndex = 0;
  for (const iso of daysBetween(fromIso, toIso)) {
    if (isWeekend(iso)) {
      // Saturday only — Sunday stays clear, so the strip is seen both ways.
      if (new Date(`${iso}T00:00:00`).getDay() === 6) {
        WEEKEND_MEETINGS.forEach((meeting, i) => push(iso, i, meeting));
      }
      continue;
    }
    const count = perDay ?? 2 + (weekdayIndex % 3);
    WEEKDAY_MEETINGS.slice(0, count).forEach((meeting, i) => push(iso, i, meeting));
    weekdayIndex += 1;
  }
  return events;
}
