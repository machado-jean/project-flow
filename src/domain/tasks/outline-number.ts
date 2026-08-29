import { flattenVisibleTasks } from "./hierarchy";
import type { Task } from "./task";

export function buildTaskOutlineNumbers(
  tasks: readonly Task[],
): ReadonlyMap<string, string> {
  const expandedTaskIds = new Set(tasks.map((task) => task.id));
  const counters: number[] = [];
  const outlineNumbers = new Map<string, string>();

  for (const { task, depth } of flattenVisibleTasks(tasks, expandedTaskIds)) {
    counters.length = depth + 1;
    counters[depth] = (counters[depth] ?? 0) + 1;
    outlineNumbers.set(task.id, counters.join("."));
  }

  return outlineNumbers;
}

export function titleWithoutMatchingOutline(
  title: string,
  outlineNumber: string,
): string {
  const prefix = `${outlineNumber}. `;
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

export function taskOutlineLabel(
  task: Task,
  outlineNumbers: ReadonlyMap<string, string>,
): string {
  const outlineNumber = outlineNumbers.get(task.id);
  if (outlineNumber === undefined) return task.title;
  return `${outlineNumber}. ${titleWithoutMatchingOutline(task.title, outlineNumber)}`;
}
