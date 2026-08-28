import type { Calendar } from "../calendars/calendar";
import { workingDaysBetween } from "../calendars/working-calendar";
import type { Task } from "../tasks/task";

export type CalendarForTask = (task: Task) => Calendar;

function taskDepth(task: Task, tasksById: ReadonlyMap<string, Task>): number {
  let depth = 0;
  let parentId = task.parentId;
  const visited = new Set<string>();
  while (parentId !== null) {
    if (visited.has(parentId)) break;
    visited.add(parentId);
    depth += 1;
    parentId = tasksById.get(parentId)?.parentId ?? null;
  }
  return depth;
}

export function recalculateSummaryTasks(
  tasks: readonly Task[],
  calendarForTask: CalendarForTask,
): readonly Task[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const summaryIds = new Set(
    tasks.flatMap((task) => (task.parentId === null ? [] : [task.parentId])),
  );
  const summaries = tasks
    .filter((task) => summaryIds.has(task.id))
    .sort((left, right) => taskDepth(right, tasksById) - taskDepth(left, tasksById));

  for (const summary of summaries) {
    const descendants = [...tasksById.values()].filter((candidate) => {
      let parentId = candidate.parentId;
      const visited = new Set<string>();
      while (parentId !== null) {
        if (parentId === summary.id) return true;
        if (visited.has(parentId)) return false;
        visited.add(parentId);
        parentId = tasksById.get(parentId)?.parentId ?? null;
      }
      return false;
    });
    const scheduled = descendants.filter(
      (task) => task.startDate !== null && task.endDate !== null,
    );
    const startDate = scheduled
      .map((task) => task.startDate as string)
      .sort((left, right) => left.localeCompare(right))[0] ?? null;
    const endDate = scheduled
      .map((task) => task.endDate as string)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
    const durationDays =
      startDate === null || endDate === null
        ? null
        : Math.max(1, workingDaysBetween(calendarForTask(summary), startDate, endDate));
    tasksById.set(summary.id, { ...summary, startDate, endDate, durationDays });
  }

  return tasks.map((task) => tasksById.get(task.id) ?? task);
}
