import { useMemo, useRef, useState, type SyntheticEvent } from "react";

import {
  collectTaskTreeIds,
  flattenVisibleTasks,
  type VisibleTask,
} from "../../domain/tasks/hierarchy";
import {
  SCHEDULING_MODES,
  SCHEDULING_MODE_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type SchedulingMode,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../../domain/tasks/task";

interface TaskTableProps {
  readonly tasks: readonly Task[];
  readonly disabled: boolean;
  readonly onCreate: (input: {
    readonly title: string;
    readonly parentId: string | null;
  }) => Promise<Task | null>;
  readonly onSave: (task: Task) => Promise<boolean>;
  readonly onMove: (taskId: string, direction: "up" | "down") => Promise<boolean>;
  readonly onDelete: (taskId: string) => Promise<boolean>;
}

interface TaskRowProps {
  readonly row: VisibleTask;
  readonly tasks: readonly Task[];
  readonly selected: boolean;
  readonly expanded: boolean;
  readonly disabled: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onSelect: (selected: boolean) => void;
  readonly onToggleExpanded: () => void;
  readonly onPrepareSubtask: () => void;
  readonly onSave: (task: Task) => Promise<boolean>;
  readonly onMove: (direction: "up" | "down") => void;
  readonly onDelete: () => void;
}

function TaskRow({
  row,
  tasks,
  selected,
  expanded,
  disabled,
  canMoveUp,
  canMoveDown,
  onSelect,
  onToggleExpanded,
  onPrepareSubtask,
  onSave,
  onMove,
  onDelete,
}: TaskRowProps) {
  const [draft, setDraft] = useState(row.task);
  const [tagsText, setTagsText] = useState(row.task.tags.join(", "));
  const [dirty, setDirty] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const invalidParentIds = useMemo(
    () => collectTaskTreeIds(tasks, row.task.id),
    [row.task.id, tasks],
  );
  const parentOptions = tasks.filter((task) => !invalidParentIds.has(task.id));

  const update = (patch: Partial<Task>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    const task = {
      ...draft,
      tags: tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    };
    if (await onSave(task)) setDirty(false);
  };

  return (
    <tr className={dirty ? "task-row dirty" : "task-row"}>
      <td className="selection-cell">
        <input type="checkbox" checked={selected} aria-label={`Selecionar ${row.task.title}`} onChange={(event) => { onSelect(event.target.checked); }} />
      </td>
      <td className="task-title-cell">
        <div className="task-title-line" style={{ paddingLeft: `${String(row.depth * 1.25)}rem` }}>
          {row.hasChildren ? (
            <button className="tree-toggle" type="button" aria-label={expanded ? "Recolher subtarefas" : "Expandir subtarefas"} onClick={onToggleExpanded}>
              {expanded ? "▾" : "▸"}
            </button>
          ) : <span className="tree-spacer" />}
          <input className="cell-input title-input" aria-label="Título da tarefa" value={draft.title} disabled={disabled} onChange={(event) => { update({ title: event.target.value }); }} />
        </div>
        <div className="task-row-links" style={{ paddingLeft: `${String(row.depth * 1.25 + 1.6)}rem` }}>
          <button className="inline-link" type="button" disabled={disabled} onClick={onPrepareSubtask}>+ Subtarefa</button>
          <button className="inline-link" type="button" onClick={() => { setShowDetails((visible) => !visible); }}>
            {showDetails ? "Ocultar detalhes" : "Detalhes"}
          </button>
        </div>
        {showDetails ? (
          <div className="task-details" style={{ marginLeft: `${String(row.depth * 1.25 + 1.6)}rem` }}>
            <label>Código<input disabled={disabled} value={draft.code ?? ""} onChange={(event) => { update({ code: event.target.value || null }); }} /></label>
            <label>
              Tarefa-pai
              <select disabled={disabled} value={draft.parentId ?? ""} onChange={(event) => { update({ parentId: event.target.value || null }); }}>
                <option value="">Sem tarefa-pai</option>
                {parentOptions.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}
              </select>
            </label>
            <label>Modo
              <select disabled={disabled} value={draft.schedulingMode} onChange={(event) => { update({ schedulingMode: event.target.value as SchedulingMode }); }}>
                {SCHEDULING_MODES.map((mode) => <option value={mode} key={mode}>{SCHEDULING_MODE_LABELS[mode]}</option>)}
              </select>
            </label>
            <label className="wide-detail">Descrição<textarea disabled={disabled} rows={2} value={draft.description ?? ""} onChange={(event) => { update({ description: event.target.value || null }); }} /></label>
            <label className="wide-detail">Observações<textarea disabled={disabled} rows={2} value={draft.notes ?? ""} onChange={(event) => { update({ notes: event.target.value || null }); }} /></label>
          </div>
        ) : null}
      </td>
      <td>
        <select className="cell-select" aria-label="Status da tarefa" value={draft.status} disabled={disabled} onChange={(event) => { update({ status: event.target.value as TaskStatus }); }}>
          {TASK_STATUSES.map((status) => <option value={status} key={status}>{TASK_STATUS_LABELS[status]}</option>)}
        </select>
      </td>
      <td>
        <select className="cell-select" aria-label="Prioridade da tarefa" value={draft.priority} disabled={disabled} onChange={(event) => { update({ priority: event.target.value as TaskPriority }); }}>
          {TASK_PRIORITIES.map((priority) => <option value={priority} key={priority}>{TASK_PRIORITY_LABELS[priority]}</option>)}
        </select>
      </td>
      <td><div className="progress-editor"><input className="cell-input number-input" type="number" min={0} max={100} aria-label="Progresso da tarefa" value={draft.progress} disabled={disabled} onChange={(event) => { update({ progress: Number(event.target.value) }); }} /><span>%</span></div></td>
      <td><input className="cell-input date-input" type="date" aria-label="Início da tarefa" value={draft.startDate ?? ""} disabled={disabled} onChange={(event) => { update({ startDate: event.target.value || null }); }} /></td>
      <td><input className="cell-input date-input" type="date" aria-label="Fim da tarefa" value={draft.endDate ?? ""} disabled={disabled} onChange={(event) => { update({ endDate: event.target.value || null }); }} /></td>
      <td><input className="cell-input duration-input" type="number" min={1} aria-label="Duração da tarefa" value={draft.durationDays ?? ""} disabled={disabled} onChange={(event) => { update({ durationDays: event.target.value === "" ? null : Number(event.target.value) }); }} /></td>
      <td><input className="cell-input" aria-label="Responsável pela tarefa" value={draft.assignee ?? ""} disabled={disabled} onChange={(event) => { update({ assignee: event.target.value || null }); }} /></td>
      <td><input className="cell-input tags-input" aria-label="Tags da tarefa" placeholder="tag, tag" value={tagsText} disabled={disabled} onChange={(event) => { setTagsText(event.target.value); setDirty(true); }} /></td>
      <td className="row-actions">
        <div className="order-buttons row-order-buttons" aria-label={`Ordenação de ${row.task.title}`}>
          <button type="button" disabled={disabled || !canMoveUp} aria-label={`Mover ${row.task.title} para cima`} title="Mover para cima" onClick={() => { onMove("up"); }}>↑</button>
          <button type="button" disabled={disabled || !canMoveDown} aria-label={`Mover ${row.task.title} para baixo`} title="Mover para baixo" onClick={() => { onMove("down"); }}>↓</button>
        </div>
        {dirty ? <button className="save-row-button" type="button" disabled={disabled} onClick={() => void save()}>Salvar</button> : <span className="saved-label">Salva</span>}
        <button className="delete-row-button" type="button" disabled={disabled} onClick={onDelete}>Excluir</button>
      </td>
    </tr>
  );
}

export function TaskTable({ tasks, disabled, onCreate, onSave, onMove, onDelete }: TaskTableProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<ReadonlySet<string>>(new Set());
  const titleInput = useRef<HTMLInputElement>(null);
  const visibleTasks = flattenVisibleTasks(tasks, expandedTaskIds);

  const handleCreate = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const created = await onCreate({ title: newTitle, parentId: newParentId });
    if (created !== null) {
      setNewTitle("");
      if (newParentId !== null) setExpandedTaskIds((current) => new Set([...current, newParentId]));
      titleInput.current?.focus();
    }
  };

  const prepareSubtask = (parentId: string): void => {
    setNewParentId(parentId);
    setExpandedTaskIds((current) => new Set([...current, parentId]));
    titleInput.current?.focus();
  };

  return (
    <section className="task-section" aria-labelledby="task-table-title">
      <div className="task-toolbar">
        <div>
          <h2 id="task-table-title">Tabela de tarefas</h2>
          <p>{selectedTaskIds.size > 0 ? `${String(selectedTaskIds.size)} selecionada${selectedTaskIds.size === 1 ? "" : "s"}` : "Edite os campos e salve cada linha."}</p>
        </div>
        <form className="quick-task-form" onSubmit={(event) => void handleCreate(event)}>
          <label className="sr-only" htmlFor="quick-task-title">Título da nova tarefa</label>
          <input id="quick-task-title" ref={titleInput} required placeholder={newParentId === null ? "Nova tarefa" : "Nova subtarefa"} value={newTitle} disabled={disabled} onChange={(event) => { setNewTitle(event.target.value); }} />
          <label className="sr-only" htmlFor="quick-task-parent">Tarefa-pai</label>
          <select id="quick-task-parent" value={newParentId ?? ""} disabled={disabled} onChange={(event) => { setNewParentId(event.target.value || null); }}>
            <option value="">Sem tarefa-pai</option>
            {tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}
          </select>
          <button className="primary-button" type="submit" disabled={disabled}>Adicionar</button>
        </form>
      </div>

      <div className="table-scroll">
        <table className="task-table">
          <thead><tr><th className="selection-cell"><span className="sr-only">Selecionar</span></th><th>Tarefa</th><th>Status</th><th>Prioridade</th><th>Progresso</th><th>Início</th><th>Fim</th><th>Duração</th><th>Responsável</th><th>Tags</th><th>Ações</th></tr></thead>
          <tbody>
            {visibleTasks.length === 0 ? (
              <tr><td className="empty-table" colSpan={11}><strong>Nenhuma tarefa ainda.</strong><span>Use o campo “Nova tarefa” para começar.</span></td></tr>
            ) : visibleTasks.map((row) => {
              const siblings = tasks
                .filter(
                  (task) =>
                    task.projectId === row.task.projectId && task.parentId === row.task.parentId,
                )
                .sort(
                  (left, right) =>
                    left.position - right.position || left.createdAt.localeCompare(right.createdAt),
                );
              const siblingIndex = siblings.findIndex((task) => task.id === row.task.id);
              return (
                <TaskRow
                  key={`${row.task.id}-${row.task.updatedAt}`}
                  row={row}
                  tasks={tasks}
                  disabled={disabled}
                  selected={selectedTaskIds.has(row.task.id)}
                  expanded={expandedTaskIds.has(row.task.id)}
                  canMoveUp={siblingIndex > 0}
                  canMoveDown={siblingIndex >= 0 && siblingIndex < siblings.length - 1}
                  onSelect={(selected) => {
                    setSelectedTaskIds((current) => {
                      const next = new Set(current);
                      if (selected) next.add(row.task.id); else next.delete(row.task.id);
                      return next;
                    });
                  }}
                  onToggleExpanded={() => {
                    setExpandedTaskIds((current) => {
                      const next = new Set(current);
                      if (next.has(row.task.id)) next.delete(row.task.id); else next.add(row.task.id);
                      return next;
                    });
                  }}
                  onPrepareSubtask={() => { prepareSubtask(row.task.id); }}
                  onSave={onSave}
                  onMove={(direction) => { void onMove(row.task.id, direction); }}
                  onDelete={() => {
                    if (window.confirm(`Excluir “${row.task.title}” e todas as suas subtarefas? Esta ação não pode ser desfeita.`)) void onDelete(row.task.id);
                  }}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
