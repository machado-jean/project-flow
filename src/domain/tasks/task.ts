import {
  DomainValidationError,
  optionalText,
  requireDateOnly,
  requireIsoTimestamp,
  requireNonNegativeInteger,
  requireText,
  requireUuid,
} from "../shared/validation";

export const TASK_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
] as const;
export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export const SCHEDULING_MODES = ["AUTO", "MANUAL"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type SchedulingMode = (typeof SCHEDULING_MODES)[number];

export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  NOT_STARTED: "Não iniciada",
  IN_PROGRESS: "Em andamento",
  BLOCKED: "Bloqueada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const TASK_PRIORITY_LABELS: Readonly<Record<TaskPriority, string>> = {
  LOW: "Baixa",
  NORMAL: "Normal",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const SCHEDULING_MODE_LABELS: Readonly<Record<SchedulingMode, string>> = {
  AUTO: "Automático",
  MANUAL: "Manual",
};

export interface Task {
  readonly id: string;
  readonly code: string | null;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly calendarId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly progress: number;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly durationDays: number | null;
  readonly schedulingMode: SchedulingMode;
  readonly position: number;
  readonly assignee: string | null;
  readonly tags: readonly string[];
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function includesValue<const T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.some((candidate) => candidate === value);
}

export function isTaskStatus(value: string): value is TaskStatus {
  return includesValue(TASK_STATUSES, value);
}

export function isTaskPriority(value: string): value is TaskPriority {
  return includesValue(TASK_PRIORITIES, value);
}

export function isSchedulingMode(value: string): value is SchedulingMode {
  return includesValue(SCHEDULING_MODES, value);
}

export function normalizeTags(tags: readonly string[]): string[] {
  const normalized = new Map<string, string>();

  for (const rawTag of tags) {
    const tag = requireText(rawTag, "tags", "A tag");
    if (tag.length > 80) {
      throw new DomainValidationError(
        "tag_too_long",
        "tags",
        "Cada tag deve possuir no máximo 80 caracteres.",
      );
    }
    normalized.set(tag.toLocaleLowerCase("pt-BR"), tag);
  }

  return [...normalized.values()].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function validateSchedule(task: Task): Pick<Task, "startDate" | "endDate" | "durationDays"> {
  const values = [task.startDate, task.endDate, task.durationDays];
  const emptyValues = values.filter((value) => value === null).length;

  if (emptyValues === values.length) {
    return { startDate: null, endDate: null, durationDays: null };
  }

  if (emptyValues > 0) {
    throw new DomainValidationError(
      "incomplete_schedule",
      "schedule",
      "Início, fim e duração devem ser informados juntos.",
    );
  }

  const startDate = requireDateOnly(task.startDate as string, "startDate", "A data de início");
  const endDate = requireDateOnly(task.endDate as string, "endDate", "A data de fim");
  const durationDays = task.durationDays as number;

  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new DomainValidationError(
      "invalid_duration",
      "durationDays",
      "A duração deve ser um número inteiro maior ou igual a um.",
    );
  }

  if (endDate < startDate) {
    throw new DomainValidationError(
      "invalid_date_range",
      "endDate",
      "A data de fim não pode ser anterior à data de início.",
    );
  }

  return { startDate, endDate, durationDays };
}

export function validateTask(task: Task): Task {
  if (!isTaskStatus(task.status)) {
    throw new DomainValidationError("invalid_status", "status", "O status da tarefa não é válido.");
  }
  if (!isTaskPriority(task.priority)) {
    throw new DomainValidationError(
      "invalid_priority",
      "priority",
      "A prioridade da tarefa não é válida.",
    );
  }
  if (!isSchedulingMode(task.schedulingMode)) {
    throw new DomainValidationError(
      "invalid_scheduling_mode",
      "schedulingMode",
      "O modo de agendamento não é válido.",
    );
  }
  if (!Number.isInteger(task.progress) || task.progress < 0 || task.progress > 100) {
    throw new DomainValidationError(
      "invalid_progress",
      "progress",
      "O progresso deve ser um número inteiro entre 0 e 100.",
    );
  }

  const schedule = validateSchedule(task);

  return {
    ...task,
    id: requireUuid(task.id, "id", "A tarefa"),
    projectId: requireUuid(task.projectId, "projectId", "O projeto"),
    parentId:
      task.parentId === null ? null : requireUuid(task.parentId, "parentId", "A tarefa-pai"),
    calendarId:
      task.calendarId === null
        ? null
        : requireUuid(task.calendarId, "calendarId", "O calendário da tarefa"),
    code: optionalText(task.code),
    title: requireText(task.title, "title", "O título da tarefa"),
    description: optionalText(task.description),
    ...schedule,
    position: requireNonNegativeInteger(task.position, "position", "A posição da tarefa"),
    assignee: optionalText(task.assignee),
    tags: normalizeTags(task.tags),
    notes: optionalText(task.notes),
    createdAt: requireIsoTimestamp(task.createdAt, "createdAt"),
    updatedAt: requireIsoTimestamp(task.updatedAt, "updatedAt"),
  };
}
