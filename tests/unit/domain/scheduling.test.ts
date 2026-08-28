import { describe, expect, it } from "vitest";

import {
  CONTINUOUS_CALENDAR_ID,
  DEFAULT_CALENDAR_ID,
  type Calendar,
} from "../../../src/domain/calendars/calendar";
import { applyScheduleEdit } from "../../../src/domain/scheduling/schedule-edit";
import type { TaskDependency } from "../../../src/domain/scheduling/dependency";
import { validateGraph } from "../../../src/domain/scheduling/graph";
import { rescheduleAffectedTasks } from "../../../src/domain/scheduling/scheduler";
import type { Task } from "../../../src/domain/tasks/task";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_PROJECT_ID = "10000000-0000-4000-8000-000000000002";
const A = "20000000-0000-4000-8000-000000000001";
const B = "20000000-0000-4000-8000-000000000002";
const C = "20000000-0000-4000-8000-000000000003";
const D = "20000000-0000-4000-8000-000000000004";
const E = "20000000-0000-4000-8000-000000000005";
const F = "20000000-0000-4000-8000-000000000006";
const NOW = "2026-08-27T15:00:00.000Z";

const defaultCalendar: Calendar = {
  id: DEFAULT_CALENDAR_ID,
  name: "Calendário padrão",
  workingDays: [1, 2, 3, 4, 5],
  exceptions: [],
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const continuousCalendar: Calendar = {
  ...defaultCalendar,
  id: CONTINUOUS_CALENDAR_ID,
  name: "Todos os dias",
  workingDays: [1, 2, 3, 4, 5, 6, 7],
  isDefault: false,
};

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    code: null,
    projectId: PROJECT_ID,
    parentId: null,
    calendarId: null,
    title: `Tarefa ${id.slice(-1)}`,
    description: null,
    status: "NOT_STARTED",
    priority: "NORMAL",
    progress: 0,
    startDate: "2026-08-28",
    endDate: "2026-08-28",
    durationDays: 1,
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

function dependency(
  id: string,
  predecessorId: string,
  successorId: string,
  lagDays = 0,
): TaskDependency {
  return {
    id,
    projectId: PROJECT_ID,
    predecessorId,
    successorId,
    type: "FS",
    lagDays,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function schedule(
  tasks: readonly Task[],
  dependencies: readonly TaskDependency[],
  changedTaskIds: readonly string[],
  calendars: readonly Calendar[] = [defaultCalendar, continuousCalendar],
) {
  return rescheduleAffectedTasks({
    tasks,
    dependencies,
    calendars,
    projectCalendarId: DEFAULT_CALENDAR_ID,
    changedTaskIds,
  });
}

describe("edição assistida de datas", () => {
  it("calcula fim a partir de início e duração", () => {
    const unscheduled = task(A, { startDate: null, endDate: null, durationDays: 2 });
    const result = applyScheduleEdit(
      unscheduled,
      { field: "startDate", value: "2026-08-28" },
      defaultCalendar,
    );

    expect(result.endDate).toBe("2026-08-31");
  });

  it("calcula duração a partir de início e fim", () => {
    const result = applyScheduleEdit(
      task(A),
      { field: "endDate", value: "2026-09-01" },
      defaultCalendar,
    );

    expect(result.durationDays).toBe(3);
  });

  it("preserva data não útil explicitamente informada", () => {
    const result = applyScheduleEdit(
      task(A, { startDate: null, endDate: null, durationDays: 1, schedulingMode: "MANUAL" }),
      { field: "startDate", value: "2026-08-29" },
      defaultCalendar,
    );

    expect(result.startDate).toBe("2026-08-29");
    expect(result.endDate).toBe("2026-08-29");
  });
});

describe("scheduler FS", () => {
  it("agenda A → B com lag zero e preserva a duração", () => {
    const result = schedule(
      [task(A), task(B, { durationDays: 2, endDate: "2026-08-31" })],
      [dependency("40000000-0000-4000-8000-000000000001", A, B)],
      [A],
    );
    const successor = result.tasks.find(({ id }) => id === B);

    expect(successor?.startDate).toBe("2026-08-31");
    expect(successor?.endDate).toBe("2026-09-01");
    expect(successor?.durationDays).toBe(2);
  });

  it("propaga A → B → C em cascata", () => {
    const result = schedule(
      [task(A), task(B), task(C)],
      [
        dependency("40000000-0000-4000-8000-000000000001", A, B),
        dependency("40000000-0000-4000-8000-000000000002", B, C),
      ],
      [A],
    );

    expect(result.tasks.find(({ id }) => id === B)?.startDate).toBe("2026-08-31");
    expect(result.tasks.find(({ id }) => id === C)?.startDate).toBe("2026-09-01");
  });

  it("usa a restrição mais tardia em A e B → C", () => {
    const result = schedule(
      [task(A), task(B, { endDate: "2026-08-31" }), task(C)],
      [
        dependency("40000000-0000-4000-8000-000000000001", A, C),
        dependency("40000000-0000-4000-8000-000000000002", B, C),
      ],
      [A, B],
    );

    expect(result.tasks.find(({ id }) => id === C)?.startDate).toBe("2026-09-01");
  });

  it("conta lag positivo em dias úteis", () => {
    const result = schedule(
      [task(A), task(B)],
      [dependency("40000000-0000-4000-8000-000000000001", A, B, 1)],
      [A],
    );

    expect(result.tasks.find(({ id }) => id === B)?.startDate).toBe("2026-09-01");
  });

  it("respeita sexta → segunda no calendário padrão", () => {
    const result = schedule(
      [task(A), task(B)],
      [dependency("40000000-0000-4000-8000-000000000001", A, B)],
      [A],
    );

    expect(result.tasks.find(({ id }) => id === B)?.startDate).toBe("2026-08-31");
  });

  it("respeita feriado", () => {
    const calendarWithHoliday: Calendar = {
      ...defaultCalendar,
      exceptions: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          calendarId: DEFAULT_CALENDAR_ID,
          date: "2026-08-31",
          isWorkingDay: false,
          name: "Feriado",
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    const result = schedule(
      [task(A), task(B)],
      [dependency("40000000-0000-4000-8000-000000000001", A, B)],
      [A],
      [calendarWithHoliday, continuousCalendar],
    );

    expect(result.tasks.find(({ id }) => id === B)?.startDate).toBe("2026-09-01");
  });

  it("usa calendário contínuo da sucessora para final de semana", () => {
    const result = schedule(
      [task(A), task(B, { calendarId: CONTINUOUS_CALENDAR_ID })],
      [dependency("40000000-0000-4000-8000-000000000001", A, B, 1)],
      [A],
    );

    expect(result.tasks.find(({ id }) => id === B)?.startDate).toBe("2026-08-30");
  });

  it("não antecipa uma tarefa quando a alteração não exige deslocamento", () => {
    const laterTask = task(B, { startDate: "2026-09-02", endDate: "2026-09-02" });
    const result = schedule(
      [task(A), laterTask],
      [dependency("40000000-0000-4000-8000-000000000001", A, B)],
      [A],
    );

    expect(result.tasks.find(({ id }) => id === B)).toEqual(laterTask);
    expect(result.changedTaskIds.has(B)).toBe(false);
  });

  it("mantém tarefa MANUAL e informa conflito apenas quando viola predecessora", () => {
    const manual = task(B, { schedulingMode: "MANUAL" });
    const result = schedule(
      [task(A), manual, task(C, { schedulingMode: "MANUAL" })],
      [dependency("40000000-0000-4000-8000-000000000001", A, B)],
      [A],
    );

    expect(result.tasks.find(({ id }) => id === B)).toEqual(manual);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.taskId).toBe(B);
    expect(result.conflicts.some(({ taskId }) => taskId === C)).toBe(false);
  });

  it("rejeita ciclo e auto-dependência", () => {
    const tasks = [task(A), task(B)];
    expect(() =>
      validateGraph(tasks, [
        dependency("40000000-0000-4000-8000-000000000001", A, B),
        dependency("40000000-0000-4000-8000-000000000002", B, A),
      ]),
    ).toThrow("ciclo");
    expect(() =>
      validateGraph(tasks, [dependency("40000000-0000-4000-8000-000000000001", A, A)]),
    ).toThrow("predecessora dela mesma");
  });

  it("rejeita dependência entre projetos e em tarefa-resumo", () => {
    const summary = task(A);
    const child = task(B, { parentId: A });
    expect(() =>
      validateGraph([summary, child, task(C)], [
        dependency("40000000-0000-4000-8000-000000000001", A, C),
      ]),
    ).toThrow("Tarefas-resumo");

    expect(() =>
      validateGraph([task(A), task(B, { projectId: OTHER_PROJECT_ID })], [
        dependency("40000000-0000-4000-8000-000000000001", A, B),
      ]),
    ).toThrow("mesmo projeto");
  });

  it("recalcula tarefa-resumo a partir dos descendentes", () => {
    const parent = task(A, { startDate: null, endDate: null, durationDays: null });
    const firstChild = task(B, { parentId: A });
    const secondChild = task(C, {
      parentId: A,
      startDate: "2026-08-31",
      endDate: "2026-09-02",
      durationDays: 3,
    });
    const result = schedule([parent, firstChild, secondChild], [], [B, C]);
    const summary = result.tasks.find(({ id }) => id === A);

    expect(summary?.startDate).toBe("2026-08-28");
    expect(summary?.endDate).toBe("2026-09-02");
    expect(summary?.durationDays).toBe(4);
  });

  it("mantém um grafo duplicado independente do original", () => {
    const result = schedule(
      [task(A), task(B), task(C), task(D)],
      [
        dependency("40000000-0000-4000-8000-000000000001", A, B),
        dependency("40000000-0000-4000-8000-000000000002", C, D),
      ],
      [A],
    );

    expect(result.tasks.find(({ id }) => id === B)?.startDate).toBe("2026-08-31");
    expect(result.tasks.find(({ id }) => id === D)?.startDate).toBe("2026-08-28");
  });

  it("calcula múltiplas alterações como um único resultado atômico", () => {
    const result = schedule(
      [task(A), task(B), task(C), task(D), task(E), task(F)],
      [
        dependency("40000000-0000-4000-8000-000000000001", A, B),
        dependency("40000000-0000-4000-8000-000000000002", B, C),
        dependency("40000000-0000-4000-8000-000000000003", D, E),
        dependency("40000000-0000-4000-8000-000000000004", E, F),
      ],
      [A, D],
    );

    expect([...result.changedTaskIds].sort()).toEqual([B, C, E, F]);
  });
});
