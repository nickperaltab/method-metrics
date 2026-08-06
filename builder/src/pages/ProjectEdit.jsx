// Edit project — Route: #/projects/:projectId/edit
// Same form as the new-project screen, prefilled. Reassigning the owner here is
// what offers to create a handoff document.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { canWrite, getProject } from '../lib/projectsStore';
import ProjectForm from '../components/projects/ProjectForm';
import { s } from '../components/projects/ui';

export default function ProjectEdit() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [handoffNotice, setHandoffNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getProject(projectId)
      .then((p) => { if (!cancelled) setProject(p); })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [projectId]);

  const back = `#/projects/${encodeURIComponent(projectId)}`;

  if (!canWrite) {
    return (
      <div style={s.wrapNarrow}>
        <a href={back} className="tk-focus" style={s.back}>← Back to project</a>
        {/* See ProjectNew.jsx — same reasoning, same audience. */}
        <div style={s.error}>Editing projects isn’t available yet.</div>
      </div>
    );
  }

  if (error) return <div style={s.wrapNarrow}><div style={s.error}>Couldn’t load this project: {error}</div></div>;
  if (!project) return <div style={s.wrapNarrow}><div style={s.note}>Loading project…</div></div>;

  // After a reassignment that created a handoff, confirm it before leaving —
  // silently navigating away would hide the fact that a document now exists.
  if (handoffNotice) {
    return (
      <div style={s.wrapNarrow}>
        <h1 style={s.title}>Reassigned</h1>
        {/* The packet is logged to the project activity and listed on /handoffs —
            the buttons below already point at both, so it isn't spelled out. */}
        <div style={{ ...s.banner, color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
          <strong>{project.projectName}</strong> is now owned by {handoffNotice.incoming_rep}.
          Draft handoff created: {handoffNotice.open_in_progress} open,{' '}
          {handoffNotice.open_promised} promised.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={`#/projects/${encodeURIComponent(projectId)}`}
            className="tk-focus"
            style={{ ...s.primary, textDecoration: 'none', display: 'inline-block' }}
          >
            Back to project
          </a>
          <a
            href="#/handoffs"
            className="tk-focus"
            style={{ ...s.secondary, textDecoration: 'none', display: 'inline-block' }}
          >
            Open handoffs
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrapNarrow}>
      <a href={back} className="tk-focus" style={s.back}>← Back to project</a>
      <h1 style={{ ...s.title, marginTop: 12 }}>Edit {project.projectName}</h1>
      {/* A phase change is logged to the lifecycle timeline; an owner change offers a
          handoff document. Both are self-evident when they happen. */}
      <p style={s.sub}>{project.accountName} · {project.projectId}</p>
      <ProjectForm
        project={project}
        onSaved={(saved, { handoff }) => {
          if (handoff) setHandoffNotice(handoff);
          else navigate(`/projects/${encodeURIComponent(saved.project_id)}`);
        }}
        onCancel={() => navigate(`/projects/${encodeURIComponent(projectId)}`)}
      />
    </div>
  );
}
