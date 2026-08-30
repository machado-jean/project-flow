import { describe, expect, it } from "vitest";

import type { Calendar } from "../../src/domain/calendars/calendar";
import type { TaskDependency } from "../../src/domain/scheduling/dependency";
import { rescheduleAffectedTasks } from "../../src/domain/scheduling/scheduler";
import { flattenVisibleTasks } from "../../src/domain/tasks/hierarchy";
import type { Task } from "../../src/domain/tasks/task";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const CALENDAR_ID = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-08-30T12:00:00.000Z";

const continuousCalendar: Calendar = {
  id: CALENDAR_ID,
  name: "Todos os dias",
  workingDays: [1, 2, 3, 4, 5, 6, 7],
  exceptions: [],
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};

function taskId(index: number): string {
  return `20000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function dependencyId(index: number): string {
  return `30000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function createTasks(count: number): Task[] {
  return Array.from({ length: count }, (_, index) => ({
    id: taskId(index + 1),
    code: null,
    projectId: PROJECT_ID,
    parentId: null,
    calendarId: CALENDAR_ID,
    title: `Tarefa ${String(index + 1)}`,
    description: null,
    status: "NOT_STARTED",
    priority: "NORMAL",
    progress: 0,
    startDate: "2026-08-30",
    endDate: "2026-08-30",
    durationDays: 1,
    schedulingMode: "AUTO",
    position: index,
    assignee: null,
    tags: [],
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  }));
}

describe("limites de desempenho do workspace", () => {
  it("reagenda uma cadeia de 1.000 tarefas dentro do orçamento de segurança", () => {
    const tasks = createTasks(1_000);
    const dependencies: TaskDependency[] = tasks.slice(1).map((task, index) => ({
      id: dependencyId(index + 1),
      projectId: PROJECT_ID,
      predecessorId: taskId(index + 1),
      successorId: task.id,
      type: "FS",
      lagDays: 0,
      createdAt: NOW,
      updatedAt: NOW,
    }));

    const startedAt = performance.now();
    const result = rescheduleAffectedTasks({
      tasks,
      dependencies,
      calendars: [continuousCalendar],
      projectCalendarId: CALENDAR_ID,
      changedTaskIds: [taskId(1)],
    });
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(result.tasks).toHaveLength(1_000);
    expect(result.changedTaskIds.size).toBe(999);
    expect(elapsedMilliseconds).toBeLessThan(2_000);
  });

  it("monta a projeção hierárquica de 10.000 tarefas dentro do orçamento de segurança", () => {
    const tasks = createTasks(10_000);

    const startedAt = performance.now();
    const visible = flattenVisibleTasks(tasks, new Set());
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(visible).toHaveLength(10_000);
    expect(elapsedMilliseconds).toBeLessThan(1_000);
  });
});
