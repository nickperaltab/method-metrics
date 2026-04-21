import posthog from 'posthog-js';

// Public project key — safe to commit (same trust model as the Supabase anon key).
// The .env-based env vars are the fallback for local dev overrides.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_API_KEY || 'phc_sRRheLsbeYFhr5wVRAdGxrgFAoriTHnjWcryG8EEW3nQ';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

// Explicit pageview control so HashRouter route changes are tracked reliably
// via a React effect (see PosthogPageview in App.jsx).
posthog.init(POSTHOG_KEY, {
  api_host: POSTHOG_HOST,
  person_profiles: 'identified_only',
  capture_pageview: false,
  capture_pageleave: true,
});

export default posthog;
