import { useState } from "react";

import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectStatus,
} from "../../domain/projects/project";

interface ProjectHeaderProps {
  readonly project: Project;
  readonly taskCount: number;
  readonly disabled: boolean;
  readonly onSave: (project: Project) => Promise<boolean>;
}

export function ProjectHeader({
  project,
  taskCount,
  disabled,
  onSave,
}: ProjectHeaderProps) {
  const [draft, setDraft] = useState(project);
  const [dirty, setDirty] = useState(false);

  const updateDraft = (patch: Partial<Project>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    if (await onSave(draft)) setDirty(false);
  };

  return (
    <header className="project-header">
      <div className="project-heading-fields">
        <label className="sr-only" htmlFor="project-name">Nome do projeto</label>
        <input id="project-name" className="project-name-input" value={draft.name} disabled={disabled} onChange={(event) => { updateDraft({ name: event.target.value }); }} />
        <label className="sr-only" htmlFor="project-description">Descrição do projeto</label>
        <input id="project-description" className="project-description-input" placeholder="Adicione uma descrição ao projeto" value={draft.description ?? ""} disabled={disabled} onChange={(event) => { updateDraft({ description: event.target.value || null }); }} />
        <span className="project-meta">{taskCount} {taskCount === 1 ? "tarefa" : "tarefas"}</span>
      </div>

      <div className="project-header-actions">
        <label>
          <span className="sr-only">Status do projeto</span>
          <select value={draft.status} disabled={disabled} onChange={(event) => { updateDraft({ status: event.target.value as ProjectStatus }); }}>
            {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>)}
          </select>
        </label>
        {dirty ? <button className="primary-button" type="button" disabled={disabled} onClick={() => void save()}>Salvar projeto</button> : null}
      </div>
    </header>
  );
}
