// Log a work session against a project (and optionally a specific work item).
//
// The notes body is markdown. Two affordances make that painless rather than a
// chore: the editor starts from a section template, and "Tidy up" reformats
// whatever got pasted in — Zoom bullets, "Next steps:" lines, ragged blank
// lines — into consistent markdown. Tidy up reformats only; it never rewrites,
// summarises or reorders, so every line you pasted is still there afterwards.

import { useMemo, useState } from 'react';
import { WORK_LOG_TEMPLATE, formatNotes } from '../../lib/markdown';
import { localToday } from '../../lib/projects';
import { logWork, updateWork } from '../../lib/projectsStore';
import MarkdownBody from './MarkdownBody';
import { s, Field, RequiredLegend, FormError } from './ui';

const BILLABLE_OPTIONS = ['Billable', 'Non-billable', 'Internal'];

export default function WorkLogForm({
  project,
  items = [],
  entry = null,
  defaultAuthor,
  onSaved,
  onCancel,
}) {
  const editing = Boolean(entry);
  const [form, setForm] = useState(() => ({
    workDate: entry?.workDate ?? localToday(),
    itemId: entry?.itemId ?? '',
    hours: entry?.hours == null ? '' : String(entry.hours),
    billable: entry?.billable ?? 'Billable',
    author: entry?.author ?? defaultAuthor ?? project.owner ?? '',
    summary: entry?.summary ?? '',
    notesMd: entry?.notesMd ?? WORK_LOG_TEMPLATE,
  }));
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Open items first — you almost always log against something outstanding.
  const itemOptions = useMemo(() => {
    const open = items.filter((i) => i.isOpen);
    const done = items.filter((i) => !i.isOpen);
    return [...open, ...done];
  }, [items]);

  function onTidy() {
    setForm((f) => ({ ...f, notesMd: formatNotes(f.notesMd) }));
  }

  // Destructive: throws away a write-up that may have been pasted and tidied.
  function onResetTemplate() {
    const written = form.notesMd.trim() && form.notesMd.trim() !== WORK_LOG_TEMPLATE.trim();
    if (written && !window.confirm('Replace your notes with the blank template?')) return;
    setForm((f) => ({ ...f, notesMd: WORK_LOG_TEMPLATE }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const hours = Number(form.hours);
    if (!Number.isFinite(hours) || hours <= 0) { setError('Hours must be a positive number.'); return; }
    if (!form.summary.trim()) { setError('Add a one-line summary.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        projectId: project.projectId,
        itemId: form.itemId || null,
        workDate: form.workDate,
        author: form.author,
        hours,
        billable: form.billable,
        summary: form.summary.trim(),
        notesMd: form.notesMd,
      };
      const saved = editing
        ? await updateWork(entry.entryId, payload)
        : await logWork(payload);
      onSaved?.(saved);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  const linkedItem = items.find((i) => i.itemId === form.itemId);

  return (
    <form onSubmit={onSubmit} style={{ ...s.card, marginBottom: 16 }}>
      <RequiredLegend />
      <div style={s.row3}>
        <Field label="Date">
          <input type="date" style={s.input} value={form.workDate} onChange={set('workDate')} />
        </Field>
        <Field label="Hours" required>
          <input style={s.input} value={form.hours} onChange={set('hours')} placeholder="1.5" />
        </Field>
        <Field label="Billable">
          <select style={s.input} value={form.billable} onChange={set('billable')}>
            {BILLABLE_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
      </div>

      {/* Unlinked hours count toward the project total but aren't attributed to any
          item, which is why the per-item rows don't sum to the project headline. */}
      <Field
        label="Work item"
        hint={linkedItem?.estimateHours != null
          ? `${linkedItem.estimateHours}h promised for this item.`
          : 'Leave unlinked for project-level work.'}
      >
        <select style={s.input} value={form.itemId} onChange={set('itemId')}>
          <option value="">Project-level work</option>
          {itemOptions.map((i) => (
            <option key={i.itemId} value={i.itemId}>
              {i.isOpen ? '' : '✓ '}{i.title}{i.estimateHours != null ? ` (${i.estimateHours}h promised)` : ''}
            </option>
          ))}
        </select>
      </Field>

      <div style={s.row2}>
        <Field label="Summary" required>
          <input
            style={s.input}
            value={form.summary}
            onChange={set('summary')}
            placeholder="e.g. Built the invoice approval screen"
          />
        </Field>
        <Field label="Logged by">
          <input style={s.input} value={form.author} onChange={set('author')} />
        </Field>
      </div>

      <div style={s.field}>
        <div style={{ ...s.controls, marginBottom: 8 }}>
          {/* This label bypasses Field (the toolbar sits on the same row), so it
              binds to the textarea by hand. */}
          <label style={{ ...s.label, marginBottom: 0 }} htmlFor="worklog-notes">Notes (markdown)</label>
          <span style={s.spacer} />
          <button type="button" className="tk-focus" style={preview ? s.chip : s.chipOn} onClick={() => setPreview(false)} aria-pressed={!preview}>Write</button>
          <button type="button" className="tk-focus" style={preview ? s.chipOn : s.chip} onClick={() => setPreview(true)} aria-pressed={preview}>Preview</button>
          <button type="button" className="tk-focus" style={s.chip} onClick={onTidy} title="Reformat pasted notes into markdown">
            Tidy up
          </button>
          <button
            type="button"
            className="tk-focus"
            style={s.chip}
            onClick={onResetTemplate}
          >
            Reset to template
          </button>
        </div>

        {preview ? (
          <div style={{ ...s.card, minHeight: 260 }}>
            {form.notesMd.trim()
              ? <MarkdownBody markdown={form.notesMd} />
              : <span style={s.muted}>Nothing to preview yet.</span>}
          </div>
        ) : (
          <textarea
            id="worklog-notes"
            style={s.textarea}
            value={form.notesMd}
            onChange={set('notesMd')}
            placeholder="Paste your raw notes here, then hit Tidy up"
          />
        )}
        {/* What Tidy up does mechanically — unicode bullets to `-`, section labels to
            headings, blank-line runs collapsed, words never altered — is documented in
            formatNotes() and in this file's header. */}
        <div style={s.hint}>
          Markdown: headings, bullets, <code>**bold**</code>, <code>`code`</code>, links.
        </div>
      </div>

      <FormError>{error}</FormError>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="tk-focus" style={s.primary} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Log work'}
        </button>
        <button type="button" className="tk-focus" style={s.secondary} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
