// The PS-only shell hangs off these two functions: isPs() picks the route tree
// and the sidebar contents (App.jsx, Sidebar.jsx), isPsPath() is the written
// definition of what "PS screens" means. Both are pure, so they're the cheap
// place to pin the behaviour.
import { describe, it, expect } from 'vitest';
import { isAdmin, isPs, isPsPath, PS_HOME } from '../../src/lib/permissions.js';

describe('isPs', () => {
  it('is true only for the ps role', () => {
    expect(isPs({ role: 'ps' })).toBe(true);
    expect(isPs({ role: 'viewer' })).toBe(false);
    expect(isPs({ role: 'admin' })).toBe(false);
  });

  it('is false for a user that has not resolved yet', () => {
    // UserContext hands down null while the Supabase lookup is in flight.
    expect(isPs(null)).toBe(false);
    expect(isPs(undefined)).toBe(false);
    expect(isPs({})).toBe(false);
  });

  it('does not overlap with isAdmin', () => {
    expect(isAdmin({ role: 'ps' })).toBe(false);
  });
});

describe('isPsPath', () => {
  it('allows the call prep screens', () => {
    expect(isPsPath(PS_HOME)).toBe(true);
    expect(isPsPath('/call-prep')).toBe(true);
    expect(isPsPath('/call-prep/Sherry%20Zarei')).toBe(true);
    expect(isPsPath('/call-prep/account/1234')).toBe(true);
  });

  it('rejects the metrics side of the app', () => {
    for (const p of ['/', '/chat', '/explorer', '/dashboards/7', '/scorecards/sales',
                     '/admin/registry', '/admin/insights', '/exports/saas-data',
                     '/mcp-token', '/ps', '/handoffs', '/projects', '/accounts/1234']) {
      expect(isPsPath(p), p).toBe(false);
    }
  });

  it('rejects the withdrawn end-of-day screen', () => {
    expect(isPsPath('/eod')).toBe(false);
  });

  it('does not treat a prefix match as a PS path', () => {
    expect(isPsPath('/call-prepare')).toBe(false);
    expect(isPsPath('')).toBe(false);
    expect(isPsPath(null)).toBe(false);
  });
});
