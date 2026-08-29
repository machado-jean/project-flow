import { describe, expect, it } from "vitest";

import { DEFAULT_CALENDAR_ID, type Calendar } from "../../../src/domain/calendars/calendar";
import {
  applyTaskTemplate,
  createTemplateFromTaskTree,
  duplicateProject,
  duplicateTaskTree,
} from "../../../src/domain/duplication/reuse";
import type { Project } from "../../../src/domain/projects/project";
import type { TaskDependency } from "../../../src/domain/scheduling/dependency";
import type { Task } from "../../../src/domain/tasks/task";

const NOW = "2026-08-29T12:00:00.000Z";
const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const ROOT_ID = "20000000-0000-4000-8000-000000000001";
const FIRST_ID = "20000000-0000-4000-8000-000000000002";
const SECOND_ID = "20000000-0000-4000-8000-000000000003";
const EXTERNAL_ID = "20000000-0000-4000-8000-000000000004";

const calendar: Calendar = {
  id: DEFAULT_CALENDAR_ID,
  name: "Calendário padrão",
  workingDays: [1, 2, 3, 4, 5],
  exceptions: [],
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const project: Project = {
  id: PROJECT_ID,
  name: "Implantação",
  description: "Projeto original",
  status: "ACTIVE",
  calendarId: DEFAULT_CALENDAR_ID,
  position: 0,
  isArchived: false,
  createdAt: NOW,
  updatedAt: NOW,
};

function task(id: string, title: string, parentId: string | null, position: number): Task {
  return {
    id,
    code: `COD-${String(position + 1)}`,
    projectId: PROJECT_ID,
    parentId,
    calendarId: null,
    title,
    description: `${title} detalhada`,
    status: "NOT_STARTED",
    priority: "HIGH",
    progress: 25,
    startDate: "2026-08-31",
    endDate: "2026-08-31",
    durationDays: 1,
    schedulingMode: "AUTO",
    position,
    assignee: "Jean",
    tags: ["Modelo"],
    notes: "Contexto da execução",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const tasks: readonly Task[] = [
  { ...task(ROOT_ID, "Entrega", null, 0), endDate: "2026-09-01", durationDays: 2 },
  task(FIRST_ID, "Preparar", ROOT_ID, 0),
  task(SECOND_ID, "Executar", ROOT_ID, 1),
  task(EXTERNAL_ID, "Publicar", null, 1),
];

const dependencies: readonly TaskDependency[] = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    projectId: PROJECT_ID,
    predecessorId: FIRST_ID,
    successorId: SECOND_ID,
    type: "FS",
    lagDays: 1,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    projectId: PROJECT_ID,
    predecessorId: SECOND_ID,
    successorId: EXTERNAL_ID,
    type: "FS",
    lagDays: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

function idFactory(): () => string {
  let sequence = 1;
  return () => `90000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
}

describe("reutilização de estruturas", () => {
  it("duplica uma árvore com UUIDs novos e somente relações internas", () => {
    const result = duplicateTaskTree({
      tasks,
      dependencies,
      rootTaskId: ROOT_ID,
      includeDescendants: true,
      rootPosition: 2,
      idFactory: idFactory(),
      timestamp: NOW,
    });

    expect(result.tasks).toHaveLength(3);
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0]?.lagDays).toBe(1);
    expect(result.sourceToCopyId.get(ROOT_ID)).not.toBe(ROOT_ID);
    const copiedRootId = result.sourceToCopyId.get(ROOT_ID);
    expect(result.tasks.find((candidate) => candidate.id === copiedRootId)?.position).toBe(2);
    expect(result.tasks.filter((candidate) => candidate.parentId === copiedRootId)).toHaveLength(2);
    expect(result.tasks.every((candidate) => candidate.assignee === "Jean")).toBe(true);
  });

  it("duplica somente a tarefa escolhida sem relações externas", () => {
    const result = duplicateTaskTree({
      tasks,
      dependencies,
      rootTaskId: SECOND_ID,
      includeDescendants: false,
      rootPosition: 2,
      idFactory: idFactory(),
      timestamp: NOW,
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.parentId).toBe(ROOT_ID);
    expect(result.dependencies).toHaveLength(0);
  });

  it("duplica o projeto completo preservando estrutura e relações internas", () => {
    const result = duplicateProject({
      project,
      tasks,
      dependencies,
      position: 1,
      idFactory: idFactory(),
      timestamp: NOW,
    });

    expect(result.project.id).not.toBe(project.id);
    expect(result.project.name).toBe("Implantação — cópia");
    expect(result.tasks).toHaveLength(4);
    expect(result.dependencies).toHaveLength(2);
    expect(result.tasks.every((candidate) => candidate.projectId === result.project.id)).toBe(true);
    expect(result.dependencies.every((candidate) => candidate.projectId === result.project.id)).toBe(true);
  });

  it("cria um template global sem dados específicos da execução", () => {
    const bundle = createTemplateFromTaskTree({
      name: "Entrega padrão",
      description: "Estrutura reutilizável",
      rootTaskId: ROOT_ID,
      tasks,
      dependencies,
      idFactory: idFactory(),
      timestamp: NOW,
    });

    expect(bundle.items).toHaveLength(3);
    expect(bundle.dependencies).toHaveLength(1);
    expect(bundle.items.find((item) => item.parentId === null)?.durationDays).toBeNull();
    expect(bundle.items.filter((item) => item.parentId !== null).map((item) => item.tags)).toEqual([
      ["Modelo"],
      ["Modelo"],
    ]);
  });

  it("recusa criar template quando uma tarefa-folha não possui duração", () => {
    const unscheduled = tasks.map((candidate) =>
      candidate.id === FIRST_ID
        ? { ...candidate, startDate: null, endDate: null, durationDays: null }
        : candidate,
    );

    expect(() => createTemplateFromTaskTree({
      name: "Inválido",
      description: null,
      rootTaskId: ROOT_ID,
      tasks: unscheduled,
      dependencies,
      idFactory: idFactory(),
      timestamp: NOW,
    })).toThrow("Defina a duração da tarefa “Preparar”");
  });

  it("aplica o template na data âncora e recalcula FS, lag e resumo", () => {
    const bundle = createTemplateFromTaskTree({
      name: "Entrega padrão",
      description: null,
      rootTaskId: ROOT_ID,
      tasks,
      dependencies,
      idFactory: idFactory(),
      timestamp: NOW,
    });
    const result = applyTaskTemplate({
      bundle,
      targetProject: project,
      calendars: [calendar],
      startDate: "2026-09-04",
      rootPosition: 2,
      idFactory: idFactory(),
      timestamp: NOW,
    });

    const relation = result.dependencies[0];
    const predecessor = result.tasks.find((candidate) => candidate.id === relation?.predecessorId);
    const successor = result.tasks.find((candidate) => candidate.id === relation?.successorId);
    const summary = result.tasks.find((candidate) => candidate.parentId === null);
    expect(predecessor?.startDate).toBe("2026-09-04");
    expect(successor?.startDate).toBe("2026-09-08");
    expect(summary?.startDate).toBe("2026-09-04");
    expect(summary?.endDate).toBe("2026-09-08");
    expect(result.tasks.every((candidate) => candidate.progress === 0)).toBe(true);
    expect(result.tasks.every((candidate) => candidate.assignee === null)).toBe(true);
  });
});
