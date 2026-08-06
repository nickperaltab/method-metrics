import posthog from 'posthog-js';
import { MOCK_MODE } from '../dev/mockMode';

// Public project key — safe to commit (same trust model as the Supabase anon key).
// The .env-based env vars are the fallback for local dev overrides.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_API_KEY || 'phc_sRRheLsbeYFhr5wVRAdGxrgFAoriTHnjWcryG8EEW3nQ';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

// Offline UI mode: no-op stub instead of a real client, so designing screens
// against fixtures neither needs the network nor files fake events against the
// real project. Only capture/identify/reset are called across the app.
const stub = { capture() {}, identify() {}, reset() {} };

if (!MOCK_MODE) {
  // Explicit pageview control so HashRouter route changes are tracked reliably
  // via a React effect (see PosthogPageview in App.jsx).
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
  });
}

export default MOCK_MODE ? stub : posthog;
