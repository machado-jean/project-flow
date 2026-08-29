import type { Task, TaskPriority, TaskStatus } from "../../domain/tasks/task";

export type CompletionFilter = "ALL" | "COMPLETED" | "OPEN";

export interface TaskFilters {
  readonly query: string;
  readonly status: TaskStatus | "ALL";
  readonly priority: TaskPriority | "ALL";
  readonly completion: CompletionFilter;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly tag: string;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  query: "",
  status: "ALL",
  priority: "ALL",
  completion: "ALL",
  dateFrom: "",
  dateTo: "",
  tag: "",
};

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function matchesText(task: Task, query: string): boolean {
  const search = normalized(query);
  if (search.length === 0) return true;

  return [
    task.title,
    task.code,
    task.description,
    task.assignee,
    task.notes,
    ...task.tags,
  ].some((value) => value !== null && normalized(value).includes(search));
}

function matchesDateRange(task: Task, dateFrom: string, dateTo: string): boolean {
  if (dateFrom.length === 0 && dateTo.length === 0) return true;
  if (task.startDate === null || task.endDate === null) return false;
  if (dateFrom.length > 0 && task.endDate < dateFrom) return false;
  if (dateTo.length > 0 && task.startDate > dateTo) return false;
  return true;
}

export function taskMatchesFilters(task: Task, filters: TaskFilters): boolean {
  if (!matchesText(task, filters.query)) return false;
  if (filters.status !== "ALL" && task.status !== filters.status) return false;
  if (filters.priority !== "ALL" && task.priority !== filters.priority) return false;
  if (filters.completion === "COMPLETED" && task.status !== "COMPLETED") return false;
  if (filters.completion === "OPEN" && task.status === "COMPLETED") return false;
  if (!matchesDateRange(task, filters.dateFrom, filters.dateTo)) return false;

  const tag = normalized(filters.tag);
  return tag.length === 0 || task.tags.some((candidate) => normalized(candidate).includes(tag));
}

export function filterTasks(tasks: readonly Task[], filters: TaskFilters): readonly Task[] {
  return tasks.filter((task) => taskMatchesFilters(task, filters));
}

export function includeTaskAncestors(
  tasks: readonly Task[],
  matchingTasks: readonly Task[],
): ReadonlySet<string> {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const visibleIds = new Set(matchingTasks.map((task) => task.id));

  for (const task of matchingTasks) {
    let parentId = task.parentId;
    const visited = new Set<string>();
    while (parentId !== null && !visited.has(parentId)) {
      visited.add(parentId);
      visibleIds.add(parentId);
      parentId = tasksById.get(parentId)?.parentId ?? null;
    }
  }

  return visibleIds;
}

export function hasActiveTaskFilters(filters: TaskFilters): boolean {
  return Object.entries(filters).some(([key, value]) => {
    if (key === "status" || key === "priority" || key === "completion") return value !== "ALL";
    return value !== "";
  });
}
