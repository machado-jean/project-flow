import type { ILink, ITask } from "@svar-ui/react-gantt";

import type { Calendar } from "../../domain/calendars/calendar";
import { isWorkingDay } from "../../domain/calendars/working-calendar";
import type { TaskDependency } from "../../domain/scheduling/dependency";
import { flattenVisibleTasks } from "../../domain/tasks/hierarchy";
import {
  buildTaskOutlineNumbers,
  taskOutlineLabel,
} from "../../domain/tasks/outline-number";
import { TASK_STATUS_LABELS, type Task } from "../../domain/tasks/task";

export interface GanttProjection {
  readonly tasks: readonly ITask[];
  readonly links: readonly ILink[];
  readonly unscheduledCount: number;
}

export function dateOnlyToLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("A data do Gantt deve usar o formato YYYY-MM-DD.");
  }
  return new Date(year, month - 1, day);
}

export function localDateToDateOnly(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function inclusiveDateOnlyToExclusiveLocalDate(value: string): Date {
  const exclusiveEnd = dateOnlyToLocalDate(value);
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
  return exclusiveEnd;
}

function orderedTasks(tasks: readonly Task[]): readonly Task[] {
  const summaryIds = new Set(
    tasks.flatMap((task) => task.parentId === null ? [] : [task.parentId]),
  );
  return flattenVisibleTasks(tasks, summaryIds).map(({ task }) => task);
}

export function buildGanttProjection(
  tasks: readonly Task[],
  allProjectTasks: readonly Task[],
  dependencies: readonly TaskDependency[],
): GanttProjection {
  const summaryIds = new Set(
    allProjectTasks.flatMap((task) => task.parentId === null ? [] : [task.parentId]),
  );
  const outlineNumbers = buildTaskOutlineNumbers(allProjectTasks);
  const scheduledTasks = tasks.filter(
    (task) =>
      task.startDate !== null &&
      task.endDate !== null &&
      task.durationDays !== null,
  );
  const scheduledIds = new Set(scheduledTasks.map((task) => task.id));
  const projectedParentIds = new Set(
    scheduledTasks.flatMap((task) =>
      task.parentId !== null && scheduledIds.has(task.parentId) ? [task.parentId] : [],
    ),
  );
  const projectionTasks: ITask[] = orderedTasks(scheduledTasks).map((task) => ({
    id: task.id,
    text: taskOutlineLabel(task, outlineNumbers),
    details: `${TASK_STATUS_LABELS[task.status]} · ${String(task.progress)}%`,
    start: dateOnlyToLocalDate(task.startDate as string),
    end: inclusiveDateOnlyToExclusiveLocalDate(task.endDate as string),
    workDuration: task.durationDays as number,
    progress: task.progress,
    parent: task.parentId !== null && scheduledIds.has(task.parentId) ? task.parentId : 0,
    type: summaryIds.has(task.id) ? "summary" : "task",
    open: projectedParentIds.has(task.id),
  }));
  const links: ILink[] = dependencies
    .filter(
      (dependency) =>
        scheduledIds.has(dependency.predecessorId) && scheduledIds.has(dependency.successorId),
    )
    .map((dependency) => ({
      id: dependency.id,
      source: dependency.predecessorId,
      target: dependency.successorId,
      type: "e2s",
      lag: dependency.lagDays,
    }));

  return {
    tasks: projectionTasks,
    links,
    unscheduledCount: tasks.length - scheduledTasks.length,
  };
}

export function ganttCalendarClass(calendar: Calendar, date: Date): string {
  const dateOnly = localDateToDateOnly(date);
  const exception = calendar.exceptions.find((candidate) => candidate.date === dateOnly);
  if (exception !== undefined && !exception.isWorkingDay) return "projectflow-gantt-holiday";
  return isWorkingDay(calendar, dateOnly) ? "" : "projectflow-gantt-weekend";
}
