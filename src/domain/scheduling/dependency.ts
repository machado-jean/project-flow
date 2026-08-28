import {
  DomainValidationError,
  requireIsoTimestamp,
  requireNonNegativeInteger,
  requireUuid,
} from "../shared/validation";
import type { Task } from "../tasks/task";

export const DEPENDENCY_TYPES = ["FS"] as const;

export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export interface TaskDependency {
  readonly id: string;
  readonly projectId: string;
  readonly predecessorId: string;
  readonly successorId: string;
  readonly type: DependencyType;
  readonly lagDays: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function validateTaskDependency(
  dependency: Omit<TaskDependency, "type"> & { readonly type: string },
  tasks: readonly Task[],
): TaskDependency {
  if (dependency.type !== "FS") {
    throw new DomainValidationError(
      "unsupported_dependency_type",
      "type",
      "Somente dependências Término para Início (TI) estão disponíveis nesta versão.",
    );
  }

  const validated = {
    ...dependency,
    type: "FS" as const,
    id: requireUuid(dependency.id, "id", "A dependência"),
    projectId: requireUuid(dependency.projectId, "projectId", "O projeto"),
    predecessorId: requireUuid(
      dependency.predecessorId,
      "predecessorId",
      "A tarefa predecessora",
    ),
    successorId: requireUuid(dependency.successorId, "successorId", "A tarefa sucessora"),
    lagDays: requireNonNegativeInteger(dependency.lagDays, "lagDays", "O intervalo"),
    createdAt: requireIsoTimestamp(dependency.createdAt, "createdAt"),
    updatedAt: requireIsoTimestamp(dependency.updatedAt, "updatedAt"),
  };

  if (validated.predecessorId === validated.successorId) {
    throw new DomainValidationError(
      "self_dependency",
      "predecessorId",
      "Uma tarefa não pode ser predecessora dela mesma.",
    );
  }

  const predecessor = tasks.find((task) => task.id === validated.predecessorId);
  const successor = tasks.find((task) => task.id === validated.successorId);
  if (predecessor === undefined || successor === undefined) {
    throw new DomainValidationError(
      "dependency_task_not_found",
      "predecessorId",
      "As duas tarefas da dependência devem existir.",
    );
  }
  if (
    predecessor.projectId !== validated.projectId ||
    successor.projectId !== validated.projectId
  ) {
    throw new DomainValidationError(
      "cross_project_dependency",
      "projectId",
      "Predecessora e sucessora devem pertencer ao mesmo projeto.",
    );
  }

  const summaryTaskId = [predecessor.id, successor.id].find((taskId) =>
    tasks.some((task) => task.parentId === taskId),
  );
  if (summaryTaskId !== undefined) {
    throw new DomainValidationError(
      "summary_dependency",
      "predecessorId",
      "Tarefas-resumo não podem possuir dependências; relacione suas subtarefas.",
    );
  }

  return validated;
}
