// Delivered-vs-promised metrics for the project tracker.
//
// Two separate ratings, deliberately not blended into one score — they fail for
// different reasons and a single number would hide which:
//
//   HOURS EFFICIENCY     promised hours ÷ logged hours
//                        >100% = delivered inside the estimate.
//                        Promise = the per-task `estimateHours`. Logged = the
//                        sum of work-log entries. A project's hours_budget is a
//                        coarser commercial signal and is NOT part of this.
//
//   DELIVERY RELIABILITY promised items closed on or before their due date
//                        ÷ all promised items.
//                        A promised item still open counts against you, because
//                        from the customer's side an unshipped promise and a
//                        late one are the same thing.
//
// Both roll up task → project → rep (and → account) by summing the same
// numerators and denominators, never by averaging percentages: averaging would
// let a 0.5-hour task swing the number as hard as a 40-hour one.
//
// Every function returns null rather than 0 or Infinity when there's nothing to
// measure, so the UI can render "—" instead of a misleading 0%.

/** promised ÷ logged, as a fraction. null when no hours are logged yet. */
export function hoursEfficiency(promisedHours, loggedHours) {
  if (!loggedHours || loggedHours <= 0) return null;
  if (promisedHours == null) return null;
  return promisedHours / loggedHours;
}

/** onTime ÷ total, as a fraction. null when nothing was promised. */
export function deliveryReliability(promisedTotal, promisedOnTime) {
  if (!promisedTotal || promisedTotal <= 0) return null;
  return promisedOnTime / promisedTotal;
}

/** Was this promised item delivered on or before its due date? */
export function isOnTime(item) {
  if (!item.isPromised) return false;
  if (item.isOpen) return false;
  if (!item.dueDate) return true; // nothing to be late against
  return Boolean(item.closedDate) && item.closedDate <= item.dueDate;
}

/**
 * Hours logged against one work item. Entries with a null itemId are
 * project-level work and are intentionally excluded from per-task numbers —
 * attributing a general status call to an arbitrary task would distort it.
 */
export function loggedHoursForItem(itemId, workLog = []) {
  return workLog
    .filter((e) => e.itemId === itemId)
    .reduce((sum, e) => sum + (e.hours ?? 0), 0);
}

/** Per-task efficiency rows for the project detail table. */
export function itemEfficiency(items = [], workLog = []) {
  return items.map((item) => {
    const logged = loggedHoursForItem(item.itemId, workLog);
    return {
      item,
      promisedHours: item.estimateHours,
      loggedHours: logged,
      efficiency: hoursEfficiency(item.estimateHours, logged),
      variance: item.estimateHours == null ? null : logged - item.estimateHours,
      onTime: isOnTime(item),
    };
  });
}

/**
 * Project-level totals. Prefers the rollup columns the SQL already computed,
 * but recomputes from items/log when they're supplied — the detail page has the
 * detail rows in hand and shouldn't be able to disagree with its own table.
 */
export function projectEfficiency(project, { items, workLog } = {}) {
  const promisedHours = items
    ? items.reduce((sum, i) => sum + (i.estimateHours ?? 0), 0)
    : project.promisedHours;
  const loggedHours = workLog
    ? workLog.reduce((sum, e) => sum + (e.hours ?? 0), 0)
    : project.loggedHours;
  const promisedItems = items ? items.filter((i) => i.isPromised) : null;
  const promisedTotal = promisedItems ? promisedItems.length : project.promisedTotal;
  const promisedOnTime = promisedItems
    ? promisedItems.filter(isOnTime).length
    : project.promisedOnTime;

  return {
    promisedHours,
    loggedHours,
    hoursEfficiency: hoursEfficiency(promisedHours, loggedHours),
    hoursVariance: loggedHours - promisedHours,
    promisedTotal,
    promisedOnTime,
    deliveryReliability: deliveryReliability(promisedTotal, promisedOnTime),
    // Budget is reported alongside, never folded into the ratio.
    hoursBudget: project.hoursBudget,
    budgetUsed: project.hoursBudget ? loggedHours / project.hoursBudget : null,
  };
}

/** Sum the raw parts of many projects, then divide once. */
function aggregate(projects) {
  const totals = projects.reduce(
    (acc, p) => ({
      promisedHours: acc.promisedHours + (p.promisedHours ?? 0),
      loggedHours: acc.loggedHours + (p.loggedHours ?? 0),
      billableHours: acc.billableHours + (p.billableHours ?? 0),
      promisedTotal: acc.promisedTotal + (p.promisedTotal ?? 0),
      promisedOnTime: acc.promisedOnTime + (p.promisedOnTime ?? 0),
      openItems: acc.openItems + (p.openItems ?? 0),
      overdueItems: acc.overdueItems + (p.overdueItems ?? 0),
    }),
    {
      promisedHours: 0, loggedHours: 0, billableHours: 0,
      promisedTotal: 0, promisedOnTime: 0, openItems: 0, overdueItems: 0,
    }
  );
  return {
    ...totals,
    projects: projects.length,
    activeProjects: projects.filter((p) => p.status !== 'Complete').length,
    atRisk: projects.filter((p) => p.status === 'Blocked' || p.status === 'At risk').length,
    hoursEfficiency: hoursEfficiency(totals.promisedHours, totals.loggedHours),
    deliveryReliability: deliveryReliability(totals.promisedTotal, totals.promisedOnTime),
  };
}

/** Rollup per rep (project owner), worst delivery reliability first. */
export function repRollup(projects = []) {
  const byRep = new Map();
  for (const p of projects) {
    const key = p.owner ?? 'Unassigned';
    if (!byRep.has(key)) byRep.set(key, []);
    byRep.get(key).push(p);
  }
  return [...byRep.entries()]
    .map(([rep, list]) => ({ rep, ...aggregate(list), projectList: list }))
    .sort(compareRollups);
}

/** Rollup per account, worst first — the account-centric view of the board. */
export function accountRollup(projects = []) {
  const byAccount = new Map();
  for (const p of projects) {
    const key = p.accountRecordId ?? 0;
    if (!byAccount.has(key)) {
      byAccount.set(key, { accountRecordId: p.accountRecordId, accountName: p.accountName, list: [] });
    }
    byAccount.get(key).list.push(p);
  }
  return [...byAccount.values()]
    .map((a) => ({
      accountRecordId: a.accountRecordId,
      accountName: a.accountName,
      ...aggregate(a.list),
      projectList: a.list,
    }))
    .sort(compareRollups);
}

/**
 * Attention-first ordering for both rollups: at-risk projects, then overdue
 * work, then the weakest reliability. Rows with nothing measurable sort last
 * rather than appearing to be perfect.
 */
export function compareRollups(a, b) {
  if (a.atRisk !== b.atRisk) return b.atRisk - a.atRisk;
  if (a.overdueItems !== b.overdueItems) return b.overdueItems - a.overdueItems;
  const aRel = a.deliveryReliability ?? 2;
  const bRel = b.deliveryReliability ?? 2;
  if (aRel !== bRel) return aRel - bRel;
  return (a.rep ?? a.accountName ?? '').localeCompare(b.rep ?? b.accountName ?? '');
}

/** 0.8912 → "89%". Null-safe, because "—" is the honest answer for no data. */
export function formatRatio(ratio) {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`;
}

/** Trim float noise from summed quarter-hours: 3.4999999 → "3.5". */
export function formatHours(hours) {
  if (hours == null) return '—';
  return String(Math.round(hours * 100) / 100);
}

/**
 * How to colour a rating. Thresholds are deliberately generous — PS estimates
 * are estimates, and flagging a 95% as a failure would train people to ignore
 * the colour entirely.
 */
export function ratingTone(ratio) {
  if (ratio == null) return 'neutral';
  if (ratio >= 0.95) return 'good';
  if (ratio >= 0.75) return 'warn';
  return 'bad';
}
