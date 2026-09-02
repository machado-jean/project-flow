import { useMemo, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";

import type { Calendar } from "../../domain/calendars/calendar";
import { isWorkingDay } from "../../domain/calendars/working-calendar";
import type { TaskDependency } from "../../domain/scheduling/dependency";
import { applyScheduleEdit, type ScheduleEdit } from "../../domain/scheduling/schedule-edit";
import type { SchedulingConflict } from "../../domain/scheduling/scheduler";
import {
  collectTaskTreeIds,
  flattenVisibleTasks,
  type VisibleTask,
} from "../../domain/tasks/hierarchy";
import {
  buildTaskOutlineNumbers,
  taskOutlineLabel,
  titleWithoutMatchingOutline,
} from "../../domain/tasks/outline-number";
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
import { ModalDialog } from "../../components/ModalDialog";

interface TaskTableProps {
  readonly tasks: readonly Task[];
  readonly visibleTaskIds?: ReadonlySet<string>;
  readonly calendars: readonly Calendar[];
  readonly projectCalendarId: string;
  readonly dependencies: readonly TaskDependency[];
  readonly conflicts: readonly SchedulingConflict[];
  readonly disabled: boolean;
  readonly onCreate: (input: { readonly title: string; readonly parentId: string | null }) => Promise<Task | null>;
  readonly onSave: (
    task: Task,
    dependencyUpdates: readonly TaskDependency[],
  ) => Promise<boolean>;
  readonly onMove: (taskId: string, direction: "up" | "down") => Promise<boolean>;
  readonly onDelete: (taskId: string) => Promise<boolean>;
  readonly onCreateDependency: (input: { readonly predecessorId: string; readonly successorId: string; readonly lagDays: number }) => Promise<TaskDependency | null>;
  readonly onDeleteDependency: (dependencyId: string) => Promise<boolean>;
  readonly onDuplicate: (taskId: string, includeDescendants: boolean) => Promise<Task | null>;
  readonly onCreateTemplate: (input: {
    readonly rootTaskId: string;
    readonly name: string;
    readonly description: string | null;
  }) => Promise<unknown>;
}

interface DependencyLagEditorProps {
  readonly dependency: TaskDependency;
  readonly predecessorTitle: string;
  readonly lagDays: number;
  readonly dirty: boolean;
  readonly disabled: boolean;
  readonly onChange: (lagDays: number) => void;
  readonly onDelete: (dependencyId: string) => Promise<boolean>;
}

function DependencyLagEditor({
  dependency,
  predecessorTitle,
  lagDays,
  dirty,
  disabled,
  onChange,
  onDelete,
}: DependencyLagEditorProps) {
  return (
    <li className={`dependency-item${dirty ? " dirty" : ""}`}>
      <span title={`${predecessorTitle} · Término para Início`}>{predecessorTitle}</span>
      <label>
        <span className="sr-only">Intervalo em dias úteis</span>
        <input
          type="number"
          min={0}
          value={lagDays}
          disabled={disabled}
          aria-label={`Intervalo após ${predecessorTitle}`}
          onChange={(event) => { onChange(Number(event.target.value)); }}
        />
        d
      </label>
      <button className="dependency-remove" type="button" title="Remover predecessora" aria-label={`Remover predecessora ${predecessorTitle}`} disabled={disabled} onClick={() => { void onDelete(dependency.id); }}>×</button>
    </li>
  );
}

interface PredecessorCellProps {
  readonly task: Task;
  readonly tasks: readonly Task[];
  readonly dependencies: readonly TaskDependency[];
  readonly lagDrafts: Readonly<Record<string, number>>;
  readonly isSummary: boolean;
  readonly disabled: boolean;
  readonly onCreate: TaskTableProps["onCreateDependency"];
  readonly onLagChange: (dependencyId: string, lagDays: number) => void;
  readonly onDelete: TaskTableProps["onDeleteDependency"];
}

function PredecessorCell({
  task,
  tasks,
  dependencies,
  lagDrafts,
  isSummary,
  disabled,
  onCreate,
  onLagChange,
  onDelete,
}: PredecessorCellProps) {
  const [predecessorId, setPredecessorId] = useState("");
  const [lagDays, setLagDays] = useState(0);
  const taskById = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  const outlineNumbers = buildTaskOutlineNumbers(tasks);
  const existing = dependencies.filter((dependency) => dependency.successorId === task.id);
  const existingIds = new Set(existing.map((dependency) => dependency.predecessorId));
  const summaryIds = new Set(tasks.flatMap((candidate) => candidate.parentId === null ? [] : [candidate.parentId]));
  const available = tasks.filter(
    (candidate) =>
      candidate.id !== task.id && !summaryIds.has(candidate.id) && !existingIds.has(candidate.id),
  );

  if (isSummary) return <span className="summary-dependency-label">Datas derivadas</span>;

  const addDependency = async (): Promise<void> => {
    if (predecessorId.length === 0) return;
    const created = await onCreate({ predecessorId, successorId: task.id, lagDays });
    if (created !== null) {
      setPredecessorId("");
      setLagDays(0);
    }
  };

  return (
    <div className="predecessor-cell">
      {existing.length === 0 ? <span className="muted-text">Nenhuma</span> : (
        <ul>
          {existing.map((dependency) => (
            <DependencyLagEditor
              key={`${dependency.id}-${dependency.updatedAt}`}
              dependency={dependency}
              predecessorTitle={
                taskById.has(dependency.predecessorId)
                  ? taskOutlineLabel(taskById.get(dependency.predecessorId) as Task, outlineNumbers)
                  : "Tarefa removida"
              }
              lagDays={lagDrafts[dependency.id] ?? dependency.lagDays}
              dirty={(lagDrafts[dependency.id] ?? dependency.lagDays) !== dependency.lagDays}
              disabled={disabled}
              onChange={(lagDays) => { onLagChange(dependency.id, lagDays); }}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
      <div className="dependency-add">
        <select aria-label={`Nova predecessora de ${task.title}`} value={predecessorId} disabled={disabled || available.length === 0} onChange={(event) => { setPredecessorId(event.target.value); }}>
          <option value="">Adicionar…</option>
          {available.map((candidate) => <option key={candidate.id} value={candidate.id}>{taskOutlineLabel(candidate, outlineNumbers)}</option>)}
        </select>
        <input type="number" min={0} value={lagDays} aria-label={`Novo intervalo de ${task.title}`} title="Intervalo em dias úteis" disabled={disabled || predecessorId.length === 0} onChange={(event) => { setLagDays(Number(event.target.value)); }} />
        <button type="button" aria-label={`Confirmar predecessora de ${task.title}`} title="Adicionar predecessora FS" disabled={disabled || predecessorId.length === 0} onClick={() => { void addDependency(); }}>+</button>
      </div>
    </div>
  );
}

interface TaskRowProps {
  readonly row: VisibleTask;
  readonly outlineNumber: string;
  readonly outlineNumbers: ReadonlyMap<string, string>;
  readonly tasks: readonly Task[];
  readonly calendars: readonly Calendar[];
  readonly projectCalendarId: string;
  readonly dependencies: readonly TaskDependency[];
  readonly conflicts: readonly SchedulingConflict[];
  readonly selected: boolean;
  readonly expanded: boolean;
  readonly disabled: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onSelect: (selected: boolean) => void;
  readonly onToggleExpanded: () => void;
  readonly onPrepareSubtask: () => void;
  readonly onSave: TaskTableProps["onSave"];
  readonly onMove: (direction: "up" | "down") => void;
  readonly onDelete: () => void;
  readonly onCreateDependency: TaskTableProps["onCreateDependency"];
  readonly onDeleteDependency: TaskTableProps["onDeleteDependency"];
  readonly onDuplicate: (includeDescendants: boolean) => void;
  readonly onPrepareTemplate: () => void;
}

function TaskRow({
  row,
  outlineNumber,
  outlineNumbers,
  tasks,
  calendars,
  projectCalendarId,
  dependencies,
  conflicts,
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
  onCreateDependency,
  onDeleteDependency,
  onDuplicate,
  onPrepareTemplate,
}: TaskRowProps) {
  const [draft, setDraft] = useState(row.task);
  const [tagsText, setTagsText] = useState(row.task.tags.join(", "));
  const [dirty, setDirty] = useState(false);
  const [lagDrafts, setLagDrafts] = useState<Readonly<Record<string, number>>>({});
  const [showDetails, setShowDetails] = useState(false);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const detailsId = `task-details-${row.task.id}`;
  const codeHelpId = `task-code-help-${row.task.id}`;
  const invalidParentIds = useMemo(() => collectTaskTreeIds(tasks, row.task.id), [row.task.id, tasks]);
  const dependencyTaskIds = new Set(dependencies.flatMap(({ predecessorId, successorId }) => [predecessorId, successorId]));
  const parentOptions = tasks.filter(
    (task) => !invalidParentIds.has(task.id) && !dependencyTaskIds.has(task.id),
  );
  const taskCalendar = calendars.find(
    (calendar) => calendar.id === (draft.calendarId ?? projectCalendarId),
  ) ?? calendars[0];
  const taskConflicts = conflicts.filter((conflict) => conflict.taskId === row.task.id);
  const canHaveSubtask = !dependencyTaskIds.has(row.task.id);
  const dependencyUpdates = dependencies
    .filter((dependency) => dependency.successorId === row.task.id)
    .flatMap((dependency) => {
      const lagDays = lagDrafts[dependency.id];
      return lagDays === undefined || lagDays === dependency.lagDays
        ? []
        : [{ ...dependency, lagDays }];
    });
  const hasUnsavedChanges = dirty || dependencyUpdates.length > 0;
  const manualNonWorkingDate =
    draft.schedulingMode === "MANUAL" &&
    taskCalendar !== undefined &&
    [draft.startDate, draft.endDate].some(
      (date) => date !== null && !isWorkingDay(taskCalendar, date),
    );

  const closeDetailsOnEscape = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape" || !showDetails) return;
    event.preventDefault();
    event.stopPropagation();
    setShowDetails(false);
    detailsButtonRef.current?.focus();
  };

  const update = (patch: Partial<Task>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const updateSchedule = (edit: ScheduleEdit): void => {
    if (taskCalendar === undefined) return;
    if (edit.field === "durationDays" && edit.value !== null && edit.value < 1) {
      update({ durationDays: edit.value });
      return;
    }
    if (
      edit.field === "endDate" &&
      edit.value !== null &&
      draft.startDate !== null &&
      edit.value < draft.startDate
    ) {
      update({ endDate: edit.value });
      return;
    }
    if (
      edit.field === "startDate" &&
      edit.value !== null &&
      draft.endDate !== null &&
      draft.durationDays === null &&
      edit.value > draft.endDate
    ) {
      update({ startDate: edit.value });
      return;
    }
    setDraft((current) => applyScheduleEdit(current, edit, taskCalendar));
    setDirty(true);
  };

  const updateCalendar = (calendarId: string | null): void => {
    const calendar = calendars.find((candidate) => candidate.id === (calendarId ?? projectCalendarId));
    let nextDraft = { ...draft, calendarId };
    if (calendar !== undefined && draft.startDate !== null && draft.durationDays !== null) {
      nextDraft = applyScheduleEdit(
        nextDraft,
        { field: "durationDays", value: draft.durationDays },
        calendar,
      );
    }
    setDraft(nextDraft);
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    const task = {
      ...draft,
      tags: tagsText.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0),
    };
    if (await onSave(task, dependencyUpdates)) {
      setDirty(false);
      setLagDrafts({});
    }
  };

  return (
    <>
    <tr className={`task-row${hasUnsavedChanges ? " dirty" : ""}${taskConflicts.length > 0 ? " schedule-conflict" : ""}`}>
      <td className="selection-cell"><input type="checkbox" checked={selected} aria-label={`Selecionar ${row.task.title}`} onChange={(event) => { onSelect(event.target.checked); }} /></td>
      <td className="task-title-cell">
        <div className="task-title-line" style={{ paddingLeft: `${String(row.depth * 1.25)}rem` }}>
          {row.hasChildren ? <button className="tree-toggle" type="button" aria-label={expanded ? "Recolher subtarefas" : "Expandir subtarefas"} aria-expanded={expanded} onClick={onToggleExpanded}>{expanded ? "▾" : "▸"}</button> : <span className="tree-spacer" />}
          <span className="task-outline-number" aria-label={`Estrutura ${outlineNumber}`}>{outlineNumber}.</span>
          <input className="cell-input title-input" aria-label="Título da tarefa" value={titleWithoutMatchingOutline(draft.title, outlineNumber)} disabled={disabled} onChange={(event) => { update({ title: event.target.value }); }} />
          {row.hasChildren ? <span className="summary-badge">Resumo</span> : null}
        </div>
        <div className="task-row-links" style={{ paddingLeft: `${String(row.depth * 1.25 + 1.6)}rem` }}>
          <button className="inline-link" type="button" disabled={disabled || !canHaveSubtask} title={canHaveSubtask ? "Criar subtarefa" : "Remova as dependências desta tarefa antes de adicionar subtarefas"} onClick={onPrepareSubtask}>+ Subtarefa</button>
          <button ref={detailsButtonRef} className="inline-link" type="button" aria-expanded={showDetails} aria-controls={detailsId} onKeyDown={closeDetailsOnEscape} onClick={() => { setShowDetails((visible) => !visible); }}>{showDetails ? "Ocultar detalhes" : "Detalhes"}</button>
        </div>
        {taskConflicts.map((conflict) => <p className="conflict-message" key={`${conflict.kind}-${conflict.requiredStartDate}`}>{conflict.message}</p>)}
      </td>
      <td><PredecessorCell task={row.task} tasks={tasks} dependencies={dependencies} lagDrafts={lagDrafts} isSummary={row.hasChildren} disabled={disabled} onCreate={onCreateDependency} onLagChange={(dependencyId, lagDays) => { setLagDrafts((current) => ({ ...current, [dependencyId]: lagDays })); }} onDelete={onDeleteDependency} /></td>
      <td><select className="cell-select" aria-label="Status da tarefa" value={draft.status} disabled={disabled} onChange={(event) => { update({ status: event.target.value as TaskStatus }); }}>{TASK_STATUSES.map((status) => <option value={status} key={status}>{TASK_STATUS_LABELS[status]}</option>)}</select></td>
      <td><select className="cell-select" aria-label="Prioridade da tarefa" value={draft.priority} disabled={disabled} onChange={(event) => { update({ priority: event.target.value as TaskPriority }); }}>{TASK_PRIORITIES.map((priority) => <option value={priority} key={priority}>{TASK_PRIORITY_LABELS[priority]}</option>)}</select></td>
      <td><div className="progress-editor"><input className="cell-input number-input" type="number" min={0} max={100} aria-label="Progresso da tarefa" value={draft.progress} disabled={disabled} onChange={(event) => { update({ progress: Number(event.target.value) }); }} /><span>%</span></div></td>
      <td><input className="cell-input date-input" type="date" aria-label="Início da tarefa" value={draft.startDate ?? ""} disabled={disabled || row.hasChildren} title={row.hasChildren ? "Data calculada pelas subtarefas" : ""} onChange={(event) => { updateSchedule({ field: "startDate", value: event.target.value || null }); }} /></td>
      <td><input className="cell-input date-input" type="date" aria-label="Fim da tarefa" value={draft.endDate ?? ""} disabled={disabled || row.hasChildren} title={row.hasChildren ? "Data calculada pelas subtarefas" : ""} onChange={(event) => { updateSchedule({ field: "endDate", value: event.target.value || null }); }} /></td>
      <td><input className="cell-input duration-input" type="number" min={1} aria-label="Duração da tarefa" value={draft.durationDays ?? ""} disabled={disabled || row.hasChildren} title={row.hasChildren ? "Duração calculada pelas subtarefas" : ""} onChange={(event) => { updateSchedule({ field: "durationDays", value: event.target.value === "" ? null : Number(event.target.value) }); }} /></td>
      <td><input className="cell-input" aria-label="Responsável pela tarefa" value={draft.assignee ?? ""} disabled={disabled} onChange={(event) => { update({ assignee: event.target.value || null }); }} /></td>
      <td><input className="cell-input tags-input" aria-label="Tags da tarefa" placeholder="tag, tag" value={tagsText} disabled={disabled} onChange={(event) => { setTagsText(event.target.value); setDirty(true); }} /></td>
      <td className="row-actions">
        <div className="order-buttons row-order-buttons" aria-label={`Ordenação de ${row.task.title}`}><button type="button" disabled={disabled || !canMoveUp} aria-label={`Mover ${row.task.title} para cima`} title="Mover para cima" onClick={() => { onMove("up"); }}>↑</button><button type="button" disabled={disabled || !canMoveDown} aria-label={`Mover ${row.task.title} para baixo`} title="Mover para baixo" onClick={() => { onMove("down"); }}>↓</button></div>
        {hasUnsavedChanges ? <button className="save-row-button" type="button" disabled={disabled} onClick={() => { void save(); }}>Salvar</button> : <span className="saved-label">Salva</span>}
        <button className="delete-row-button" type="button" disabled={disabled} onClick={onDelete}>Excluir</button>
      </td>
    </tr>
    {showDetails ? (
      <tr className="task-details-row">
        <td className="selection-cell" />
        <td colSpan={11}>
          <div className="task-details" id={detailsId} style={{ marginLeft: `${String(row.depth * 1.25)}rem` }} onKeyDown={closeDetailsOnEscape}>
            <label>
              <span className="detail-label">
                Código
                <span className="field-help" tabIndex={0} aria-label="Ajuda sobre o código visual" aria-describedby={codeHelpId} title="Identificador visual opcional, como DEV-01 ou 1.2. Ele não altera o UUID interno da tarefa.">
                  i
                  <span className="field-help-text" id={codeHelpId} role="tooltip">Identificador visual opcional, como DEV-01 ou 1.2. Ele não altera o UUID interno da tarefa.</span>
                </span>
              </span>
              <input aria-label="Código visual da tarefa" disabled={disabled} value={draft.code ?? ""} onChange={(event) => { update({ code: event.target.value || null }); }} />
            </label>
            <label>Tarefa-pai<select disabled={disabled} value={draft.parentId ?? ""} onChange={(event) => { update({ parentId: event.target.value || null }); }}><option value="">Sem tarefa-pai</option>{parentOptions.map((task) => <option value={task.id} key={task.id}>{taskOutlineLabel(task, outlineNumbers)}</option>)}</select></label>
            <label>Modo<select disabled={disabled || row.hasChildren} value={draft.schedulingMode} onChange={(event) => { update({ schedulingMode: event.target.value as SchedulingMode }); }}>{SCHEDULING_MODES.map((mode) => <option value={mode} key={mode}>{SCHEDULING_MODE_LABELS[mode]}</option>)}</select></label>
            <label>Calendário<select disabled={disabled || row.hasChildren} value={draft.calendarId ?? ""} onChange={(event) => { updateCalendar(event.target.value || null); }}><option value="">Calendário do projeto</option>{calendars.filter((calendar) => calendar.id !== projectCalendarId).map((calendar) => <option value={calendar.id} key={calendar.id}>{calendar.name}</option>)}</select></label>
            <label className="wide-detail">Descrição<textarea disabled={disabled} rows={2} value={draft.description ?? ""} onChange={(event) => { update({ description: event.target.value || null }); }} /></label>
            <label className="wide-detail">Observações<textarea disabled={disabled} rows={2} value={draft.notes ?? ""} onChange={(event) => { update({ notes: event.target.value || null }); }} /></label>
            {manualNonWorkingDate ? <p className="calendar-warning wide-detail">A tarefa manual usa uma data não útil. A data será preservada; escolha “Todos os dias” se ela deve participar automaticamente de fins de semana.</p> : null}
            <div className="task-reuse-actions wide-detail">
              <div>
                <strong>Reutilização</strong>
                <span>As cópias recebem novas identidades; relações externas não são copiadas.</span>
              </div>
              <button type="button" disabled={disabled} onClick={() => { onDuplicate(false); }}>Duplicar tarefa</button>
              {row.hasChildren ? <button type="button" disabled={disabled} onClick={() => { onDuplicate(true); }}>Duplicar árvore</button> : null}
              <button type="button" disabled={disabled} onClick={onPrepareTemplate}>Salvar árvore como template</button>
            </div>
          </div>
        </td>
      </tr>
    ) : null}
    </>
  );
}

export function TaskTable({
  tasks,
  visibleTaskIds,
  calendars,
  projectCalendarId,
  dependencies,
  conflicts,
  disabled,
  onCreate,
  onSave,
  onMove,
  onDelete,
  onCreateDependency,
  onDeleteDependency,
  onDuplicate,
  onCreateTemplate,
}: TaskTableProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [templateSource, setTemplateSource] = useState<Task | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  const forcedExpandedIds = new Set(
    tasks
      .filter(
        (task) =>
          visibleTaskIds?.has(task.id) === true &&
          task.parentId !== null &&
          visibleTaskIds.has(task.parentId),
      )
      .map((task) => task.parentId as string),
  );
  const effectiveExpandedIds = new Set([...expandedTaskIds, ...forcedExpandedIds]);
  const visibleTasks = flattenVisibleTasks(tasks, effectiveExpandedIds).filter(
    ({ task }) => visibleTaskIds === undefined || visibleTaskIds.has(task.id),
  );
  const outlineNumbers = buildTaskOutlineNumbers(tasks);
  const dependencyTaskIds = new Set(dependencies.flatMap(({ predecessorId, successorId }) => [predecessorId, successorId]));

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

  const prepareTemplate = (task: Task): void => {
    setTemplateSource(task);
    setTemplateName(task.title);
    setTemplateDescription(task.description ?? "");
  };

  const saveTemplate = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (templateSource === null) return;
    const created = await onCreateTemplate({
      rootTaskId: templateSource.id,
      name: templateName,
      description: templateDescription || null,
    });
    if (created !== null) setTemplateSource(null);
  };

  return (
    <section className="task-section" aria-labelledby="task-table-title">
      <div className="task-toolbar">
        <div><h2 id="task-table-title">Tabela de tarefas</h2><p>{selectedTaskIds.size > 0 ? `${String(selectedTaskIds.size)} selecionada${selectedTaskIds.size === 1 ? "" : "s"}` : "Preencha duas informações de prazo; a terceira será calculada."}</p></div>
        <form className="quick-task-form" onSubmit={(event) => { void handleCreate(event); }}>
          <label className="sr-only" htmlFor="quick-task-title">Título da nova tarefa</label><input id="quick-task-title" ref={titleInput} required placeholder={newParentId === null ? "Nova tarefa" : "Nova subtarefa"} value={newTitle} disabled={disabled} onChange={(event) => { setNewTitle(event.target.value); }} />
          <label className="sr-only" htmlFor="quick-task-parent">Tarefa-pai</label><select id="quick-task-parent" value={newParentId ?? ""} disabled={disabled} onChange={(event) => { setNewParentId(event.target.value || null); }}><option value="">Sem tarefa-pai</option>{tasks.filter((task) => !dependencyTaskIds.has(task.id)).map((task) => <option value={task.id} key={task.id}>{taskOutlineLabel(task, outlineNumbers)}</option>)}</select>
          <button className="primary-button" type="submit" disabled={disabled}>Adicionar</button>
        </form>
      </div>
      {conflicts.length > 0 ? <div className="schedule-conflict-summary" role="status"><strong>{conflicts.length} {conflicts.length === 1 ? "conflito de agendamento" : "conflitos de agendamento"}</strong><span>Tarefas manuais foram preservadas. Abra a linha correspondente para revisar a data mínima indicada.</span></div> : null}
      <div className="table-scroll">
        <table className="task-table">
          <caption className="sr-only">Tarefas do projeto com cronograma, predecessoras e ações de edição</caption>
          <thead><tr><th className="selection-cell"><span className="sr-only">Selecionar</span></th><th>Tarefa</th><th>Predecessoras</th><th>Status</th><th>Prioridade</th><th>Progresso</th><th>Início</th><th>Fim</th><th>Duração</th><th>Responsável</th><th>Tags</th><th>Ações</th></tr></thead>
          <tbody>
            {visibleTasks.length === 0 ? <tr><td className="empty-table" colSpan={12}><strong>{tasks.length === 0 ? "Nenhuma tarefa ainda." : "Nenhuma tarefa corresponde aos filtros."}</strong><span>{tasks.length === 0 ? "Use o campo “Nova tarefa” para começar." : "Limpe ou ajuste os filtros para recuperar as linhas."}</span></td></tr> : visibleTasks.map((row) => {
              const siblings = tasks.filter((task) => task.projectId === row.task.projectId && task.parentId === row.task.parentId).sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
              const siblingIndex = siblings.findIndex((task) => task.id === row.task.id);
              return <TaskRow key={`${row.task.id}-${row.task.updatedAt}`} row={row} outlineNumber={outlineNumbers.get(row.task.id) ?? ""} outlineNumbers={outlineNumbers} tasks={tasks} calendars={calendars} projectCalendarId={projectCalendarId} dependencies={dependencies} conflicts={conflicts} disabled={disabled} selected={selectedTaskIds.has(row.task.id)} expanded={effectiveExpandedIds.has(row.task.id)} canMoveUp={siblingIndex > 0} canMoveDown={siblingIndex >= 0 && siblingIndex < siblings.length - 1} onSelect={(selected) => { setSelectedTaskIds((current) => { const next = new Set(current); if (selected) next.add(row.task.id); else next.delete(row.task.id); return next; }); }} onToggleExpanded={() => { setExpandedTaskIds((current) => { const next = new Set(current); if (next.has(row.task.id)) next.delete(row.task.id); else next.add(row.task.id); return next; }); }} onPrepareSubtask={() => { prepareSubtask(row.task.id); }} onSave={onSave} onMove={(direction) => { void onMove(row.task.id, direction); }} onCreateDependency={onCreateDependency} onDeleteDependency={onDeleteDependency} onDuplicate={(includeDescendants) => { void onDuplicate(row.task.id, includeDescendants).then((copy) => { if (copy !== null && includeDescendants) setExpandedTaskIds((current) => new Set([...current, copy.id])); }); }} onPrepareTemplate={() => { prepareTemplate(row.task); }} onDelete={() => { if (window.confirm(`Excluir “${row.task.title}” e todas as suas subtarefas? Esta ação não pode ser desfeita.`)) void onDelete(row.task.id); }} />;
            })}
          </tbody>
        </table>
      </div>
      {templateSource === null ? null : (
        <ModalDialog
          className="template-dialog"
          backdropClassName="dialog-backdrop"
          labelledBy="template-dialog-title"
          describedBy="template-dialog-description"
          closeDisabled={disabled}
          onClose={() => { setTemplateSource(null); }}
        >
            <div>
              <h2 id="template-dialog-title">Salvar árvore como template</h2>
              <p id="template-dialog-description">“{templateSource.title}” e suas subtarefas ficarão disponíveis em todo o workspace.</p>
            </div>
            <form onSubmit={(event) => { void saveTemplate(event); }}>
              <label>Nome<input required autoFocus value={templateName} disabled={disabled} onChange={(event) => { setTemplateName(event.target.value); }} /></label>
              <label>Descrição<textarea rows={3} value={templateDescription} disabled={disabled} onChange={(event) => { setTemplateDescription(event.target.value); }} /></label>
              <div className="dialog-actions">
                <button type="button" disabled={disabled} onClick={() => { setTemplateSource(null); }}>Cancelar</button>
                <button className="primary-button" type="submit" disabled={disabled}>Salvar template</button>
              </div>
            </form>
        </ModalDialog>
      )}
    </section>
  );
}
