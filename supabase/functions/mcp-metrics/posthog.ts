/**
 * Minimal PostHog /capture client. No SDK — just a POST.
 *
 * distinct_id = token_id so usage cohorts don't leak real identities.
 * Fire-and-forget: a capture failure must never block a tool response.
 *
 * Disabled if POSTHOG_API_KEY is not set (useful for local dev).
 */
const PH_HOST = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com';
const PH_KEY = Deno.env.get('POSTHOG_API_KEY');

export interface PhEvent {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
}

export function capture(ev: PhEvent): void {
  if (!PH_KEY) return;
  const body = {
    api_key: PH_KEY,
    event: ev.event,
    distinct_id: ev.distinctId,
    properties: {
      $lib: 'mcp-metrics',
      $lib_version: '0.1.0',
      ...ev.properties,
    },
    timestamp: new Date().toISOString(),
  };
  fetch(`${PH_HOST}/capture/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => console.error('[posthog] capture failed', err));
}
