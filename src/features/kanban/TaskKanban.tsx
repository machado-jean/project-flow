import { useMemo, useState, type DragEvent } from "react";

import type { TaskDependency } from "../../domain/scheduling/dependency";
import {
  buildTaskOutlineNumbers,
  taskOutlineLabel,
  titleWithoutMatchingOutline,
} from "../../domain/tasks/outline-number";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  type Task,
  type TaskStatus,
} from "../../domain/tasks/task";

interface TaskKanbanProps {
  readonly tasks: readonly Task[];
  readonly allProjectTasks: readonly Task[];
  readonly dependencies: readonly TaskDependency[];
  readonly disabled: boolean;
  readonly onSave: (task: Task) => Promise<boolean>;
}

function taskPath(
  task: Task,
  tasksById: ReadonlyMap<string, Task>,
  outlineNumbers: ReadonlyMap<string, string>,
): string | null {
  const titles: string[] = [];
  let parentId = task.parentId;
  const visited = new Set<string>();
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = tasksById.get(parentId);
    if (parent === undefined) break;
    titles.unshift(taskOutlineLabel(parent, outlineNumbers));
    parentId = parent.parentId;
  }
  return titles.length === 0 ? null : titles.join(" › ");
}

function taskDates(task: Task): string {
  if (task.startDate === null || task.endDate === null) return "Sem cronograma";
  return task.startDate === task.endDate
    ? task.startDate
    : `${task.startDate} → ${task.endDate}`;
}

export function TaskKanban({
  tasks,
  allProjectTasks,
  dependencies,
  disabled,
  onSave,
}: TaskKanbanProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const tasksById = useMemo(
    () => new Map(allProjectTasks.map((task) => [task.id, task])),
    [allProjectTasks],
  );
  const summaryIds = useMemo(
    () => new Set(allProjectTasks.flatMap((task) => task.parentId === null ? [] : [task.parentId])),
    [allProjectTasks],
  );
  const outlineNumbers = useMemo(
    () => buildTaskOutlineNumbers(allProjectTasks),
    [allProjectTasks],
  );

  const changeStatus = async (task: Task, status: TaskStatus): Promise<void> => {
    if (disabled || task.status === status) return;
    setSavingTaskId(task.id);
    await onSave({ ...task, status });
    setSavingTaskId(null);
  };

  const dropTask = (event: DragEvent<HTMLElement>, status: TaskStatus): void => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/projectflow-task") || draggedTaskId;
    setDraggedTaskId(null);
    if (taskId === null) return;
    const task = allProjectTasks.find((candidate) => candidate.id === taskId);
    if (task !== undefined) void changeStatus(task, status);
  };

  return (
    <section className="kanban-section" aria-labelledby="kanban-title">
      <header className="view-heading">
        <div>
          <h2 id="kanban-title">Quadro Kanban</h2>
          <p>Arraste um cartão ou altere o campo “Status”.</p>
        </div>
        <span>{String(tasks.length)} tarefa{tasks.length === 1 ? "" : "s"}</span>
      </header>

      {tasks.length === 0 ? (
        <div className="view-empty" role="status">
          <strong>Nenhuma tarefa corresponde aos filtros.</strong>
          <span>Limpe ou ajuste os filtros para recuperar os cartões.</span>
        </div>
      ) : (
        <div className="kanban-board" aria-label="Tarefas organizadas por status">
          {TASK_STATUSES.map((status) => {
            const columnTasks = tasks.filter((task) => task.status === status);
            return (
              <section
                key={status}
                className={`kanban-column status-${status.toLocaleLowerCase().replace("_", "-")}`}
                aria-labelledby={`kanban-${status}`}
                onDragOver={(event) => { if (!disabled) event.preventDefault(); }}
                onDrop={(event) => { dropTask(event, status); }}
              >
                <header>
                  <h3 id={`kanban-${status}`}>{TASK_STATUS_LABELS[status]}</h3>
                  <span aria-label={`${String(columnTasks.length)} tarefas`}>{String(columnTasks.length)}</span>
                </header>
                <div className="kanban-cards">
                  {columnTasks.length === 0 ? (
                    <p className="kanban-column-empty">Solte uma tarefa aqui</p>
                  ) : columnTasks.map((task) => {
                    const predecessors = dependencies.filter(
                      (dependency) => dependency.successorId === task.id,
                    ).length;
                    const path = taskPath(task, tasksById, outlineNumbers);
                    const outlineNumber = outlineNumbers.get(task.id) ?? "";
                    const isSaving = savingTaskId === task.id;
                    return (
                      <article
                        key={task.id}
                        className={`kanban-card${draggedTaskId === task.id ? " dragging" : ""}`}
                        draggable={!disabled && !isSaving}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/projectflow-task", task.id);
                          setDraggedTaskId(task.id);
                        }}
                        onDragEnd={() => { setDraggedTaskId(null); }}
                      >
                        {path === null ? null : <span className="kanban-path">{path}</span>}
                        <div className="kanban-card-title">
                          <div>
                            <span className="kanban-outline-number">{outlineNumber}.</span>
                            <strong>{titleWithoutMatchingOutline(task.title, outlineNumber)}</strong>
                          </div>
                          {summaryIds.has(task.id) ? <span>Resumo</span> : null}
                        </div>
                        <div className="kanban-meta">
                          <span className={`priority priority-${task.priority.toLocaleLowerCase()}`}>
                            {TASK_PRIORITY_LABELS[task.priority]}
                          </span>
                          <span>{taskDates(task)}</span>
                        </div>
                        <div className="kanban-progress" aria-label={`Progresso: ${String(task.progress)}%`}>
                          <span style={{ width: `${String(task.progress)}%` }} />
                        </div>
                        <div className="kanban-card-footer">
                          <span>{String(task.progress)}%</span>
                          {predecessors > 0 ? <span>{String(predecessors)} pred.</span> : null}
                          {task.assignee === null ? null : <span>{task.assignee}</span>}
                        </div>
                        {task.tags.length === 0 ? null : (
                          <ul className="kanban-tags" aria-label="Tags">
                            {task.tags.map((tag) => <li key={tag}>{tag}</li>)}
                          </ul>
                        )}
                        <label className="kanban-move">
                          <span>Status</span>
                          <select
                            aria-label={`Status de ${task.title}`}
                            value={task.status}
                            disabled={disabled || isSaving}
                            onChange={(event) => {
                              void changeStatus(task, event.target.value as TaskStatus);
                            }}
                          >
                            {TASK_STATUSES.map((candidate) => (
                              <option value={candidate} key={candidate}>
                                {TASK_STATUS_LABELS[candidate]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
