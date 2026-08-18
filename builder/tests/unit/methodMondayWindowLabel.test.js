import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MethodMondayWindowLabel from '../../src/components/method-monday/MethodMondayWindowLabel';

describe('MethodMondayWindowLabel', () => {
  it('renders the range and day-of-month label from supplied window data', () => {
    const html = renderToStaticMarkup(
      React.createElement(MethodMondayWindowLabel, {
        window: { period: '2026-08-01', elapsedDays: 16, daysInMonth: 31 },
      })
    );
    expect(html).toMatch(/Aug 1 – Aug 16, 2026/);
    expect(html).toMatch(/day 16 of 31/);
  });

  it('renders nothing when window is null (not connected or query failed)', () => {
    const html = renderToStaticMarkup(
      React.createElement(MethodMondayWindowLabel, { window: null })
    );
    expect(html).toBe('');
  });

  it('renders nothing when window is undefined (prop not passed)', () => {
    const html = renderToStaticMarkup(
      React.createElement(MethodMondayWindowLabel, {})
    );
    expect(html).toBe('');
  });

  it('renders nothing rather than a guessed range when elapsedDays is 0', () => {
    const html = renderToStaticMarkup(
      React.createElement(MethodMondayWindowLabel, {
        window: { period: '2026-08-01', elapsedDays: 0, daysInMonth: 31 },
      })
    );
    expect(html).toBe('');
  });
});
