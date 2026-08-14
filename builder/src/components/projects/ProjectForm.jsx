// Create / edit a project. Used by both /projects/new and /projects/:id/edit —
// one form, because a create and an edit differ only in what's prefilled and
// whether the customer can still be changed.
//
// Reassignment: changing the owner offers to create a handoff document, checked
// by default. It's a prompt rather than automatic so a correction (wrong owner
// typed at creation) doesn't leave a bogus handoff packet behind.

import { useEffect, useMemo, useState } from 'react';
import {
  PROJECT_PHASES,
  PROJECT_STATUSES,
  localToday,
} from '../../lib/projects';
import {
  listAccountOptions,
  listReps,
  createProject,
  updateProject,
  addRep,
} from '../../lib/projectsStore';
import { s, Field, RequiredLegend, FormError } from './ui';

const EMPTY = {
  accountRecordId: '',
  accountName: '',
  projectName: '',
  phase: 'Discovery',
  status: 'On track',
  owner: '',
  kickoffDate: '',
  targetDate: '',
  goLiveDate: '',
  nextAction: '',
  nextActionDue: '',
  hoursBudget: '',
  riskNote: '',
  jiraKey: '',
  docLink: '',
};

function initialForm(project, defaultOwner) {
  if (!project) return { ...EMPTY, kickoffDate: localToday(), owner: defaultOwner ?? '' };
  return {
    accountRecordId: String(project.accountRecordId ?? ''),
    accountName: project.accountName ?? '',
    projectName: project.projectName ?? '',
    phase: project.phase ?? 'Discovery',
    status: project.status ?? 'On track',
    owner: project.owner ?? '',
    kickoffDate: project.kickoffDate ?? '',
    targetDate: project.targetDate ?? '',
    goLiveDate: project.goLiveDate ?? '',
    nextAction: project.nextAction ?? '',
    nextActionDue: project.nextActionDue ?? '',
    hoursBudget: project.hoursBudget == null ? '' : String(project.hoursBudget),
    riskNote: project.riskNote ?? '',
    jiraKey: project.jiraKey ?? '',
    docLink: project.docLink ?? '',
  };
}

export default function ProjectForm({ project = null, defaultOwner, onSaved, onCancel }) {
  const editing = Boolean(project);
  const [form, setForm] = useState(() => initialForm(project, defaultOwner));
  const [accounts, setAccounts] = useState([]);
  const [reps, setReps] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [makeHandoff, setMakeHandoff] = useState(true);
  const [showNewRep, setShowNewRep] = useState(false);
  const [newRep, setNewRep] = useState({ name: '', email: '', role: 'Consultant' });

  const originalOwner = project?.owner ?? null;
  const ownerChanged = editing && form.owner !== originalOwner;

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAccountOptions(), listReps()])
      .then(([accountRows, repRows]) => {
        if (cancelled) return;
        setAccounts(accountRows);
        setReps(repRows);
      })
      .catch((e) => { if (!cancelled) setLoadError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const accountLabel = useMemo(() => {
    const match = accounts.find((a) => String(a.accountRecordId) === form.accountRecordId);
    return match?.accountName ?? form.accountName;
  }, [accounts, form.accountRecordId, form.accountName]);

  function onAccountChange(e) {
    const id = e.target.value;
    const match = accounts.find((a) => String(a.accountRecordId) === id);
    setForm((f) => ({ ...f, accountRecordId: id, accountName: match?.accountName ?? '' }));
  }

  async function onAddRep() {
    const name = newRep.name.trim();
    if (!name) { setError('Enter a name for the new consultant.'); return; }
    try {
      const created = await addRep(newRep);
      const rows = await listReps();
      setReps(rows);
      setForm((f) => ({ ...f, owner: created.name }));
      setNewRep({ name: '', email: '', role: 'Consultant' });
      setShowNewRep(false);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  function validate() {
    if (!form.projectName.trim()) return 'Give the project a title.';
    if (!form.accountRecordId) return 'Pick a customer.';
    if (!form.owner) return 'Pick an owner.';
    if (form.targetDate && form.kickoffDate && form.targetDate < form.kickoffDate) {
      return 'Target date must be on or after the kickoff date.';
    }
    if (form.hoursBudget && !(Number(form.hoursBudget) > 0)) {
      return 'Quoted hours must be a positive number.';
    }
    if (form.docLink && !/^https?:\/\//i.test(form.docLink)) {
      return 'The doc link must start with http:// or https://';
    }
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        accountRecordId: Number(form.accountRecordId),
        accountName: accountLabel,
        projectName: form.projectName.trim(),
        hoursBudget: form.hoursBudget === '' ? null : Number(form.hoursBudget),
      };
      if (editing) {
        const { project: saved, handoff } = await updateProject(project.projectId, payload, {
          createHandoff: ownerChanged && makeHandoff,
          previousOwner: originalOwner,
        });
        onSaved?.(saved, { handoff });
      } else {
        const saved = await createProject(payload);
        onSaved?.(saved, {});
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <div style={s.error}>Couldn’t load the customer and rep lists: {loadError}</div>;
  }

  return (
    <form onSubmit={onSubmit}>
      <RequiredLegend />
      {/* Customer is fixed after creation so the delivered-vs-promised history stays
          with the right account; account options come from the call-prep snapshots,
          which is the closest thing PS has to an account list. Neither fact is
          actionable for the person filling in the form. */}
      <Field
        label="Customer"
        required={!editing}
        hint={editing ? 'Can’t be changed after creation.' : null}
      >
        {editing ? (
          // readOnly rather than disabled: a disabled input is skipped by Tab and
          // largely opaque to screen readers, so the customer would be unreadable.
          <input style={{ ...s.input, background: '#f6f7f8' }} value={accountLabel} readOnly aria-readonly="true" />
        ) : (
          <select style={{ ...s.input }} value={form.accountRecordId} onChange={onAccountChange}>
            <option value="">Select a customer…</option>
            {accounts.map((a) => (
              <option key={a.accountRecordId} value={a.accountRecordId}>
                {a.accountName} (#{a.accountRecordId})
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Project title" required>
        <input
          style={s.input}
          value={form.projectName}
          onChange={set('projectName')}
          placeholder="e.g. Order-to-cash rebuild"
        />
      </Field>

      <div style={s.row2}>
        <Field label="Phase">
          <select style={s.input} value={form.phase} onChange={set('phase')}>
            {PROJECT_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select style={s.input} value={form.status} onChange={set('status')}>
            {PROJECT_STATUSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </div>

      {/* The select is Field's only child so the label binds to it; the add button
          sits alongside rather than inside. The "changing the owner from X to Y" hint
          is gone — the checkbox row below says the same thing. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Field label="Owner" required>
            <select style={s.input} value={form.owner} onChange={set('owner')}>
              <option value="">Select a consultant…</option>
              {reps.map((r) => (
                <option key={r.repId} value={r.name}>{r.name}{r.role ? ` — ${r.role}` : ''}</option>
              ))}
            </select>
          </Field>
        </div>
        <button
          type="button"
          className="tk-focus"
          style={{ ...s.secondary, marginBottom: 16 }}
          onClick={() => setShowNewRep((v) => !v)}
        >
          {showNewRep ? 'Close' : '+ New consultant'}
        </button>
      </div>

      {showNewRep && (
        <div style={{ ...s.card, marginBottom: 16 }}>
          <div style={s.row3}>
            <Field label="Name">
              <input
                style={s.input}
                value={newRep.name}
                onChange={(e) => setNewRep((r) => ({ ...r, name: e.target.value }))}
                placeholder="Full name"
              />
            </Field>
            <Field label="Email">
              <input
                style={s.input}
                value={newRep.email}
                onChange={(e) => setNewRep((r) => ({ ...r, email: e.target.value }))}
                placeholder="first.last@method.me"
              />
            </Field>
            <Field label="Role">
              <input
                style={s.input}
                value={newRep.role}
                onChange={(e) => setNewRep((r) => ({ ...r, role: e.target.value }))}
              />
            </Field>
          </div>
          <button type="button" className="tk-focus" style={s.primary} onClick={onAddRep}>
            Add consultant
          </button>
        </div>
      )}

      {ownerChanged && (
        <div style={s.checkRow}>
          <input
            id="make-handoff"
            type="checkbox"
            checked={makeHandoff}
            onChange={(e) => setMakeHandoff(e.target.checked)}
          />
          {/* The packet captures the open/promised counts at this moment, logs a
              Handoff event and appears on /handoffs — all plumbing the user doesn't
              need described. What they need is when NOT to tick it. */}
          <label htmlFor="make-handoff" style={{ fontSize: 14, color: '#374151', lineHeight: 1.45 }}>
            <strong>Create a Draft handoff</strong>: {originalOwner ?? 'unassigned'} → {form.owner}
            <div style={s.hint}>Uncheck if you’re just fixing a typo.</div>
          </label>
        </div>
      )}

      <div style={s.row3}>
        <Field label="Kickoff">
          <input type="date" style={s.input} value={form.kickoffDate ?? ''} onChange={set('kickoffDate')} />
        </Field>
        <Field label="Target">
          <input type="date" style={s.input} value={form.targetDate ?? ''} onChange={set('targetDate')} />
        </Field>
        <Field label="Went live">
          <input type="date" style={s.input} value={form.goLiveDate ?? ''} onChange={set('goLiveDate')} />
        </Field>
      </div>

      <div style={s.row2}>
        <Field label="Next action">
          <input
            style={s.input}
            value={form.nextAction}
            onChange={set('nextAction')}
            placeholder="The one thing that moves this forward"
          />
        </Field>
        <Field label="Next action due">
          <input type="date" style={s.input} value={form.nextActionDue ?? ''} onChange={set('nextActionDue')} />
        </Field>
      </div>

      <div style={s.row3}>
        {/* Distinct from per-item promised hours, which are what efficiency divides. */}
        <Field label="Quoted hours" hint="Total hours quoted for the engagement.">
          <input style={s.input} value={form.hoursBudget} onChange={set('hoursBudget')} placeholder="60" />
        </Field>
        <Field label="JIRA key">
          <input style={s.input} value={form.jiraKey} onChange={set('jiraKey')} placeholder="PS-4182" />
        </Field>
        <Field label="Doc link">
          <input style={s.input} value={form.docLink} onChange={set('docLink')} placeholder="https://…" />
        </Field>
      </div>

      <Field label="Risk note" hint="Shown as a callout on the project page.">
        <textarea
          style={{ ...s.textarea, minHeight: 90 }}
          value={form.riskNote}
          onChange={set('riskNote')}
          placeholder="What could derail this"
        />
      </Field>

      <FormError>{error}</FormError>

      <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
        <button type="submit" className="tk-focus" style={s.primary} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
        </button>
        <button type="button" className="tk-focus" style={s.secondary} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
