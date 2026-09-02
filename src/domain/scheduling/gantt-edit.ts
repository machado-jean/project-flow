import type { Calendar } from "../calendars/calendar";
import { addCalendarDays } from "../calendars/date-only";
import { addWorkingDays, onOrNextWorkingDay } from "../calendars/working-calendar";
import { applyScheduleEdit } from "./schedule-edit";
import type { TaskDependency } from "./dependency";
import type { Task } from "../tasks/task";

export type GanttDateEditMode = "MOVE" | "START" | "END";

export interface GanttDateEdit {
  readonly mode: GanttDateEditMode;
  readonly differenceInCalendarDays: number;
}

export interface GanttFsMoveResult {
  readonly task: Task;
  readonly dependencyUpdates: readonly TaskDependency[];
  readonly appliedStartDate: string;
  readonly requestedStartDate: string;
  readonly calendarAdjusted: boolean;
  readonly limitingPredecessorIds: readonly string[];
}

function fsStart(calendar: Calendar, predecessorEnd: string, lagDays: number): string {
  return addWorkingDays(calendar, predecessorEnd, lagDays + 1);
}

function lagForStart(calendar: Calendar, predecessorEnd: string, targetStart: string): number {
  let lagDays = 0;
  while (fsStart(calendar, predecessorEnd, lagDays) < targetStart) lagDays += 1;
  return fsStart(calendar, predecessorEnd, lagDays) === targetStart
    ? lagDays
    : Math.max(0, lagDays - 1);
}

/** Plans a direct Gantt move without weakening FS or creating negative lag. */
export function planGanttFsMove(
  task: Task,
  differenceInCalendarDays: number,
  calendar: Calendar,
  dependencies: readonly TaskDependency[],
  tasks: readonly Task[],
): GanttFsMoveResult {
  if (task.startDate === null) throw new Error("A tarefa precisa de início para ser movida.");
  const requestedStartDate = addCalendarDays(task.startDate, differenceInCalendarDays);
  const requestedTask = applyGanttDateEdit(task, {
    mode: "MOVE",
    differenceInCalendarDays,
  }, calendar, { hasPredecessors: false, isSummary: false });
  if (requestedTask.startDate === null) throw new Error("A tarefa precisa de início para ser movida.");
  const incoming = dependencies.filter((dependency) => dependency.successorId === task.id);
  if (task.schedulingMode === "MANUAL" || incoming.length === 0) {
    return {
      task: requestedTask,
      dependencyUpdates: [],
      requestedStartDate,
      appliedStartDate: requestedTask.startDate,
      calendarAdjusted: requestedStartDate !== requestedTask.startDate,
      limitingPredecessorIds: [],
    };
  }

  const taskById = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  const schedulable = incoming.flatMap((dependency) => {
    const predecessor = taskById.get(dependency.predecessorId);
    return predecessor?.endDate === null || predecessor?.endDate === undefined
      ? []
      : [{ dependency, predecessorEnd: predecessor.endDate }];
  });
  if (schedulable.length !== incoming.length) {
    throw new Error("Todas as predecessoras precisam ter data de fim para calcular o intervalo FS.");
  }

  const minimumStart = schedulable
    .map(({ predecessorEnd }) => fsStart(calendar, predecessorEnd, 0))
    .sort((left, right) => right.localeCompare(left))[0] ?? requestedTask.startDate;
  const appliedStartDate = requestedTask.startDate < minimumStart
    ? minimumStart
    : requestedTask.startDate;
  const currentConstraints = schedulable.map(({ dependency, predecessorEnd }) => ({
    dependency,
    predecessorEnd,
    start: fsStart(calendar, predecessorEnd, dependency.lagDays),
  }));
  const currentStart = currentConstraints
    .map(({ start }) => start)
    .sort((left, right) => right.localeCompare(left))[0] ?? appliedStartDate;
  let dependencyUpdates: TaskDependency[] = [];

  if (appliedStartDate > currentStart) {
    const controller = currentConstraints.find(({ start }) => start === currentStart);
    if (controller !== undefined) {
      dependencyUpdates = [{
        ...controller.dependency,
        lagDays: lagForStart(calendar, controller.predecessorEnd, appliedStartDate),
      }];
    }
  } else if (appliedStartDate < currentStart) {
    dependencyUpdates = currentConstraints.flatMap(({ dependency, predecessorEnd, start }) => {
      if (start <= appliedStartDate) return [];
      const lagDays = lagForStart(calendar, predecessorEnd, appliedStartDate);
      return lagDays === dependency.lagDays ? [] : [{ ...dependency, lagDays }];
    });
  }

  const limitingPredecessorIds = schedulable
    .filter(({ predecessorEnd }) => fsStart(calendar, predecessorEnd, 0) === minimumStart)
    .map(({ dependency }) => dependency.predecessorId);
  return {
    task: applyScheduleEdit(task, { field: "startDate", value: appliedStartDate }, calendar),
    dependencyUpdates,
    requestedStartDate,
    appliedStartDate,
    calendarAdjusted: requestedStartDate !== requestedTask.startDate,
    limitingPredecessorIds: requestedStartDate < minimumStart ? limitingPredecessorIds : [],
  };
}

export function applyGanttDateEdit(
  task: Task,
  edit: GanttDateEdit,
  calendar: Calendar,
  options: {
    readonly hasPredecessors: boolean;
    readonly isSummary: boolean;
  },
): Task {
  if (options.isSummary) {
    throw new Error("As datas desta tarefa-resumo são calculadas pelas subtarefas.");
  }
  if (!Number.isInteger(edit.differenceInCalendarDays)) {
    throw new Error("O deslocamento do Gantt deve usar dias inteiros.");
  }
  if (task.startDate === null || task.endDate === null || task.durationDays === null) {
    throw new Error("A tarefa precisa de início, fim e duração para ser editada no Gantt.");
  }
  if (options.hasPredecessors && edit.mode !== "END") {
    throw new Error(
      "A data inicial desta tarefa é calculada pelas predecessoras. Ajuste a tarefa predecessora ou o intervalo da dependência.",
    );
  }
  if (edit.differenceInCalendarDays === 0) return task;

  if (edit.mode === "END") {
    return applyScheduleEdit(
      task,
      { field: "endDate", value: addCalendarDays(task.endDate, edit.differenceInCalendarDays) },
      calendar,
    );
  }

  const shiftedStart = addCalendarDays(task.startDate, edit.differenceInCalendarDays);
  const nextStart = edit.mode === "MOVE"
    ? onOrNextWorkingDay(calendar, shiftedStart)
    : shiftedStart;
  if (edit.mode === "MOVE") {
    return applyScheduleEdit(task, { field: "startDate", value: nextStart }, calendar);
  }

  return applyScheduleEdit(
    { ...task, durationDays: null },
    { field: "startDate", value: nextStart },
    calendar,
  );
}
