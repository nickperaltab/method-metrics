import { describe, it, expect } from 'vitest';
import {
  HOURS_PER_DAY,
  holidays,
  isHoliday,
  isWorkingDay,
  parseDay,
  monthOf,
  isOpenMonth,
  workingDaysInMonth,
  workingHoursInMonth,
  workingDaysElapsed,
  monthCapacityHours,
} from '../../src/lib/workingTime.js';

// The figure Brandon specified and the whole screen is anchored to: August 2026
// has 20 working days, so one consultant's denominator is 160 hours. Method's
// own attendance rows post exactly 160.0 for that month for 22 of the 24
// consultants on the roster, which is the independent confirmation.
describe('the August 2026 anchor', () => {
  it('is 20 working days and 160 hours', () => {
    expect(workingDaysInMonth('2026-08')).toBe(20);
    expect(workingHoursInMonth('2026-08')).toBe(160);
  });

  it('gets there by netting the Civic Holiday out of 21 weekdays', () => {
    expect(isHoliday('2026-08-03')).toBe(true);
    expect(isWorkingDay('2026-08-03')).toBe(false);
  });
});

describe('holidays', () => {
  // Ontario's real 2026 dates. Method's office is in Toronto.
  it('matches the published Ontario calendar for 2026', () => {
    expect([...holidays(2026)].sort()).toEqual([
      '2026-01-01', // New Year's Day, Thu
      '2026-02-16', // Family Day, 3rd Mon Feb
      '2026-04-03', // Good Friday (Easter 5 Apr)
      '2026-05-18', // Victoria Day, Mon before 25 May
      '2026-07-01', // Canada Day, Wed
      '2026-08-03', // Civic Holiday, 1st Mon Aug
      '2026-09-07', // Labour Day, 1st Mon Sep
      '2026-10-12', // Thanksgiving, 2nd Mon Oct
      '2026-12-25', // Christmas, Fri
      '2026-12-28', // Boxing Day observed, Sat 26 -> Mon 28
    ]);
  });

  it('derives the moving feasts rather than reading a table', () => {
    // Easter 2027 is 28 Mar, 2028 is 16 Apr. A hardcoded list would be silently
    // wrong here, which is the reason these are computed.
    expect(holidays(2027).has('2027-03-26')).toBe(true);
    expect(holidays(2028).has('2028-04-14')).toBe(true);
  });

  it('rolls a weekend holiday to the next weekday', () => {
    // 1 Jan 2028 is a Saturday.
    expect(holidays(2028).has('2028-01-03')).toBe(true);
    expect(holidays(2028).has('2028-01-01')).toBe(false);
  });

  it('does not stack Boxing Day on the day Christmas moved to', () => {
    // 2027: Christmas is Sat 25 -> Mon 27, so Boxing Day cannot also be Mon 27.
    const h = holidays(2027);
    expect(h.has('2027-12-27')).toBe(true);
    expect(h.has('2027-12-28')).toBe(true);
    expect([...h].filter((d) => d.startsWith('2027-12'))).toHaveLength(2);
  });
});

describe('workingDaysInMonth', () => {
  it('covers 2026 month by month', () => {
    expect([...Array(12)].map((_, i) => workingDaysInMonth(`2026-${String(i + 1).padStart(2, '0')}`)))
      .toEqual([21, 19, 22, 21, 20, 22, 22, 20, 21, 21, 21, 21]);
  });

  it('is zero for a month it cannot parse, rather than NaN', () => {
    expect(workingDaysInMonth('nonsense')).toBe(0);
    expect(workingDaysInMonth('2026-13')).toBe(0);
    expect(workingDaysInMonth(null)).toBe(0);
  });
});

describe('parseDay', () => {
  it('reads a day in local time, so it cannot slip to the day before', () => {
    const d = parseDay('2026-09-08');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(8);
  });

  it('rejects anything that is not a YYYY-MM-DD', () => {
    expect(parseDay('2026-09')).toBeNull();
    expect(parseDay(null)).toBeNull();
  });
});

describe('monthCapacityHours', () => {
  // The real situation on 9 Sep 2026: entries ran to 8 Sep, because time is
  // logged in arrears. asOf is the last day WITH DATA, never today.
  const asOf = parseDay('2026-09-08');

  it('charges a closed month its whole working month', () => {
    expect(monthCapacityHours('2026-08', asOf)).toBe(160);
  });

  it('prorates the open month to the working days that have entries', () => {
    // 1, 2, 3, 4 and 8 Sep. The 7th was Labour Day and the 5th/6th a weekend.
    expect(workingDaysElapsed('2026-09', asOf)).toBe(5);
    expect(monthCapacityHours('2026-09', asOf)).toBe(40);
  });

  it('does not charge a month that has not started', () => {
    expect(monthCapacityHours('2026-10', asOf)).toBe(0);
  });

  it('would overcharge by a day if it followed the clock instead of the data', () => {
    // This is the bug the asOf parameter exists to prevent: on 9 Sep, with no
    // entries yet for the 9th, "today" adds a sixth working day of capacity
    // against zero logged hours.
    expect(monthCapacityHours('2026-09', parseDay('2026-09-09'))).toBe(48);
  });

  it('uses eight hours a day', () => {
    expect(HOURS_PER_DAY).toBe(8);
    expect(monthCapacityHours('2026-08', asOf)).toBe(workingDaysInMonth('2026-08') * HOURS_PER_DAY);
  });
});

describe('month helpers', () => {
  it('names the month a date falls in', () => {
    expect(monthOf(parseDay('2026-09-08'))).toBe('2026-09');
  });

  it('calls the month of the newest data open, and everything before it closed', () => {
    const asOf = parseDay('2026-09-08');
    expect(isOpenMonth('2026-09', asOf)).toBe(true);
    expect(isOpenMonth('2026-08', asOf)).toBe(false);
  });
});
