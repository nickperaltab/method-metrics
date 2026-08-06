// Add / edit a work item. `estimateHours` is the promise the efficiency numbers
// measure against, and `isPromised` is the commitment delivery reliability
// scores — both are called out in the form so they don't read as bookkeeping.

import { useState } from 'react';
import { ITEM_STATUSES, ITEM_TYPES } from '../../lib/projects';
import { addItem, updateItem } from '../../lib/projectsStore';
import { s, Field, RequiredLegend, FormError } from './ui';

const PRIORITIES = ['High', 'Normal', 'Low'];

export default function ItemForm({ project, item = null, reps = [], onSaved, onCancel }) {
  const editing = Boolean(item);
  const [form, setForm] = useState(() => ({
    title: item?.title ?? '',
    itemType: item?.itemType ?? 'Task',
    status: item?.status ?? 'New Intake',
    owner: item?.owner ?? project.owner ?? '',
    priority: item?.priority ?? 'Normal',
    dueDate: item?.dueDate ?? '',
    estimateHours: item?.estimateHours == null ? '' : String(item.estimateHours),
    isPromised: item?.isPromised ?? false,
    caseRef: item?.caseRef ?? '',
    notes: item?.notes ?? '',
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Give the item a title.'); return; }
    if (form.estimateHours !== '' && !(Number(form.estimateHours) > 0)) {
      setError('Promised hours must be a positive number.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        projectId: project.projectId,
        title: form.title.trim(),
        estimateHours: form.estimateHours === '' ? null : Number(form.estimateHours),
        dueDate: form.dueDate || null,
      };
      const saved = editing ? await updateItem(item.itemId, payload) : await addItem(payload);
      onSaved?.(saved);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ ...s.card, marginBottom: 16, background: '#fafbfc' }}>
      <RequiredLegend />
      <Field label="Title" required>
        <input style={s.input} value={form.title} onChange={set('title')} placeholder="What needs doing" />
      </Field>

      <div style={s.row3}>
        <Field label="Type">
          <select style={s.input} value={form.itemType} onChange={set('itemType')}>
            {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select style={s.input} value={form.status} onChange={set('status')}>
            {ITEM_STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select style={s.input} value={form.priority} onChange={set('priority')}>
            {PRIORITIES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>

      <div style={s.row3}>
        <Field label="Owner">
          <select style={s.input} value={form.owner} onChange={set('owner')}>
            <option value="">Unassigned</option>
            {reps.map((r) => <option key={r.repId} value={r.name}>{r.name}</option>)}
            {/* An owner set before this rep existed still has to render. */}
            {form.owner && !reps.some((r) => r.name === form.owner) && (
              <option value={form.owner}>{form.owner}</option>
            )}
          </select>
        </Field>
        <Field label="Due">
          <input type="date" style={s.input} value={form.dueDate ?? ''} onChange={set('dueDate')} />
        </Field>
        {/* Efficiency divides this by the hours logged against the item. */}
        <Field
          label="Promised hours"
          hint="What you told the customer this would take."
        >
          <input style={s.input} value={form.estimateHours} onChange={set('estimateHours')} placeholder="4" />
        </Field>
      </div>

      <div style={s.checkRow}>
        <input
          id={`promised-${item?.itemId ?? 'new'}`}
          type="checkbox"
          checked={form.isPromised}
          onChange={(e) => setForm((f) => ({ ...f, isPromised: e.target.checked }))}
        />
        <label htmlFor={`promised-${item?.itemId ?? 'new'}`} style={{ fontSize: 14, color: '#374151' }}>
          <strong>Committed to the customer</strong>
          {/* Scores only when closed on or before the due date — open or late doesn't. */}
          <div style={s.hint}>Counts toward delivery reliability.</div>
        </label>
      </div>

      <div style={s.row2}>
        <Field label="Case ref">
          <input style={s.input} value={form.caseRef} onChange={set('caseRef')} placeholder="Method case id" />
        </Field>
        <Field label="Context">
          <input style={s.input} value={form.notes} onChange={set('notes')} placeholder="Worth keeping in mind" />
        </Field>
      </div>

      <FormError>{error}</FormError>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="tk-focus" style={s.primary} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create work item'}
        </button>
        <button type="button" className="tk-focus" style={s.secondary} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
