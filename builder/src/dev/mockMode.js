// Offline UI-dev mode. Turn it on with `npm run dev:mock` (vite --mode mock,
// which loads builder/.env.mock). When on, the app skips the Google sign-in
// gate and serves synthetic fixtures instead of BigQuery/Supabase, so screens
// can be designed with no network and no auth.
//
// The `import.meta.env.DEV` conjunct is the safety catch: `vite build` sets DEV
// false, so even if VITE_MOCK_DATA leaked into a production env the shipped
// bundle can never serve fixtures — and the fixture modules tree-shake out.
export const MOCK_MODE =
  Boolean(import.meta.env.DEV) && import.meta.env.VITE_MOCK_DATA === 'true';

/** The consultant the mock app is "signed in" as. Override in .env.mock. */
export const MOCK_EMAIL = import.meta.env.VITE_MOCK_EMAIL || 'b.saltzman@method.me';

/** Fake user record standing in for the Supabase `users` row. */
export const MOCK_USER = {
  id: 1,
  email: MOCK_EMAIL,
  name: 'Mock Consultant',
  // admin so role-gated UI (impersonation, approvals) is reachable offline.
  role: 'admin',
};

/** Log once per distinct message so a re-rendering page can't spam the console. */
const seen = new Set();
export function mockWarn(message, detail) {
  if (seen.has(message)) return;
  seen.add(message);
  console.warn(`[mock] ${message}`, detail ?? '');
}
