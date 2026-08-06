// New project — Route: #/projects/new
// Thin wrapper: the form itself is shared with the edit screen.

import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { canWrite } from '../lib/projectsStore';
import ProjectForm from '../components/projects/ProjectForm';
import { s } from '../components/projects/ui';

export default function ProjectNew() {
  const navigate = useNavigate();
  const { currentUser } = useUser();

  if (!canWrite) {
    return (
      <div style={s.wrapNarrow}>
        <a href="#/projects" className="tk-focus" style={s.back}>← Projects</a>
        <h1 style={{ ...s.title, marginTop: 12 }}>New project</h1>
        {/* `npm run dev:mock` is the developer path — see docs/ps-project-tracker.md.
            The audience for this message is the one that can't run it. */}
        <div style={s.error}>Creating projects isn’t available yet.</div>
      </div>
    );
  }

  return (
    <div style={s.wrapNarrow}>
      <a href="#/projects" className="tk-focus" style={s.back}>← Projects</a>
      <h1 style={{ ...s.title, marginTop: 12 }}>New project</h1>
      <p style={s.sub}>
        Work items, promised hours and the work log get added on the project page.
      </p>
      <ProjectForm
        defaultOwner={currentUser?.name}
        onSaved={(project) => navigate(`/projects/${encodeURIComponent(project.project_id)}`)}
        onCancel={() => navigate('/projects')}
      />
    </div>
  );
}
