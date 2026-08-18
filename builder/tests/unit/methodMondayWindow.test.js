import { describe, it, expect } from 'vitest';
import { formatMethodMondayWindow } from '../../src/lib/methodMondayWindow';

describe('formatMethodMondayWindow', () => {
  it('formats the reported example exactly: period=2026-08-01, elapsed_days=16, days_in_month=31', () => {
    // Verbatim from the sales director's report: "yesterday (2026-08-17) we
    // would report on 2026-08-01 to 2026-08-16" — i.e. run on Aug 17,
    // elapsed_days is 16 (complete days before today).
    const label = formatMethodMondayWindow({ period: '2026-08-01', elapsedDays: 16, daysInMonth: 31 });
    expect(label).toEqual({
      rangeLabel: 'Aug 1 – Aug 16, 2026',
      dayLabel: 'day 16 of 31',
    });
  });

  it('handles a different month/day combination', () => {
    const label = formatMethodMondayWindow({ period: '2026-02-01', elapsedDays: 5, daysInMonth: 28 });
    expect(label).toEqual({
      rangeLabel: 'Feb 1 – Feb 5, 2026',
      dayLabel: 'day 5 of 28',
    });
  });

  it('returns null when elapsedDays is 0 (day 1 of month — no complete days queried yet)', () => {
    expect(formatMethodMondayWindow({ period: '2026-08-01', elapsedDays: 0, daysInMonth: 31 })).toBeNull();
  });

  it('returns null for a negative elapsedDays', () => {
    expect(formatMethodMondayWindow({ period: '2026-08-01', elapsedDays: -1, daysInMonth: 31 })).toBeNull();
  });

  it('returns null when given null (not connected / query failed)', () => {
    expect(formatMethodMondayWindow(null)).toBeNull();
  });

  it('returns null when given undefined', () => {
    expect(formatMethodMondayWindow(undefined)).toBeNull();
  });

  it('returns null when a required field is missing', () => {
    expect(formatMethodMondayWindow({ period: '2026-08-01', elapsedDays: 16 })).toBeNull();
    expect(formatMethodMondayWindow({ elapsedDays: 16, daysInMonth: 31 })).toBeNull();
  });

  it('returns null when elapsedDays/daysInMonth are non-numeric (e.g. BQ REST API string values not coerced)', () => {
    expect(formatMethodMondayWindow({ period: '2026-08-01', elapsedDays: 'sixteen', daysInMonth: 31 })).toBeNull();
  });

  it('returns null for a malformed period string', () => {
    expect(formatMethodMondayWindow({ period: 'not-a-date', elapsedDays: 16, daysInMonth: 31 })).toBeNull();
  });

  it('never derives from the browser clock — same output regardless of when the test runs', () => {
    // Pure function of its inputs only; no `new Date()` anywhere in the
    // implementation. Calling it twice in a row must be identical.
    const input = { period: '2026-08-01', elapsedDays: 16, daysInMonth: 31 };
    expect(formatMethodMondayWindow(input)).toEqual(formatMethodMondayWindow(input));
  });
});
