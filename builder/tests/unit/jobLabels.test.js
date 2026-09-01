import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { jobLabels } from '../../src/lib/bigquery.js';

// BigQuery rejects a job whose label keys or values fall outside this set, and
// it rejects the whole query — not just the label — so the sanitising in
// currentSurface() is load-bearing rather than cosmetic.
const LABEL_RE = /^[a-z][a-z0-9_-]{0,62}$/;

// The unit suite runs in node, so `window` has to be stubbed here. Kept local
// rather than added to setup-browser.js: several modules branch on
// `typeof window === 'undefined'`, and flipping that globally changes what
// other tests exercise.
const hadWindow = 'window' in globalThis;
beforeEach(() => { globalThis.window = { location: { hash: '' } }; });
afterAll(() => { if (!hadWindow) delete globalThis.window; });

const setHash = (h) => { globalThis.window.location.hash = h; };

describe('jobLabels', () => {
  it('always tags the app', () => {
    expect(jobLabels().app).toBe('method-metrics');
  });

  it('takes an explicit surface over the route', () => {
    setHash('#/scorecards/sales');
    expect(jobLabels('auth-check').surface).toBe('auth-check');
  });

  it.each([
    ['#/scorecards/sales', 'scorecards'],
    ['#/chat', 'chat'],
    ['#/admin/registry', 'admin'],
    ['#/call-prep/nic', 'call-prep'],
    ['#/accounts/12345', 'accounts'],
    ['#/', 'home'],
    ['', 'home'],
  ])('derives surface from route %s', (hash, expected) => {
    setHash(hash);
    expect(jobLabels().surface).toBe(expected);
  });

  it('strips characters BigQuery would reject', () => {
    setHash('#/Weird.Surface!/x');
    const { surface } = jobLabels();
    expect(surface).toBe('weirdsurface');
    expect(surface).toMatch(LABEL_RE);
  });

  it('emits label values BigQuery accepts for every real route', () => {
    for (const h of ['#/', '#/chat', '#/scorecards/sales', '#/admin/registry', '#/projects/9/edit']) {
      setHash(h);
      const l = jobLabels();
      expect(l.app).toMatch(LABEL_RE);
      expect(l.surface).toMatch(LABEL_RE);
    }
  });
});
