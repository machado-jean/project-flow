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
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onSave: (project: Project) => Promise<boolean>;
  readonly onMove: (projectId: string, direction: "up" | "down") => Promise<boolean>;
  readonly onDelete: (projectId: string) => Promise<boolean>;
  readonly onDuplicate: (projectId: string) => Promise<Project | null>;
}

export function ProjectHeader({
  project,
  taskCount,
  disabled,
  canMoveUp,
  canMoveDown,
  onSave,
  onMove,
  onDelete,
  onDuplicate,
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

  const confirmDelete = async (): Promise<void> => {
    if (window.confirm(`Excluir definitivamente “${project.name}” e todas as suas tarefas? Esta ação não pode ser desfeita.`)) {
      await onDelete(project.id);
    }
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
        <div className="order-buttons" aria-label="Ordenação do projeto">
          <button type="button" disabled={disabled || !canMoveUp} aria-label="Mover projeto para cima" title="Mover projeto para cima" onClick={() => { void onMove(project.id, "up"); }}>↑</button>
          <button type="button" disabled={disabled || !canMoveDown} aria-label="Mover projeto para baixo" title="Mover projeto para baixo" onClick={() => { void onMove(project.id, "down"); }}>↓</button>
        </div>
        <label>
          <span className="sr-only">Status do projeto</span>
          <select value={draft.status} disabled={disabled} onChange={(event) => { updateDraft({ status: event.target.value as ProjectStatus }); }}>
            {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>)}
          </select>
        </label>
        {dirty ? <button className="primary-button" type="button" disabled={disabled} onClick={() => void save()}>Salvar projeto</button> : null}
        <button className="secondary-button" type="button" disabled={disabled} onClick={() => { void onDuplicate(project.id); }}>Duplicar projeto</button>
        <button className="secondary-button" type="button" disabled={disabled} onClick={() => { void onSave({ ...project, isArchived: !project.isArchived }); }}>
          {project.isArchived ? "Restaurar" : "Arquivar"}
        </button>
        <button className="danger-button" type="button" disabled={disabled} onClick={() => void confirmDelete()}>Excluir</button>
      </div>
    </header>
  );
}
