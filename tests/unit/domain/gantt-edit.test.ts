import { describe, expect, it } from "vitest";

import { DEFAULT_CALENDAR_ID, type Calendar } from "../../../src/domain/calendars/calendar";
import { applyGanttDateEdit, planGanttFsMove } from "../../../src/domain/scheduling/gantt-edit";
import type { TaskDependency } from "../../../src/domain/scheduling/dependency";
import type { Task } from "../../../src/domain/tasks/task";

const calendar: Calendar = {
  id: DEFAULT_CALENDAR_ID,
  name: "Calendário padrão",
  workingDays: [1, 2, 3, 4, 5],
  exceptions: [{
    id: "30000000-0000-4000-8000-000000000001",
    calendarId: DEFAULT_CALENDAR_ID,
    date: "2026-09-07",
    name: "Feriado",
    isWorkingDay: false,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
  }],
  isDefault: true,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

function task(): Task {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    projectId: "10000000-0000-4000-8000-000000000001",
    parentId: null,
    code: null,
    title: "Executar tarefa",
    description: null,
    status: "NOT_STARTED",
    priority: "NORMAL",
    progress: 0,
    startDate: "2026-09-01",
    endDate: "2026-09-03",
    durationDays: 3,
    schedulingMode: "AUTO",
    calendarId: null,
    position: 0,
    assignee: null,
    tags: [],
    notes: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
  };
}

function dependency(id: string, predecessorId: string, lagDays: number): TaskDependency {
  return {
    id, projectId: task().projectId, predecessorId, successorId: task().id,
    type: "FS", lagDays,
    createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z",
  };
}

function predecessor(id: string, endDate: string): Task {
  return { ...task(), id, title: id, startDate: endDate, endDate, durationDays: 1 };
}

describe("edição de datas pelo Gantt", () => {
  it("move tarefa livre preservando duração e respeitando calendário", () => {
    const edited = applyGanttDateEdit(task(), {
      mode: "MOVE",
      differenceInCalendarDays: 3,
    }, calendar, { hasPredecessors: false, isSummary: false });

    expect(edited.startDate).toBe("2026-09-04");
    expect(edited.endDate).toBe("2026-09-09");
    expect(edited.durationDays).toBe(3);
  });

  it("normaliza movimento solto no fim de semana para o próximo dia útil", () => {
    const edited = applyGanttDateEdit(task(), {
      mode: "MOVE",
      differenceInCalendarDays: 4,
    }, calendar, { hasPredecessors: false, isSummary: false });

    expect(edited.startDate).toBe("2026-09-08");
    expect(edited.endDate).toBe("2026-09-10");
  });

  it("redimensiona a borda esquerda de tarefa livre preservando o fim", () => {
    const edited = applyGanttDateEdit(task(), {
      mode: "START",
      differenceInCalendarDays: 1,
    }, calendar, { hasPredecessors: false, isSummary: false });

    expect(edited.startDate).toBe("2026-09-02");
    expect(edited.endDate).toBe("2026-09-03");
    expect(edited.durationDays).toBe(2);
  });

  it("permite ajustar somente o fim quando há predecessoras", () => {
    const edited = applyGanttDateEdit(task(), {
      mode: "END",
      differenceInCalendarDays: 1,
    }, calendar, { hasPredecessors: true, isSummary: false });

    expect(edited.startDate).toBe("2026-09-01");
    expect(edited.endDate).toBe("2026-09-04");
    expect(edited.durationDays).toBe(4);
  });

  it("bloqueia início e movimento quando há predecessoras", () => {
    expect(() => applyGanttDateEdit(task(), {
      mode: "START",
      differenceInCalendarDays: 1,
    }, calendar, { hasPredecessors: true, isSummary: false })).toThrow(/calculada pelas predecessoras/);
    expect(() => applyGanttDateEdit(task(), {
      mode: "MOVE",
      differenceInCalendarDays: 1,
    }, calendar, { hasPredecessors: true, isSummary: false })).toThrow(/calculada pelas predecessoras/);
  });

  it("bloqueia qualquer edição direta de tarefa-resumo", () => {
    expect(() => applyGanttDateEdit(task(), {
      mode: "END",
      differenceInCalendarDays: 1,
    }, calendar, { hasPredecessors: false, isSummary: true })).toThrow(/tarefa-resumo/);
  });
});

describe("movimento FS pelo Gantt", () => {
  it("aumenta o lag da predecessora controladora ao mover para depois", () => {
    const pred = predecessor("20000000-0000-4000-8000-000000000002", "2026-08-31");
    const current = { ...task(), startDate: "2026-09-01", endDate: "2026-09-03" };
    const dep = dependency("40000000-0000-4000-8000-000000000001", pred.id, 0);
    const result = planGanttFsMove(current, 2, calendar, [dep], [pred, current]);
    expect(result.appliedStartDate).toBe("2026-09-03");
    expect(result.dependencyUpdates).toEqual([{ ...dep, lagDays: 2 }]);
    expect(result.task.endDate).toBe("2026-09-08");
  });

  it("reduz o lag até zero ao antecipar e não cria lag negativo", () => {
    const pred = predecessor("20000000-0000-4000-8000-000000000002", "2026-08-31");
    const current = { ...task(), startDate: "2026-09-04", endDate: "2026-09-09" };
    const dep = dependency("40000000-0000-4000-8000-000000000001", pred.id, 3);
    const result = planGanttFsMove(current, -10, calendar, [dep], [pred, current]);
    expect(result.requestedStartDate).toBe("2026-08-25");
    expect(result.appliedStartDate).toBe("2026-09-01");
    expect(result.dependencyUpdates[0]?.lagDays).toBe(0);
    expect(result.limitingPredecessorIds).toEqual([pred.id]);
  });

  it("preserva a data solicitada antes da normalização do calendário", () => {
    const pred = predecessor("20000000-0000-4000-8000-000000000002", "2026-08-28");
    const current = { ...task(), startDate: "2026-08-31", endDate: "2026-09-02" };
    const dep = dependency("40000000-0000-4000-8000-000000000001", pred.id, 0);
    const result = planGanttFsMove(current, -2, calendar, [dep], [pred, current]);

    expect(result.requestedStartDate).toBe("2026-08-29");
    expect(result.appliedStartDate).toBe("2026-08-31");
    expect(result.calendarAdjusted).toBe(true);
    expect(result.task).toEqual(current);
    expect(result.dependencyUpdates).toEqual([]);
  });

  it("reduz todas as restrições necessárias com múltiplas predecessoras", () => {
    const first = predecessor("20000000-0000-4000-8000-000000000002", "2026-08-28");
    const second = predecessor("20000000-0000-4000-8000-000000000003", "2026-08-31");
    const current = { ...task(), startDate: "2026-09-04", endDate: "2026-09-09" };
    const firstDep = dependency("40000000-0000-4000-8000-000000000001", first.id, 4);
    const secondDep = dependency("40000000-0000-4000-8000-000000000002", second.id, 3);
    const result = planGanttFsMove(current, -2, calendar, [firstDep, secondDep], [first, second, current]);
    expect(result.appliedStartDate).toBe("2026-09-02");
    expect(result.dependencyUpdates.map(({ lagDays }) => lagDays)).toEqual([2, 1]);
  });

  it("move tarefa manual sem alterar lag", () => {
    const pred = predecessor("20000000-0000-4000-8000-000000000002", "2026-09-03");
    const current = { ...task(), schedulingMode: "MANUAL" as const };
    const dep = dependency("40000000-0000-4000-8000-000000000001", pred.id, 0);
    const result = planGanttFsMove(current, 1, calendar, [dep], [pred, current]);
    expect(result.task.startDate).toBe("2026-09-02");
    expect(result.dependencyUpdates).toEqual([]);
  });
});
