import { DomainValidationError } from "../shared/validation";
import type { Task } from "../tasks/task";
import { validateTaskDependency, type TaskDependency } from "./dependency";

function adjacency(taskIds: readonly string[], dependencies: readonly TaskDependency[]) {
  const successors = new Map(taskIds.map((taskId) => [taskId, [] as string[]]));
  for (const dependency of dependencies) {
    successors.get(dependency.predecessorId)?.push(dependency.successorId);
  }
  return successors;
}

export function detectCycle(
  taskIds: readonly string[],
  dependencies: readonly TaskDependency[],
): readonly string[] | null {
  const successors = adjacency(taskIds, dependencies);
  const visited = new Set<string>();
  const active = new Set<string>();
  const path: string[] = [];

  const visit = (taskId: string): readonly string[] | null => {
    if (active.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      return [...path.slice(cycleStart), taskId];
    }
    if (visited.has(taskId)) return null;

    active.add(taskId);
    path.push(taskId);
    for (const successorId of successors.get(taskId) ?? []) {
      const cycle = visit(successorId);
      if (cycle !== null) return cycle;
    }
    path.pop();
    active.delete(taskId);
    visited.add(taskId);
    return null;
  };

  for (const taskId of taskIds) {
    const cycle = visit(taskId);
    if (cycle !== null) return cycle;
  }
  return null;
}

export function topologicalSort(
  taskIds: readonly string[],
  dependencies: readonly TaskDependency[],
): readonly string[] {
  const successors = adjacency(taskIds, dependencies);
  const indegree = new Map(taskIds.map((taskId) => [taskId, 0]));
  for (const dependency of dependencies) {
    indegree.set(dependency.successorId, (indegree.get(dependency.successorId) ?? 0) + 1);
  }

  const ready = taskIds.filter((taskId) => indegree.get(taskId) === 0);
  const ordered: string[] = [];
  while (ready.length > 0) {
    const taskId = ready.shift();
    if (taskId === undefined) break;
    ordered.push(taskId);
    for (const successorId of successors.get(taskId) ?? []) {
      const nextIndegree = (indegree.get(successorId) ?? 0) - 1;
      indegree.set(successorId, nextIndegree);
      if (nextIndegree === 0) ready.push(successorId);
    }
  }

  if (ordered.length !== taskIds.length) {
    throw new DomainValidationError(
      "dependency_cycle",
      "dependencies",
      "As dependências criam um ciclo entre tarefas.",
    );
  }
  return ordered;
}

export function validateGraph(
  tasks: readonly Task[],
  dependencies: readonly TaskDependency[],
): readonly TaskDependency[] {
  const normalized = dependencies.map((dependency) => validateTaskDependency(dependency, tasks));
  const uniqueRelations = new Set<string>();
  for (const dependency of normalized) {
    const relation = `${dependency.predecessorId}:${dependency.successorId}:${dependency.type}`;
    if (uniqueRelations.has(relation)) {
      throw new DomainValidationError(
        "duplicate_dependency",
        "dependencies",
        "Essa dependência já existe.",
      );
    }
    uniqueRelations.add(relation);
  }

  const cycle = detectCycle(
    tasks.map(({ id }) => id),
    normalized,
  );
  if (cycle !== null) {
    throw new DomainValidationError(
      "dependency_cycle",
      "dependencies",
      "As dependências criam um ciclo entre tarefas.",
    );
  }
  return normalized;
}

export function affectedTaskIds(
  changedTaskIds: readonly string[],
  dependencies: readonly TaskDependency[],
): ReadonlySet<string> {
  const successors = adjacency(
    [...new Set(dependencies.flatMap(({ predecessorId, successorId }) => [predecessorId, successorId]))],
    dependencies,
  );
  const affected = new Set(changedTaskIds);
  const pending = [...changedTaskIds];
  while (pending.length > 0) {
    const taskId = pending.shift();
    if (taskId === undefined) break;
    for (const successorId of successors.get(taskId) ?? []) {
      if (!affected.has(successorId)) {
        affected.add(successorId);
        pending.push(successorId);
      }
    }
  }
  return affected;
}
