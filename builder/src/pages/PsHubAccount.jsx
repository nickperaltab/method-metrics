import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchPsAccount,
  updatePsAccount,
  updateCallPrep,
  updateAudit,
  createProjectNote,
  updateProjectNote,
  deleteProjectNote,
} from '../lib/psHub';

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE'];

function AccountHeader({ account, onChange }) {
  const [editing, setEditing] = useState(false);
  const [owner, setOwner] = useState(account.owner_email || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await updatePsAccount(account.id, { owner_email: owner || null });
      onChange({ ...account, ...updated });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    const updated = await updatePsAccount(account.id, { is_active: !account.is_active });
    onChange({ ...account, ...updated });
  }

  return (
    <div style={s.header}>
      <h1 style={s.title}>{account.name}</h1>
      <p style={s.subtitle}>
        {account.account_type}
        {account.is_dedicated ? ' · Dedicated' : ''}
        {' · '}
        <span style={{ color: account.is_active ? '#059669' : '#dc2626' }}>
          {account.is_active ? 'Active' : 'Inactive'}
        </span>
        <button style={s.tinyBtn} onClick={toggleActive}>
          {account.is_active ? 'Mark inactive' : 'Mark active'}
        </button>
      </p>
      <p style={s.subtitle}>
        Owner:{' '}
        {editing ? (
          <>
            <input
              style={s.input}
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="rep@method.me"
            />
            <button style={s.tinyBtn} onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button style={s.tinyBtn} onClick={() => { setEditing(false); setOwner(account.owner_email || ''); }}>Cancel</button>
          </>
        ) : (
          <>
            {account.owner_email || 'unassigned'}
            <button style={s.tinyBtn} onClick={() => setEditing(true)}>Edit</button>
          </>
        )}
      </p>
    </div>
  );
}

function CallPrepCard({ prep, onChange }) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(prep.summary || '');
  const [content, setContent] = useState(prep.content || '');
  const [depScore, setDepScore] = useState(prep.dep_score ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await updateCallPrep(prep.id, {
        summary,
        content,
        dep_score: depScore === '' ? null : Number(depScore),
      });
      onChange(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={s.card}>
        <label style={s.fieldLabel}>Summary</label>
        <input style={s.input} value={summary} onChange={(e) => setSummary(e.target.value)} />
        <label style={s.fieldLabel}>Content</label>
        <textarea style={s.textarea} rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
        <label style={s.fieldLabel}>DEP score</label>
        <input style={{ ...s.input, width: 100 }} type="number" value={depScore} onChange={(e) => setDepScore(e.target.value)} />
        <div style={s.actions}>
          <button style={s.tinyBtn} onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          <button style={s.tinyBtn} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.card}>
      <p style={s.meta}>
        {prep.call_date}
        {prep.dep_score != null ? ` · DEP ${prep.dep_score}` : ''}
        <button style={s.tinyBtn} onClick={() => setEditing(true)}>Edit</button>
      </p>
      <p style={s.cardSummary}>{prep.summary}</p>
      <pre style={s.pre}>{prep.content}</pre>
    </div>
  );
}

function AuditRow({ audit, onChange }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(audit.notes || '');
  const [totalScore, setTotalScore] = useState(audit.total_score ?? '');
  const [maxScore, setMaxScore] = useState(audit.max_score ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await updateAudit(audit.id, {
        notes,
        total_score: totalScore === '' ? null : Number(totalScore),
        max_score: maxScore === '' ? null : Number(maxScore),
      });
      onChange(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li style={{ ...s.listRow, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <span>{audit.audit_type} · {audit.call_date}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...s.input, width: 80 }} type="number" value={totalScore} onChange={(e) => setTotalScore(e.target.value)} placeholder="score" />
          <span>/</span>
          <input style={{ ...s.input, width: 80 }} type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder="max" />
        </div>
        <textarea style={s.textarea} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
        <div style={s.actions}>
          <button style={s.tinyBtn} onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          <button style={s.tinyBtn} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </li>
    );
  }

  return (
    <li style={s.listRow}>
      <span>{audit.audit_type} · {audit.call_date}</span>
      <span style={{ color: '#6b7280' }}>
        {audit.total_score != null && audit.max_score != null ? `${audit.total_score}/${audit.max_score}` : '—'}
        <button style={s.tinyBtn} onClick={() => setEditing(true)}>Edit</button>
      </span>
    </li>
  );
}

function NoteRow({ note, onChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(note.status);
  const [body, setBody] = useState(note.body || '');
  const [dueDate, setDueDate] = useState(note.due_date || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await updateProjectNote(note.id, { status, body, due_date: dueDate || null });
      onChange(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li style={{ ...s.listRow, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{note.title}</span>
        <select style={s.select} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <textarea style={s.textarea} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Notes" />
        <input style={s.input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <div style={s.actions}>
          <button style={s.tinyBtn} onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          <button style={s.tinyBtn} onClick={() => setEditing(false)}>Cancel</button>
          <button style={{ ...s.tinyBtn, color: '#dc2626' }} onClick={() => onDelete(note.id)}>Delete</button>
        </div>
      </li>
    );
  }

  return (
    <li style={s.listRow}>
      <span>{note.title}</span>
      <span style={{ color: '#6b7280' }}>
        {note.status}
        <button style={s.tinyBtn} onClick={() => setEditing(true)}>Edit</button>
      </span>
    </li>
  );
}

function NewNoteForm({ accountId, onCreated }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const created = await createProjectNote({ accountId, title, body, dueDate });
      onCreated(created);
      setTitle(''); setBody(''); setDueDate(''); setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return <button style={s.tinyBtn} onClick={() => setOpen(true)}>+ New note</button>;

  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      <input style={s.input} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea style={s.textarea} rows={3} placeholder="Notes" value={body} onChange={(e) => setBody(e.target.value)} />
      <input style={s.input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <div style={s.actions}>
        <button style={s.tinyBtn} onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        <button style={s.tinyBtn} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export default function PsHubAccount() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchPsAccount(id)
      .then(setAccount)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={s.layout}><div style={s.empty}>Loading account...</div></div>;
  if (error) return <div style={s.layout}><div style={{ ...s.empty, color: '#dc2626' }}>{error}</div></div>;
  if (!account) return <div style={s.layout}><div style={s.empty}>Account not found.</div></div>;

  const callPreps = [...(account.ps_call_preps || [])].sort((a, b) => b.call_date.localeCompare(a.call_date));
  const audits = [...(account.ps_audits || [])].sort((a, b) => b.call_date.localeCompare(a.call_date));
  const projectNotes = [...(account.ps_project_notes || [])].sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
  );
  const latestCallPrep = callPreps[0];

  function replaceCallPrep(updated) {
    setAccount((acc) => ({
      ...acc,
      ps_call_preps: acc.ps_call_preps.map((p) => (p.id === updated.id ? updated : p)),
    }));
  }

  function replaceAudit(updated) {
    setAccount((acc) => ({
      ...acc,
      ps_audits: acc.ps_audits.map((a) => (a.id === updated.id ? updated : a)),
    }));
  }

  function replaceNote(updated) {
    setAccount((acc) => ({
      ...acc,
      ps_project_notes: acc.ps_project_notes.map((n) => (n.id === updated.id ? updated : n)),
    }));
  }

  function addNote(created) {
    setAccount((acc) => ({ ...acc, ps_project_notes: [created, ...(acc.ps_project_notes || [])] }));
  }

  async function removeNote(noteId) {
    await deleteProjectNote(noteId);
    setAccount((acc) => ({ ...acc, ps_project_notes: acc.ps_project_notes.filter((n) => n.id !== noteId) }));
  }

  return (
    <div style={s.layout}>
      <Link to="/ps-hub" style={s.backLink}>← Accounts</Link>

      <AccountHeader account={account} onChange={setAccount} />

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Latest call prep</h2>
        {latestCallPrep ? (
          <CallPrepCard prep={latestCallPrep} onChange={replaceCallPrep} />
        ) : (
          <div style={s.empty}>No call preps yet.</div>
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Recent audits</h2>
        {audits.length === 0 ? (
          <div style={s.empty}>No audits yet.</div>
        ) : (
          <ul style={s.list}>
            {audits.map((audit) => (
              <AuditRow key={audit.id} audit={audit} onChange={replaceAudit} />
            ))}
          </ul>
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Project notes</h2>
        {projectNotes.length === 0 ? (
          <div style={s.empty}>No project notes yet.</div>
        ) : (
          <ul style={s.list}>
            {projectNotes.map((note) => (
              <NoteRow key={note.id} note={note} onChange={replaceNote} onDelete={removeNote} />
            ))}
          </ul>
        )}
        <div style={{ marginTop: 10 }}>
          <NewNoteForm accountId={account.id} onCreated={addNote} />
        </div>
      </section>
    </div>
  );
}

const s = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto' },
  backLink: { fontSize: 13, color: '#6b7280', textDecoration: 'none' },
  header: { margin: '8px 0 24px' },
  title: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0 },
  subtitle: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 10 },
  card: { background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  meta: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  cardSummary: { fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 10 },
  pre: { whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#374151', margin: 0 },
  list: { listStyle: 'none', margin: 0, padding: 0, border: '1px solid #e2e5e9', borderRadius: 8, overflow: 'hidden' },
  listRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #f1f3f5', fontSize: 13, color: '#374151' },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
  tinyBtn: { marginLeft: 10, background: 'none', border: 'none', color: '#059669', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: "'DM Sans', sans-serif", padding: 0 },
  input: { display: 'block', width: '100%', background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', padding: '6px 10px', borderRadius: 4, fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 },
  textarea: { display: 'block', width: '100%', background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', padding: '6px 10px', borderRadius: 4, fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 4, resize: 'vertical' },
  select: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', padding: '6px 10px', borderRadius: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif" },
  fieldLabel: { fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' },
  actions: { display: 'flex', gap: 8 },
};
