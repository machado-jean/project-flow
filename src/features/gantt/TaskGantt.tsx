import {
  Gantt,
  Willow,
  type IApi,
  type IColumnConfig,
  type IScaleConfig,
} from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/all.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type SyntheticEvent,
} from "react";

import type { Calendar } from "../../domain/calendars/calendar";
import { applyScheduleEdit } from "../../domain/scheduling/schedule-edit";
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
  readonly onSave: (task: Task) => Promise<boolean>;
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

export function TaskGantt({
  tasks,
  allProjectTasks,
  calendars,
  projectCalendarId,
  dependencies,
  disabled,
  onSave,
}: TaskGanttProps) {
  const [scale, setScale] = useState<GanttScale>("DAY");
  const [ganttApi, setGanttApi] = useState<IApi | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusedDependencyId, setFocusedDependencyId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [durationDays, setDurationDays] = useState(1);
  const [localError, setLocalError] = useState<string | null>(null);
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
  const renderedLinks = focusedLink === null ? projection.links : [focusedLink];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const summaryIds = useMemo(
    () => new Set(allProjectTasks.flatMap((task) => task.parentId === null ? [] : [task.parentId])),
    [allProjectTasks],
  );
  const isSummary = selectedTask !== null && summaryIds.has(selectedTask.id);
  const projectCalendar = calendars.find((calendar) => calendar.id === projectCalendarId);
  const selectedGanttTaskIds = focusedDependency === null
    ? selectedTaskId === null ? [] : [selectedTaskId]
    : [focusedDependency.predecessorId, focusedDependency.successorId];

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
    const linkId = linkElement?.getAttribute("data-link-id");
    if (linkId !== null && linkId !== undefined && dependenciesById.has(linkId)) {
      setFocusedDependencyId(linkId);
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
          <p>O gráfico projeta o scheduler; edições seguras são salvas pelo painel lateral.</p>
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
          >
            <Willow fonts={false}>
              <Gantt
                tasks={[...projection.tasks]}
                links={[...renderedLinks]}
                columns={GANTT_COLUMNS}
                scales={scaleConfig.scales}
                cellWidth={scaleConfig.cellWidth}
                cellHeight={42}
                gridWidth={430}
                readonly
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
                      disabled={disabled || isSummary}
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
                  ) : (
                    <button className="primary-button" type="submit" disabled={disabled}>
                      Salvar cronograma
                    </button>
                  )}
                  {localError === null ? null : <p className="field-error" role="alert">{localError}</p>}
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
