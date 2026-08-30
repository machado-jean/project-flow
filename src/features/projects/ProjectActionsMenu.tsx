import type { Project } from "../../domain/projects/project";

interface ProjectActionsMenuProps {
  readonly project: Project;
  readonly disabled: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onSave: (project: Project) => Promise<boolean>;
  readonly onMove: (projectId: string, direction: "up" | "down") => Promise<boolean>;
  readonly onDelete: (projectId: string) => Promise<boolean>;
  readonly onDuplicate: (projectId: string) => Promise<Project | null>;
}

export function ProjectActionsMenu({
  project,
  disabled,
  canMoveUp,
  canMoveDown,
  onSave,
  onMove,
  onDelete,
  onDuplicate,
}: ProjectActionsMenuProps) {
  const confirmDelete = (): void => {
    if (window.confirm(`Excluir definitivamente “${project.name}” e todas as suas tarefas? Esta ação não pode ser desfeita.`)) {
      void onDelete(project.id);
    }
  };

  return (
    <details className="workspace-menu project-actions-menu" name="workspace-menu">
      <summary>Projeto</summary>
      <div className="workspace-menu-popover project-actions-popover">
        <button type="button" disabled={disabled || !canMoveUp} onClick={() => { void onMove(project.id, "up"); }}>Mover para cima</button>
        <button type="button" disabled={disabled || !canMoveDown} onClick={() => { void onMove(project.id, "down"); }}>Mover para baixo</button>
        <hr />
        <button type="button" disabled={disabled} onClick={() => { void onDuplicate(project.id); }}>Duplicar projeto</button>
        <button type="button" disabled={disabled} onClick={() => { void onSave({ ...project, isArchived: !project.isArchived }); }}>
          {project.isArchived ? "Restaurar projeto" : "Arquivar projeto"}
        </button>
        <button className="danger-menu-item" type="button" disabled={disabled} onClick={confirmDelete}>Excluir projeto…</button>
      </div>
    </details>
  );
}
