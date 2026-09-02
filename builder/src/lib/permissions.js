export function isAdmin(user) {
  return user?.role === 'admin';
}

// Professional services. A `ps` user gets the PS screens and nothing else: no
// home, no chart builder, no dashboards, scorecards, registry or admin. The
// role lives on the Supabase `users` row (see
// supabase/migrations/20260813000000_ps_role.sql); anyone who signs in without
// a row is created as `viewer` and keeps the full app.
//
// This scopes navigation, not data. BigQuery grants and Supabase RLS are what
// actually decide what a PS user can read.
export function isPs(user) {
  return user?.role === 'ps';
}

/** Where a `ps` user lands, and where unknown paths send them. */
export const PS_HOME = '/call-prep';

const PS_PATH_PREFIXES = ['/call-prep'];

/** True for the paths a `ps` user is allowed to reach. */
export function isPsPath(pathname) {
  const path = String(pathname || '');
  return PS_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function canApprove(user) {
  return isAdmin(user);
}

export function canDelete(user, item) {
  return item?.created_by_user === user?.id;
}

export function canEdit(user, item) {
  return item?.created_by_user === user?.id;
}
