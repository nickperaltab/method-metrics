// The project tracker's single data surface. Pages import from here, never from
// lib/projects.js or dev/mockStore.js directly.
//
// Reads always go through the real SQL builders + normalizers in lib/projects.js
// (in mock mode those queries resolve against the writable dev store, so an edit
// is visible on the next read). Writes only exist in mock mode today: the real
// backing store — a BigQuery table written by a routine, or a writable Supabase
// table — hasn't been chosen yet.
//
// When it is chosen, this file is the only place that changes: swap the write
// implementations, and every page, form and pure helper carries over untouched.

import { MOCK_MODE } from '../dev/mockMode';
import {
  fetchProjects,
  fetchProject,
  fetchProjectItems,
  fetchProjectEvents,
  fetchProjectWorkLog,
  fetchReps,
  fetchAccountOptions,
} from './projects';

/** True when the UI may offer create/edit controls at all. */
export const canWrite = MOCK_MODE;

/** Where the data is coming from, for the banner on the tracker screens. */
export const storeLabel = MOCK_MODE ? 'mock store (local, resets on demand)' : 'read-only';

class ReadOnlyStoreError extends Error {
  constructor(action) {
    super(
      `Can't ${action}: the project tracker has no writable store yet. ` +
      'Run the app with `npm run dev:mock` to use the editing flows against local sample data.'
    );
    this.name = 'ReadOnlyStoreError';
  }
}

// Writes are dynamically imported so the dev store — and the fixtures behind it —
// stay out of the production bundle even though this module ships.
async function writeApi(action) {
  if (!canWrite) throw new ReadOnlyStoreError(action);
  return import('../dev/mockStore.js');
}

// ── Reads ──────────────────────────────────────────────────────────────────

export const listProjects = () => fetchProjects();
export const getProject = (projectId) => fetchProject(projectId);
export const listItems = (projectId) => fetchProjectItems(projectId);
export const listEvents = (projectId) => fetchProjectEvents(projectId);
export const listWorkLog = (projectId) => fetchProjectWorkLog(projectId);
export const listReps = () => fetchReps();
export const listAccountOptions = () => fetchAccountOptions();

/** Everything the detail page needs, in one call. */
export async function getProjectBundle(projectId) {
  const [project, items, events, workLog] = await Promise.all([
    getProject(projectId),
    listItems(projectId),
    listEvents(projectId),
    listWorkLog(projectId),
  ]);
  return { project, items, events, workLog };
}

// ── Writes (mock only, for now) ────────────────────────────────────────────

export async function createProject(input) {
  const api = await writeApi('create a project');
  return api.createProject(input);
}

/**
 * Patch a project. When the owner changes and `createHandoff` is set, a handoff
 * packet is created too — carrying the open and promised counts as they stand at
 * the moment of the reassignment, which is the part that makes it worth reading.
 */
export async function updateProject(projectId, patch, { createHandoff = false, previousOwner } = {}) {
  const api = await writeApi('edit a project');
  const project = api.updateProject(projectId, patch);
  let handoff = null;
  if (createHandoff && patch.owner && patch.owner !== previousOwner) {
    handoff = api.createHandoff({
      projectId,
      outgoingRep: previousOwner,
      incomingRep: patch.owner,
    });
  }
  return { project, handoff };
}

export async function addRep(rep) {
  const api = await writeApi('add a rep');
  return api.createRep(rep);
}

export async function logWork(input) {
  const api = await writeApi('log work');
  return api.createWorkEntry(input);
}

export async function updateWork(entryId, patch) {
  const api = await writeApi('edit a work entry');
  return api.updateWorkEntry(entryId, patch);
}

export async function deleteWork(entryId) {
  const api = await writeApi('delete a work entry');
  return api.deleteWorkEntry(entryId);
}

export async function addItem(input) {
  const api = await writeApi('add a work item');
  return api.createItem(input);
}

export async function updateItem(itemId, patch) {
  const api = await writeApi('edit a work item');
  return api.updateItem(itemId, patch);
}

/** Throw away local edits and reseed from the fixtures. Mock only. */
export async function resetSampleData() {
  const api = await writeApi('reset the sample data');
  return api.resetStore();
}
