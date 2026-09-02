import {
  Gantt,
  Willow,
  type IApi,
  type IColumnConfig,
  type ILink,
  type IScaleConfig,
  type TMethodsConfig,
} from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/all.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type SyntheticEvent,
} from "react";

import type { Calendar } from "../../domain/calendars/calendar";
import { addCalendarDays } from "../../domain/calendars/date-only";
import { applyScheduleEdit } from "../../domain/scheduling/schedule-edit";
import { applyGanttDateEdit, planGanttFsMove, type GanttDateEditMode } from "../../domain/scheduling/gantt-edit";
import type { TaskDependency } from "../../domain/scheduling/dependency";
import {
  SCHEDULING_MODE_LABELS,
  TASK_STATUS_LABELS,
  type Task,
} from "../../domain/tasks/task";
import {
  buildTaskOutlineNumbers,
  taskOutlineLabel,
} from "../../domain/tasks/outline-number";
import { buildGanttProjection, ganttCalendarClass } from "./gantt-adapter";

type GanttScale = "DAY" | "WEEK" | "MONTH";

interface TaskGanttProps {
  readonly tasks: readonly Task[];
  readonly allProjectTasks: readonly Task[];
  readonly calendars: readonly Calendar[];
  readonly projectCalendarId: string;
  readonly dependencies: readonly TaskDependency[];
  readonly disabled: boolean;
  readonly onSave: (task: Task, dependencyUpdates?: readonly TaskDependency[]) => Promise<boolean>;
  readonly onCreateDependency: (input: {
    readonly predecessorId: string;
    readonly successorId: string;
    readonly lagDays: number;
  }) => Promise<TaskDependency | null>;
  readonly onDeleteDependency: (dependencyId: string) => Promise<boolean>;
}

interface GanttContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly taskId: string | null;
  readonly dependencyId: string | null;
  readonly addPredecessor: boolean;
}

interface GanttHistoryEntry {
  readonly label: string;
  readonly beforeTask: Task;
  readonly afterTask: Task;
  readonly beforeDependencies: readonly TaskDependency[];
  readonly afterDependencies: readonly TaskDependency[];
}

const GANTT_COLUMNS: IColumnConfig[] = [
  { id: "text", header: "Tarefa", width: 270, flexgrow: 1, resize: false },
  { id: "start", header: "Início", width: 105, resize: false },
  { id: "workDuration", header: "Dias úteis", width: 72, align: "right", resize: false },
];

const MONTH_NAMES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
] as const;

function scalesFor(scale: GanttScale): { readonly scales: IScaleConfig[]; readonly cellWidth: number } {
  if (scale === "MONTH") {
    return {
      cellWidth: 110,
      scales: [
        { unit: "year", step: 1, format: (date) => String(date.getFullYear()) },
        { unit: "month", step: 1, format: (date) => MONTH_NAMES[date.getMonth()] ?? "" },
      ],
    };
  }
  if (scale === "WEEK") {
    return {
      cellWidth: 82,
      scales: [
        { unit: "month", step: 1, format: (date) => `${MONTH_NAMES[date.getMonth()] ?? ""} ${String(date.getFullYear())}` },
        { unit: "week", step: 1, format: (date) => `Sem. ${String(date.getDate()).padStart(2, "0")}` },
      ],
    };
  }
  return {
    cellWidth: 42,
    scales: [
      { unit: "month", step: 1, format: (date) => `${MONTH_NAMES[date.getMonth()] ?? ""} ${String(date.getFullYear())}` },
      { unit: "day", step: 1, format: (date) => String(date.getDate()).padStart(2, "0") },
    ],
  };
}

function displayDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day ?? ""}/${month ?? ""}/${year ?? ""}`;
}

export function TaskGantt({
  tasks,
  allProjectTasks,
  calendars,
  projectCalendarId,
  dependencies,
  disabled,
  onSave,
  onCreateDependency,
  onDeleteDependency,
}: TaskGanttProps) {
  const [scale, setScale] = useState<GanttScale>("DAY");
  const [ganttApi, setGanttApi] = useState<IApi | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusedDependencyId, setFocusedDependencyId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [durationDays, setDurationDays] = useState(1);
  const [localError, setLocalError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [savingVisualEdit, setSavingVisualEdit] = useState(false);
  const [ganttRevision, setGanttRevision] = useState(0);
  const undoStack = useRef<GanttHistoryEntry[]>([]);
  const redoStack = useRef<GanttHistoryEntry[]>([]);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false, revision: 0 });
  const [contextMenu, setContextMenu] = useState<GanttContextMenuState | null>(null);
  const [contextPredecessorId, setContextPredecessorId] = useState("");
  const projection = useMemo(
    () => buildGanttProjection(tasks, allProjectTasks, dependencies),
    [allProjectTasks, dependencies, tasks],
  );
  const scaleConfig = useMemo(() => scalesFor(scale), [scale]);
  const tasksById = useMemo(
    () => new Map(allProjectTasks.map((task) => [task.id, task])),
    [allProjectTasks],
  );
  const outlineNumbers = useMemo(
    () => buildTaskOutlineNumbers(allProjectTasks),
    [allProjectTasks],
  );
  const dependenciesById = useMemo(
    () => new Map(dependencies.map((dependency) => [dependency.id, dependency])),
    [dependencies],
  );
  const focusedLink = projection.links.find(
    (link) => String(link.id) === focusedDependencyId,
  ) ?? null;
  const focusedDependency = focusedDependencyId === null
    ? null
    : dependenciesById.get(focusedDependencyId) ?? null;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const summaryIds = useMemo(
    () => new Set(allProjectTasks.flatMap((task) => task.parentId === null ? [] : [task.parentId])),
    [allProjectTasks],
  );
  const isSummary = selectedTask !== null && summaryIds.has(selectedTask.id);
  const selectedHasPredecessors = selectedTask !== null && dependencies.some(
    (dependency) => dependency.successorId === selectedTask.id,
  );
  const projectCalendar = calendars.find((calendar) => calendar.id === projectCalendarId);
  const selectedGanttTaskIds = focusedDependency === null
    ? selectedTaskId === null ? [] : [selectedTaskId]
    : [focusedDependency.predecessorId, focusedDependency.successorId];
  const contextTask = contextMenu?.taskId === null || contextMenu?.taskId === undefined
    ? null
    : tasksById.get(contextMenu.taskId) ?? null;
  const contextStartDate = contextTask?.startDate ?? null;
  const predecessorOptions = contextTask === null || contextStartDate === null
    ? []
    : allProjectTasks.filter((candidate) =>
      candidate.id !== contextTask.id &&
      candidate.endDate !== null &&
      candidate.endDate < contextStartDate &&
      !summaryIds.has(candidate.id) &&
      !dependencies.some((dependency) =>
        dependency.predecessorId === candidate.id && dependency.successorId === contextTask.id))
      .sort((left, right) =>
        (right.endDate ?? "").localeCompare(left.endDate ?? "") || left.position - right.position);

  const ganttDomId = (value: string | null): string | null =>
    value?.startsWith(":") === true ? value.slice(1) : value;

  const dependencyLabel = useCallback((dependency: TaskDependency): string => {
    const predecessor = tasksById.get(dependency.predecessorId);
    const successor = tasksById.get(dependency.successorId);
    const predecessorLabel = predecessor === undefined
      ? "Tarefa removida"
      : taskOutlineLabel(predecessor, outlineNumbers);
    const successorLabel = successor === undefined
      ? "Tarefa removida"
      : taskOutlineLabel(successor, outlineNumbers);
    const lag = dependency.lagDays === 0 ? "lag 0" : `lag +${String(dependency.lagDays)}`;
    return `${predecessorLabel} → ${successorLabel} · FS, ${lag}`;
  }, [outlineNumbers, tasksById]);

  const focusDependencyFromChart = (event: MouseEvent<HTMLDivElement>): void => {
    if (!(event.target instanceof Element)) return;
    const linkElement = event.target.closest("[data-link-id]");
    const linkId = ganttDomId(linkElement?.getAttribute("data-link-id") ?? null);
    if (linkId !== null && dependenciesById.has(linkId)) {
      setFocusedDependencyId(linkId);
    }
  };

  const openContextMenu = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!(event.target instanceof Element)) return;
    const linkId = ganttDomId(event.target.closest("[data-link-id]")?.getAttribute("data-link-id") ?? null);
    const taskElement = event.target.closest("[data-task-id]");
    const taskId = ganttDomId(taskElement?.getAttribute("data-task-id") ?? null);
    if (linkId === null && taskId === null) {
      setContextMenu(null);
      return;
    }
    setContextPredecessorId("");
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 310),
      y: Math.min(event.clientY, window.innerHeight - 220),
      taskId,
      dependencyId: linkId,
      addPredecessor: false,
    });
  };

  useEffect(() => {
    if (contextMenu === null) return;
    const close = (event: globalThis.PointerEvent): void => {
      if (event.target instanceof Node && contextMenuRef.current?.contains(event.target)) return;
      setContextMenu(null);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const addContextPredecessor = async (): Promise<void> => {
    if (contextTask === null || contextPredecessorId.length === 0) return;
    setContextMenu(null);
    await saveVisualDependency({
      source: contextPredecessorId,
      target: contextTask.id,
      type: "e2s",
    });
  };

  const deleteContextDependency = async (): Promise<void> => {
    const dependencyId = contextMenu?.dependencyId;
    if (dependencyId === null || dependencyId === undefined) return;
    setContextMenu(null);
    setSavingVisualEdit(true);
    setLocalError(null);
    try {
      if (await onDeleteDependency(dependencyId)) {
        setFocusedDependencyId(null);
        setAnnouncement("Dependência FS excluída.");
      } else {
        setLocalError("Não foi possível excluir a dependência.");
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível excluir a dependência.");
    } finally {
      setSavingVisualEdit(false);
    }
  };

  const selectTask = useCallback((taskId: string | null): void => {
    const task = tasks.find((candidate) => candidate.id === taskId);
    setSelectedTaskId(task?.id ?? null);
    setStartDate(task?.startDate ?? "");
    setDurationDays(task?.durationDays ?? 1);
    setLocalError(null);
  }, [tasks]);

  useEffect(() => {
    if (ganttApi === null) return;
    const listenerTag = Symbol("projectflow-gantt-selection");
    ganttApi.on("select-task", ({ id }) => {
      if (typeof id === "string") selectTask(id);
    }, { tag: listenerTag });
    return () => { ganttApi.detach(listenerTag); };
  }, [ganttApi, selectTask]);

  const resetGanttProjection = useCallback((): void => {
    setGanttRevision((revision) => revision + 1);
  }, []);

  const recordHistory = useCallback((entry: GanttHistoryEntry): void => {
    undoStack.current.push(entry);
    redoStack.current = [];
    setHistoryState((current) => ({ canUndo: true, canRedo: false, revision: current.revision + 1 }));
  }, []);

  const saveVisualTaskEdit = useCallback(async (
    input: TMethodsConfig["update-task"],
  ): Promise<void> => {
    if (savingVisualEdit || disabled) return;
    const task = tasksById.get(String(input.id));
    if (task === undefined) return;
    if ("progress" in input.task) {
      const progress = input.task.progress;
      if (typeof progress !== "number" || !Number.isFinite(progress)) {
        setLocalError("O percentual de conclusão informado pelo Gantt é inválido.");
        resetGanttProjection();
        return;
      }
      setSavingVisualEdit(true);
      setLocalError(null);
      try {
        const normalizedProgress = Math.round(Math.min(100, Math.max(0, progress)));
        const saved = await onSave({ ...task, progress: normalizedProgress });
        if (!saved) {
          setLocalError("Não foi possível salvar a conclusão. Nenhuma alteração foi aplicada.");
          resetGanttProjection();
        } else {
          recordHistory({
            label: `Conclusão de ${task.title}`,
            beforeTask: task,
            afterTask: { ...task, progress: normalizedProgress },
            beforeDependencies: [],
            afterDependencies: [],
          });
          setAnnouncement(`${task.title}: conclusão atualizada para ${String(normalizedProgress)}%.`);
          setSelectedTaskId(task.id);
          resetGanttProjection();
        }
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : "Não foi possível salvar a conclusão.");
        resetGanttProjection();
      } finally {
        setSavingVisualEdit(false);
      }
      return;
    }
    const mode: GanttDateEditMode | null = input.task.start instanceof Date && input.task.end instanceof Date
      ? "MOVE"
      : input.task.start instanceof Date
        ? "START"
        : input.task.end instanceof Date
          ? "END"
          : null;
    if (mode === null || input.diff === undefined) {
      resetGanttProjection();
      return;
    }
    const calendar = calendars.find(
      (candidate) => candidate.id === (task.calendarId ?? projectCalendarId),
    );
    if (calendar === undefined) {
      setLocalError("O calendário efetivo da tarefa não foi encontrado.");
      resetGanttProjection();
      return;
    }
    try {
      const hasPredecessors = dependencies.some((dependency) => dependency.successorId === task.id);
      if (summaryIds.has(task.id)) throw new Error("As datas desta tarefa-resumo são calculadas pelas subtarefas.");
      const fsMove = mode === "MOVE" && hasPredecessors
        ? planGanttFsMove(task, input.diff, calendar, dependencies, allProjectTasks)
        : null;
      const edited = fsMove?.task ?? applyGanttDateEdit(task, {
        mode,
        differenceInCalendarDays: input.diff,
      }, calendar, { hasPredecessors, isSummary: false });
      const requestedStartDate = mode === "MOVE" && task.startDate !== null
        ? addCalendarDays(task.startDate, input.diff)
        : null;
      const calendarAdjusted = fsMove?.calendarAdjusted
        ?? (requestedStartDate !== null && edited.startDate !== requestedStartDate);
      const unchangedTask = edited.startDate === task.startDate
        && edited.endDate === task.endDate
        && edited.durationDays === task.durationDays;
      const dependencyUpdates = fsMove?.dependencyUpdates ?? [];
      if (unchangedTask && dependencyUpdates.length === 0) {
        setAnnouncement(calendarAdjusted && requestedStartDate !== null && edited.startDate !== null
          ? `${displayDate(requestedStartDate)} não é um dia útil. ${task.title} foi mantida em ${displayDate(edited.startDate)}, conforme o calendário.`
          : `${task.title}: nenhuma alteração necessária.`);
        resetGanttProjection();
        return;
      }
      setSavingVisualEdit(true);
      setLocalError(null);
      const saved = await onSave(edited, fsMove?.dependencyUpdates ?? []);
      if (!saved) {
        setLocalError("Não foi possível salvar o cronograma. Nenhuma alteração foi aplicada.");
        resetGanttProjection();
      } else {
        recordHistory({
          label: `Cronograma de ${task.title}`,
          beforeTask: task,
          afterTask: edited,
          beforeDependencies: fsMove?.dependencyUpdates.map((updated) =>
            dependencies.find((dependency) => dependency.id === updated.id) ?? updated) ?? [],
          afterDependencies: fsMove?.dependencyUpdates ?? [],
        });
        const lagChanges = fsMove?.dependencyUpdates.length ?? 0;
        const limited = fsMove !== null && fsMove.requestedStartDate !== fsMove.appliedStartDate;
        setAnnouncement(limited
          ? `${task.title}: movida até ${fsMove.appliedStartDate}; uma predecessora com lag zero impede antecipar mais.`
          : `${task.title}: cronograma atualizado${lagChanges > 0 ? ` e ${String(lagChanges)} intervalo FS ajustado${lagChanges === 1 ? "" : "s"}` : ""}.`);
        setSelectedTaskId(task.id);
        resetGanttProjection();
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível alterar o cronograma.");
      resetGanttProjection();
    } finally {
      setSavingVisualEdit(false);
    }
  }, [allProjectTasks, calendars, dependencies, disabled, onSave, projectCalendarId, recordHistory, resetGanttProjection, savingVisualEdit, summaryIds, tasksById]);

  const restoreHistory = useCallback(async (direction: "UNDO" | "REDO"): Promise<void> => {
    if (savingVisualEdit || disabled) return;
    const source = direction === "UNDO" ? undoStack.current : redoStack.current;
    const destination = direction === "UNDO" ? redoStack.current : undoStack.current;
    const entry = source.pop();
    if (entry === undefined) return;
    setSavingVisualEdit(true);
    const taskToSave = direction === "UNDO" ? entry.beforeTask : entry.afterTask;
    const dependenciesToSave = direction === "UNDO" ? entry.beforeDependencies : entry.afterDependencies;
    try {
      if (await onSave(taskToSave, dependenciesToSave)) {
        destination.push(entry);
        setAnnouncement(`${entry.label}: ${direction === "UNDO" ? "desfeito" : "refeito"}.`);
      } else {
        source.push(entry);
        setLocalError("Não foi possível restaurar a alteração do Gantt.");
      }
    } catch (error) {
      source.push(entry);
      setLocalError(error instanceof Error ? error.message : "Não foi possível restaurar a alteração do Gantt.");
    } finally {
      setHistoryState((current) => ({
        canUndo: undoStack.current.length > 0,
        canRedo: redoStack.current.length > 0,
        revision: current.revision + 1,
      }));
      setSavingVisualEdit(false);
      resetGanttProjection();
    }
  }, [disabled, onSave, resetGanttProjection, savingVisualEdit]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLocaleLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      void restoreHistory(key === "z" && !event.shiftKey ? "UNDO" : "REDO");
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => { window.removeEventListener("keydown", handleHistoryShortcut); };
  }, [restoreHistory]);

  const saveVisualDependency = useCallback(async (link: Partial<ILink>): Promise<void> => {
    if (savingVisualEdit || disabled) return;
    const predecessorId = String(link.source ?? "");
    const successorId = String(link.target ?? "");
    if (link.type !== "e2s") {
      setLocalError("Nesta versão, crie somente dependências Término para Início (FS).");
      resetGanttProjection();
      return;
    }
    if (predecessorId === successorId) {
      setLocalError("Uma tarefa não pode depender dela mesma.");
      resetGanttProjection();
      return;
    }
    if (summaryIds.has(predecessorId) || summaryIds.has(successorId)) {
      setLocalError("Crie dependências entre tarefas executáveis, não entre tarefas-resumo.");
      resetGanttProjection();
      return;
    }
    setSavingVisualEdit(true);
    setLocalError(null);
    try {
      const created = await onCreateDependency({ predecessorId, successorId, lagDays: 0 });
      if (created === null) {
        setLocalError("Não foi possível criar a dependência. Verifique se ela produziria um ciclo.");
        resetGanttProjection();
      } else {
        setFocusedDependencyId(created.id);
        setAnnouncement("Dependência FS criada com intervalo zero.");
        resetGanttProjection();
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível salvar a dependência. Nenhuma alteração foi aplicada.");
      resetGanttProjection();
    } finally {
      setSavingVisualEdit(false);
    }
  }, [disabled, onCreateDependency, resetGanttProjection, savingVisualEdit, summaryIds]);

  useEffect(() => {
    if (ganttApi === null) return;
    const listenerTag = Symbol("projectflow-gantt-edits");
    ganttApi.intercept("update-task", (input) => {
      if (input.eventSource !== undefined) return true;
      if (input.inProgress === true) return true;
      void saveVisualTaskEdit(input);
      return true;
    }, { tag: listenerTag });
    ganttApi.intercept("add-link", ({ link }) => {
      void saveVisualDependency(link);
      return true;
    }, { tag: listenerTag });
    return () => { ganttApi.detach(listenerTag); };
  }, [ganttApi, saveVisualDependency, saveVisualTaskEdit]);

  const saveSchedule = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (selectedTask === null || isSummary) return;
    if (startDate.length === 0 || !Number.isInteger(durationDays) || durationDays < 1) {
      setLocalError("Informe uma data de início e uma duração inteira maior que zero.");
      return;
    }
    const calendarId = selectedTask.calendarId ?? projectCalendarId;
    const calendar = calendars.find((candidate) => candidate.id === calendarId);
    if (calendar === undefined) {
      setLocalError("O calendário efetivo da tarefa não foi encontrado.");
      return;
    }
    try {
      const withStart = applyScheduleEdit(
        selectedTask,
        { field: "startDate", value: startDate },
        calendar,
      );
      const scheduled = applyScheduleEdit(
        withStart,
        { field: "durationDays", value: durationDays },
        calendar,
      );
      const saved = await onSave(scheduled);
      if (!saved) return;
      setLocalError(null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível alterar o cronograma.");
    }
  };

  return (
    <section className="gantt-section" aria-labelledby="gantt-title">
      <header className="view-heading gantt-heading">
        <div>
          <h2 id="gantt-title">Gráfico de Gantt</h2>
          <p>Arraste o centro para mover; em tarefas automáticas, o intervalo FS é ajustado. Para criar ou excluir dependências FS, use o botão direito na tarefa ou na linha.</p>
        </div>
        <label className="gantt-scale-control">
          <span>Escala</span>
          <select value={scale} onChange={(event) => { setScale(event.target.value as GanttScale); }}>
            <option value="DAY">Dias</option>
            <option value="WEEK">Semanas</option>
            <option value="MONTH">Meses</option>
          </select>
        </label>
      </header>
      {savingVisualEdit ? <p className="gantt-saving" role="status">Salvando alteração do Gantt…</p> : null}
      <div className="gantt-history-actions" aria-label="Histórico de alterações do Gantt">
        <button type="button" disabled={disabled || savingVisualEdit || !historyState.canUndo} onClick={() => { void restoreHistory("UNDO"); }}>Desfazer</button>
        <button type="button" disabled={disabled || savingVisualEdit || !historyState.canRedo} onClick={() => { void restoreHistory("REDO"); }}>Refazer</button>
        {announcement.length > 0 ? <span key={historyState.revision} role="status">{announcement}</span> : null}
      </div>
      {localError === null ? null : <p className="field-error gantt-error" role="alert">{localError}</p>}

      <div className="gantt-legend" aria-label="Legenda do Gantt">
        <span><i className="legend-task" /> Tarefa</span>
        <span><i className="legend-summary" /> Resumo</span>
        <span><i className="legend-weekend" /> Final de semana</span>
        <span><i className="legend-holiday" /> Feriado</span>
        <span><i className="legend-link" /> Dependência FS</span>
      </div>

      {projection.links.length === 0 ? null : (
        <div className="gantt-dependency-focus">
          <label>
            <span>Dependência em foco</span>
            <select
              aria-label="Dependência em foco"
              value={focusedDependencyId ?? ""}
              onChange={(event) => { setFocusedDependencyId(event.target.value || null); }}
            >
              <option value="">Todas as dependências</option>
              {projection.links.map((link) => {
                const dependency = dependenciesById.get(String(link.id));
                return dependency === undefined ? null : (
                  <option value={dependency.id} key={dependency.id}>
                    {dependencyLabel(dependency)}
                  </option>
                );
              })}
            </select>
          </label>
          <p>
            {focusedDependency === null
              ? "Clique em uma linha ou escolha a relação para isolar seu caminho."
              : `Em foco: ${dependencyLabel(focusedDependency)}`}
          </p>
        </div>
      )}

      {projection.tasks.length === 0 ? (
        <div className="view-empty" role="status">
          <strong>Nenhuma tarefa agendada corresponde aos filtros.</strong>
          <span>Defina início e duração na Tabela ou ajuste os filtros.</span>
        </div>
      ) : (
        <div className="gantt-layout">
          <div
            className={`gantt-chart-shell${focusedLink === null ? "" : " dependency-focus-active"}`}
            data-testid="projectflow-gantt"
            onClick={focusDependencyFromChart}
            onContextMenu={openContextMenu}
          >
            <Willow fonts={false}>
              <Gantt
                key={ganttRevision}
                tasks={[...projection.tasks]}
                links={[...projection.links]}
                columns={GANTT_COLUMNS}
                scales={scaleConfig.scales}
                cellWidth={scaleConfig.cellWidth}
                cellHeight={42}
                gridWidth={430}
                readonly={disabled || savingVisualEdit}
                zoom
                init={setGanttApi}
                selected={selectedGanttTaskIds}
                highlightTime={(date, unit) =>
                  unit === "day" && projectCalendar !== undefined
                    ? ganttCalendarClass(projectCalendar, date)
                    : ""
                }
              />
            </Willow>
          </div>

          {contextMenu === null ? null : (
            <div
              className="gantt-context-menu"
              ref={contextMenuRef}
              role="dialog"
              aria-label="Ações do Gantt"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onPointerDown={(event) => { event.stopPropagation(); }}
            >
              {contextMenu.dependencyId === null ? null : (
                <button type="button" onClick={() => { void deleteContextDependency(); }}>
                  Excluir dependência
                </button>
              )}
              {contextTask === null || summaryIds.has(contextTask.id) ? null : (
                <>
                  <button
                    type="button"
                    onClick={() => { setContextMenu((current) => current === null ? null : { ...current, addPredecessor: true }); }}
                  >
                    Adicionar predecessora…
                  </button>
                  {contextMenu.addPredecessor ? (
                    <div className="gantt-context-predecessor">
                      <label>
                        <span>Predecessora FS</span>
                        <select value={contextPredecessorId} autoFocus onChange={(event) => { setContextPredecessorId(event.target.value); }}>
                          <option value="">Selecione uma tarefa</option>
                          {predecessorOptions.map((task) => (
                            <option value={task.id} key={task.id}>{taskOutlineLabel(task, outlineNumbers)}</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" disabled={contextPredecessorId.length === 0} onClick={() => { void addContextPredecessor(); }}>
                        Criar FS
                      </button>
                      {predecessorOptions.length === 0 ? (
                        <p>Nenhuma tarefa anterior elegível.</p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          <aside className="gantt-inspector" aria-labelledby="gantt-inspector-title">
            <h3 id="gantt-inspector-title">Inspecionar tarefa</h3>
            <label>
              <span>Tarefa</span>
              <select
                aria-label="Tarefa selecionada no Gantt"
                value={selectedTask?.id ?? ""}
                onChange={(event) => { selectTask(event.target.value || null); }}
              >
                <option value="">Selecione no gráfico</option>
                {tasks.map((task) => <option value={task.id} key={task.id}>{taskOutlineLabel(task, outlineNumbers)}</option>)}
              </select>
            </label>
            {selectedTask === null ? (
              <p className="gantt-inspector-empty">Selecione uma barra ou uma tarefa para revisar seus dados.</p>
            ) : (
              <>
                <dl>
                  <div><dt>Status</dt><dd>{TASK_STATUS_LABELS[selectedTask.status]}</dd></div>
                  <div><dt>Modo</dt><dd>{SCHEDULING_MODE_LABELS[selectedTask.schedulingMode]}</dd></div>
                  <div><dt>Progresso</dt><dd>{String(selectedTask.progress)}%</dd></div>
                </dl>
                <form className="gantt-schedule-form" onSubmit={(event) => { void saveSchedule(event); }}>
                  <label>
                    <span>Início</span>
                    <input
                      type="date"
                      required
                      value={startDate}
                      disabled={disabled || isSummary || selectedHasPredecessors}
                      onChange={(event) => { setStartDate(event.target.value); }}
                    />
                  </label>
                  <label>
                    <span>Duração útil</span>
                    <input
                      type="number"
                      min={1}
                      required
                      value={durationDays}
                      disabled={disabled || isSummary}
                      onChange={(event) => { setDurationDays(Number(event.target.value)); }}
                    />
                  </label>
                  {isSummary ? (
                    <p className="gantt-summary-note">Datas de tarefas-resumo são derivadas das subtarefas.</p>
                  ) : selectedHasPredecessors ? (
                    <p className="gantt-summary-note">A data inicial segue as predecessoras. Mover a barra ajusta automaticamente o lag FS; a duração continua editável.</p>
                  ) : (
                    <button className="primary-button" type="submit" disabled={disabled}>
                      Salvar cronograma
                    </button>
                  )}
                  {!isSummary && selectedHasPredecessors ? (
                    <button className="primary-button" type="submit" disabled={disabled}>Salvar duração</button>
                  ) : null}
                </form>
              </>
            )}
          </aside>
        </div>
      )}
      {projection.unscheduledCount > 0 ? (
        <p className="gantt-unscheduled-note">
          {String(projection.unscheduledCount)} tarefa{projection.unscheduledCount === 1 ? "" : "s"} sem cronograma não {projection.unscheduledCount === 1 ? "é exibida" : "são exibidas"} como barra.
        </p>
      ) : null}
    </section>
  );
}
