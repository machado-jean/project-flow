import { useState, type SyntheticEvent } from "react";

import { PROJECT_STATUS_LABELS, type Project } from "../../domain/projects/project";

interface ProjectSidebarProps {
  readonly projects: readonly Project[];
  readonly selectedProjectId: string | null;
  readonly disabled: boolean;
  readonly onSelect: (projectId: string) => void;
  readonly onCreate: (input: {
    readonly name: string;
    readonly description: string | null;
  }) => Promise<unknown>;
}

export function ProjectSidebar({
  projects,
  selectedProjectId,
  disabled,
  onSelect,
  onCreate,
}: ProjectSidebarProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const visibleProjects = projects.filter((project) => showArchived || !project.isArchived);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const created = await onCreate({ name, description: description || null });
    if (created !== null) {
      setName("");
      setDescription("");
      setShowCreateForm(false);
    }
  };

  return (
    <aside className="project-sidebar" aria-label="Projetos">
      <div className="brand-block">
        <span className="brand-mark" aria-hidden="true">PF</span>
        <div><strong>ProjectFlow</strong><span>Planejamento local</span></div>
      </div>

      <div className="sidebar-heading">
        <h2>Projetos</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Criar projeto"
          title="Criar projeto"
          disabled={disabled}
          onClick={() => { setShowCreateForm((visible) => !visible); }}
        >+</button>
      </div>

      {showCreateForm ? (
        <form className="create-project-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Nome
            <input autoFocus required value={name} disabled={disabled} onChange={(event) => { setName(event.target.value); }} />
          </label>
          <label>
            Descrição
            <textarea rows={2} value={description} disabled={disabled} onChange={(event) => { setDescription(event.target.value); }} />
          </label>
          <div className="form-actions">
            <button className="primary-button compact" type="submit" disabled={disabled}>Criar</button>
            <button className="text-button" type="button" onClick={() => { setShowCreateForm(false); }}>Cancelar</button>
          </div>
        </form>
      ) : null}

      <nav className="project-list" aria-label="Lista de projetos">
        {visibleProjects.length === 0 ? <p className="sidebar-empty">Nenhum projeto nesta lista.</p> : visibleProjects.map((project) => (
          <button
            className={project.id === selectedProjectId ? "project-item selected" : "project-item"}
            type="button"
            key={project.id}
            onClick={() => { onSelect(project.id); }}
          >
            <span className="project-color" aria-hidden="true" />
            <span>
              <strong>{project.name}</strong>
              <small>{PROJECT_STATUS_LABELS[project.status]}{project.isArchived ? " · Arquivado" : ""}</small>
            </span>
          </button>
        ))}
      </nav>

      <label className="archive-toggle">
        <input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); }} />
        Mostrar arquivados
      </label>
    </aside>
  );
}
