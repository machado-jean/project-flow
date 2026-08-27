import {
  optionalText,
  requireIsoTimestamp,
  requireNonNegativeInteger,
  requireText,
  requireUuid,
} from "../shared/validation";

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  ACTIVE: "Ativo",
  ON_HOLD: "Em espera",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly calendarId: string;
  readonly position: number;
  readonly isArchived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function isProjectStatus(value: string): value is ProjectStatus {
  return PROJECT_STATUSES.some((status) => status === value);
}

export function validateProject(project: Project): Project {
  if (!isProjectStatus(project.status)) {
    throw new Error("O status do projeto não é válido.");
  }

  return {
    ...project,
    id: requireUuid(project.id, "id", "O projeto"),
    name: requireText(project.name, "name", "O nome do projeto"),
    description: optionalText(project.description),
    calendarId: requireUuid(project.calendarId, "calendarId", "O calendário"),
    position: requireNonNegativeInteger(project.position, "position", "A posição do projeto"),
    createdAt: requireIsoTimestamp(project.createdAt, "createdAt"),
    updatedAt: requireIsoTimestamp(project.updatedAt, "updatedAt"),
  };
}

