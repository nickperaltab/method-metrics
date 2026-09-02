// Smoke test for the /eod screen. There is no @testing-library in this repo, so
// this renders statically: effects don't run, which means it proves the module
// graph imports cleanly and the pre-fetch state renders — not the populated
// list. The data path behind that list is covered by the round-trip tests in
// mockBq.test.js.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createElement as h } from 'react';
import Eod from '../../src/pages/Eod.jsx';

const render = (props) =>
  renderToStaticMarkup(h(MemoryRouter, null, h(Eod, props)));

describe('Eod screen', () => {
  it('renders the loading state before the fetch resolves', () => {
    const html = render({ userEmail: 'b.saltzman@method.me' });
    expect(html).toContain('Loading your day');
  });

  it('renders without a signed-in address rather than throwing', () => {
    // App passes userEmail down from OAuth; a first paint can beat it.
    expect(() => render({ userEmail: null })).not.toThrow();
  });
});
