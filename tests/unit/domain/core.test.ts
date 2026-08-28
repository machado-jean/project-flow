import { describe, expect, it } from "vitest";

import { DEFAULT_CALENDAR_ID } from "../../../src/domain/calendars/calendar";
import { validateProject, type Project } from "../../../src/domain/projects/project";
import { assertValidParentAssignment, flattenVisibleTasks } from "../../../src/domain/tasks/hierarchy";
import { validateTask, type Task } from "../../../src/domain/tasks/task";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_PROJECT_ID = "10000000-0000-4000-8000-000000000002";
const TASK_A_ID = "20000000-0000-4000-8000-000000000001";
const TASK_B_ID = "20000000-0000-4000-8000-000000000002";
const TASK_C_ID = "20000000-0000-4000-8000-000000000003";
const NOW = "2026-08-27T15:00:00.000Z";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    name: "Projeto",
    description: null,
    status: "ACTIVE",
    calendarId: DEFAULT_CALENDAR_ID,
    position: 0,
    isArchived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_A_ID,
    code: null,
    projectId: PROJECT_ID,
    parentId: null,
    calendarId: null,
    title: "Tarefa",
    description: null,
    status: "NOT_STARTED",
    priority: "NORMAL",
    progress: 0,
    startDate: null,
    endDate: null,
    durationDays: null,
    schedulingMode: "AUTO",
    position: 0,
    assignee: null,
    tags: [],
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("núcleo de projetos", () => {
  it("normaliza nome e descrição", () => {
    const result = validateProject(project({ name: "  Projeto Alfa  ", description: "  " }));

    expect(result.name).toBe("Projeto Alfa");
    expect(result.description).toBeNull();
  });

  it("rejeita projeto sem nome", () => {
    expect(() => validateProject(project({ name: "  " }))).toThrow("nome do projeto é obrigatório");
  });
});

describe("núcleo de tarefas", () => {
  it("aceita tarefa ainda não agendada", () => {
    const result = validateTask(task({ tags: [" Operação ", "operação", "Crítica"] }));

    expect(result.startDate).toBeNull();
    expect(result.tags).toEqual(["Crítica", "operação"]);
  });

  it("aceita cronograma completo", () => {
    const result = validateTask(
      task({ startDate: "2026-08-27", endDate: "2026-08-28", durationDays: 2 }),
    );

    expect(result.durationDays).toBe(2);
  });

  it("rejeita cronograma parcial", () => {
    expect(() => validateTask(task({ startDate: "2026-08-27" }))).toThrow(
      "Início, fim e duração devem ser informados juntos",
    );
  });

  it("rejeita data inexistente e intervalo invertido", () => {
    expect(() =>
      validateTask(task({ startDate: "2026-02-30", endDate: "2026-03-01", durationDays: 1 })),
    ).toThrow("não é uma data válida");
    expect(() =>
      validateTask(task({ startDate: "2026-08-28", endDate: "2026-08-27", durationDays: 1 })),
    ).toThrow("não pode ser anterior");
  });

  it("rejeita progresso fora da faixa", () => {
    expect(() => validateTask(task({ progress: 101 }))).toThrow("entre 0 e 100");
  });
});

describe("hierarquia de tarefas", () => {
  const tasks = [
    task(),
    task({ id: TASK_B_ID, parentId: TASK_A_ID, position: 0, title: "Filha" }),
    task({ id: TASK_C_ID, parentId: TASK_B_ID, position: 0, title: "Neta" }),
  ];

  it("rejeita auto-parentesco e ciclos indiretos", () => {
    expect(() => {
      assertValidParentAssignment(tasks, TASK_A_ID, PROJECT_ID, TASK_A_ID);
    }).toThrow("filha dela mesma");
    expect(() => {
      assertValidParentAssignment(tasks, TASK_A_ID, PROJECT_ID, TASK_C_ID);
    }).toThrow("criaria um ciclo");
  });

  it("rejeita parent de outro projeto", () => {
    const crossProject = [
      ...tasks,
      task({ id: "20000000-0000-4000-8000-000000000004", projectId: OTHER_PROJECT_ID }),
    ];

    expect(() => {
      assertValidParentAssignment(
        crossProject,
        TASK_A_ID,
        PROJECT_ID,
        "20000000-0000-4000-8000-000000000004",
      );
    }).toThrow("mesmo projeto");
  });

  it("produz linhas visíveis com profundidade", () => {
    const visible = flattenVisibleTasks(tasks, new Set([TASK_A_ID, TASK_B_ID]));

    expect(visible.map(({ task: visibleTask, depth }) => [visibleTask.title, depth])).toEqual([
      ["Tarefa", 0],
      ["Filha", 1],
      ["Neta", 2],
    ]);
  });
});
