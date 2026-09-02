// What a PS user actually sees in the nav. Static render, like eod-render.test.js:
// effects don't run, so the Supabase-backed sections (starred dashboards,
// scorecards, "View as") are absent here for everyone — the assertions below
// stick to the statically-rendered links.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createElement as h } from 'react';
import Sidebar from '../../src/components/Sidebar.jsx';
import { UserContext } from '../../src/contexts/UserContext.jsx';

const render = (user, path = '/call-prep') =>
  renderToStaticMarkup(
    h(MemoryRouter, { initialEntries: [path] },
      h(UserContext.Provider, {
        value: {
          currentUser: user, realUser: user, impersonating: false,
          startImpersonating: () => {}, stopImpersonating: () => {}, loading: false,
        },
      }, h(Sidebar, { collapsed: false, onToggle: () => {} })))
  );

const PS = { id: 1, email: 'y.zaman@method.me', name: 'Yasar', role: 'ps' };
const ADMIN = { id: 2, email: 'n.peralta-baron@method.me', name: 'Nic', role: 'admin' };

describe('Sidebar for a ps user', () => {
  it('links to Call Prep', () => {
    const html = render(PS);
    expect(html).toContain('Call Prep');
    expect(html).toContain('href="/call-prep"');
  });

  it('has no link to the metrics side of the app', () => {
    const html = render(PS);
    for (const gone of ['Chart Builder', 'Metric Registry', 'Home', 'Admin', 'Labs']) {
      expect(html, gone).not.toContain(gone);
    }
    for (const href of ['href="/"', 'href="/chat"', 'href="/admin', 'href="/scorecards']) {
      expect(html, href).not.toContain(href);
    }
  });

  it('drops the PS section heading, since the whole nav is PS', () => {
    // The heading exists to separate PS from what sits above it. Nothing does.
    expect(render(PS)).not.toContain('>PS<');
  });

  it('points the logo at Call Prep rather than the metrics home', () => {
    const html = render(PS);
    expect(html).toContain('href="/call-prep"');
    expect(html).not.toContain('href="/"');
  });
});

describe('Sidebar for an admin', () => {
  it('still shows the full nav', () => {
    const html = render(ADMIN, '/');
    expect(html).toContain('Chart Builder');
    expect(html).toContain('Metric Registry');
    expect(html).toContain('Home');
    expect(html).toContain('>PS<');
    expect(html).toContain('Call Prep');
  });
});

describe('End of Day', () => {
  it('is not in the nav for either role', () => {
    expect(render(PS)).not.toContain('End of Day');
    expect(render(ADMIN, '/')).not.toContain('End of Day');
    expect(render(PS)).not.toContain('href="/eod"');
    expect(render(ADMIN, '/')).not.toContain('href="/eod"');
  });
});
