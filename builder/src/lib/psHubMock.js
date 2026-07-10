// Local-only fixture data for PS Hub, used purely so the board/detail UX can
// be reviewed and iterated on before the ps_accounts/ps_call_preps/ps_audits/
// ps_project_notes tables exist in the real Supabase project (migration
// 20260709000000 hasn't been applied there yet). Everything here lives in
// memory, resets on page reload, and is only ever reached via the
// import.meta.env.DEV fallback in psHub.js — never shipped to production.

function id(prefix, n) { return `mock-${prefix}-${n}`; }

const ME = 'b.saltzman@method.me';
const OTHER = 'j.rivera@method.me';

export const accounts = [
  { id: id('acc', 1), name: 'Acme Robotics', method_customer_id: 'M-1001', account_type: 'DEDICATED', is_dedicated: true, is_active: true, owner_email: ME },
  { id: id('acc', 2), name: 'Northwind Traders', method_customer_id: 'M-1002', account_type: 'DEDICATED', is_dedicated: true, is_active: true, owner_email: ME },
  { id: id('acc', 3), name: 'Blue Harbor Logistics', method_customer_id: 'M-1003', account_type: 'DEDICATED', is_dedicated: true, is_active: true, owner_email: ME },
  { id: id('acc', 4), name: 'Fieldstone Manufacturing', method_customer_id: 'M-1004', account_type: 'DEDICATED', is_dedicated: true, is_active: false, owner_email: ME },
  { id: id('acc', 5), name: 'Harbor Point Realty', method_customer_id: 'M-1005', account_type: 'DEDICATED', is_dedicated: true, is_active: true, owner_email: OTHER },
  { id: id('acc', 6), name: 'Crestline Supply', method_customer_id: 'M-1006', account_type: 'PPU', is_dedicated: false, is_active: true, owner_email: ME },
];

export const callPreps = [
  { id: id('cp', 1), account_id: id('acc', 1), call_date: '2026-07-08', summary: 'Renewal conversation — wants custom reporting scoped before signing.', content: 'Discussed Q3 renewal. Sarah (champion) is happy with sync reliability but wants a custom AR aging report before committing to another year. Action: scope report, send by Friday.', dep_score: 82, source_doc_url: null },
  { id: id('cp', 2), account_id: id('acc', 1), call_date: '2026-06-24', summary: 'Onboarding wrap-up, moved to steady-state cadence.', content: 'Closed out remaining onboarding tickets. Moving to monthly check-ins.', dep_score: 76, source_doc_url: null },
  { id: id('cp', 3), account_id: id('acc', 2), call_date: '2026-07-09', summary: 'Escalation risk — sync failures for 3 days, exec sponsor joining call.', content: 'CustomerMethodAccount showing repeated SyncFailCount increments. Ops lead is frustrated; their VP is joining today\'s call. Need root cause before the call starts.', dep_score: 41, source_doc_url: null },
  { id: id('cp', 4), account_id: id('acc', 3), call_date: '2026-07-07', summary: 'Healthy account, exploring add-on automation for inventory.', content: 'Stable usage, high satisfaction. Brought up interest in inventory reorder automation — flagged to AE for upsell.', dep_score: 91, source_doc_url: null },
  { id: id('cp', 5), account_id: id('acc', 4), call_date: '2026-05-30', summary: 'Churn risk — considering competitor after repeated support delays.', content: 'Account has been unresponsive to outreach. Last call, they mentioned evaluating a competitor. Marked inactive pending win-back attempt.', dep_score: 22, source_doc_url: null },
  { id: id('cp', 6), account_id: id('acc', 5), call_date: '2026-07-03', summary: 'Quarterly business review — expansion discussion.', content: 'QBR went well. Discussed adding 5 more licenses in Q4.', dep_score: 88, source_doc_url: null },
];

export const audits = [
  { id: id('au', 1), account_id: id('acc', 1), audit_type: 'PPU', call_date: '2026-07-08', total_score: 540, max_score: 625, score_breakdown: { opening: 22, discovery: 180, execution: 250, next_steps: 88 }, flags: ['strong_discovery'], notes: 'Good discovery on the reporting ask, could tighten the close.', transcript_url: null },
  { id: id('au', 2), account_id: id('acc', 2), audit_type: 'PPU', call_date: '2026-07-09', total_score: 310, max_score: 625, score_breakdown: { opening: 10, discovery: 90, execution: 140, next_steps: 70 }, flags: ['weak_opening', 'escalation_risk'], notes: 'Opening rushed straight into troubleshooting without setting agenda — understandable given the fire, but worth a debrief.', transcript_url: null },
  { id: id('au', 3), account_id: id('acc', 3), audit_type: 'FREE_HOUR', call_date: '2026-07-07', total_score: 340, max_score: 400, score_breakdown: { discovery: 120, execution: 160, conversion: 60 }, flags: ['upsell_flagged'], notes: 'Clean execution, correctly flagged the automation interest for AE follow-up.', transcript_url: null },
  { id: id('au', 4), account_id: id('acc', 5), audit_type: 'PPU', call_date: '2026-07-03', total_score: 590, max_score: 625, score_breakdown: { opening: 25, discovery: 195, execution: 265, next_steps: 105 }, flags: [], notes: 'Excellent expansion conversation, clear next steps captured.', transcript_url: null },
];

export const projectNotes = [
  { id: id('note', 1), account_id: id('acc', 1), title: 'Scope custom AR aging report', status: 'IN_PROGRESS', body: 'Needs aging buckets at 30/60/90, grouped by sales rep.', due_date: '2026-07-11', updated_at: '2026-07-08T16:00:00Z' },
  { id: id('note', 2), account_id: id('acc', 1), title: 'Send renewal quote', status: 'OPEN', body: null, due_date: '2026-07-14', updated_at: '2026-07-08T16:05:00Z' },
  { id: id('note', 3), account_id: id('acc', 2), title: 'Root-cause repeated sync failures', status: 'BLOCKED', body: 'Waiting on IT support for a Method-side log pull.', due_date: '2026-07-09', updated_at: '2026-07-09T13:00:00Z' },
  { id: id('note', 4), account_id: id('acc', 3), title: 'Loop in AE for inventory automation upsell', status: 'OPEN', body: null, due_date: null, updated_at: '2026-07-07T15:00:00Z' },
  { id: id('note', 5), account_id: id('acc', 4), title: 'Win-back outreach sequence', status: 'BLOCKED', body: 'Two emails sent, no response. Trying a call next.', due_date: '2026-07-15', updated_at: '2026-05-30T12:00:00Z' },
  { id: id('note', 6), account_id: id('acc', 5), title: 'Draft Q4 license expansion order', status: 'DONE', body: 'Sent 2026-07-05, awaiting signature.', due_date: null, updated_at: '2026-07-05T10:00:00Z' },
];

let seq = 100;
function nextId(prefix) { seq += 1; return `mock-${prefix}-${seq}`; }

function matchesFilters(a, { ownerEmail, activeOnly, accountType }) {
  if (ownerEmail && a.owner_email !== ownerEmail) return false;
  if (activeOnly && !a.is_active) return false;
  if (accountType && a.account_type !== accountType) return false;
  return true;
}

export function mockFetchPsBoard(filters = {}) {
  return accounts
    .filter((a) => matchesFilters(a, filters))
    .map((a) => {
      const preps = callPreps.filter((p) => p.account_id === a.id).sort((x, y) => y.call_date.localeCompare(x.call_date));
      const auds = audits.filter((x) => x.account_id === a.id).sort((x, y) => y.call_date.localeCompare(x.call_date));
      const openNotes = projectNotes.filter((n) => n.account_id === a.id && n.status !== 'DONE');
      return { ...a, latestCallPrep: preps[0] || null, latestAudit: auds[0] || null, openNoteCount: openNotes.length };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
}

export function mockFetchPsAccount(accountId) {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return null;
  return {
    ...account,
    ps_call_preps: callPreps.filter((p) => p.account_id === accountId),
    ps_audits: audits.filter((a) => a.account_id === accountId),
    ps_project_notes: projectNotes.filter((n) => n.account_id === accountId),
  };
}

export function mockUpdatePsAccount(accountId, updates) {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Account not found');
  Object.assign(account, updates);
  return { ...account };
}

export function mockUpdateCallPrep(prepId, updates) {
  const prep = callPreps.find((p) => p.id === prepId);
  if (!prep) throw new Error('Call prep not found');
  Object.assign(prep, updates);
  return { ...prep };
}

export function mockUpdateAudit(auditId, updates) {
  const audit = audits.find((a) => a.id === auditId);
  if (!audit) throw new Error('Audit not found');
  Object.assign(audit, updates);
  return { ...audit };
}

export function mockCreateProjectNote({ accountId, title, status, body, dueDate }) {
  const note = {
    id: nextId('note'),
    account_id: accountId,
    title,
    status: status || 'OPEN',
    body: body || null,
    due_date: dueDate || null,
    updated_at: new Date().toISOString(),
  };
  projectNotes.unshift(note);
  return { ...note };
}

export function mockUpdateProjectNote(noteId, updates) {
  const note = projectNotes.find((n) => n.id === noteId);
  if (!note) throw new Error('Project note not found');
  Object.assign(note, updates);
  return { ...note };
}

export function mockDeleteProjectNote(noteId) {
  const idx = projectNotes.findIndex((n) => n.id === noteId);
  if (idx >= 0) projectNotes.splice(idx, 1);
}
