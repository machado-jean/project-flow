import type { Calendar } from "../calendars/calendar";
import { addWorkingDays, endDateForDuration } from "../calendars/working-calendar";
import { DomainValidationError } from "../shared/validation";
import type { Task } from "../tasks/task";
import type { TaskDependency } from "./dependency";
import { affectedTaskIds, topologicalSort, validateGraph } from "./graph";
import { recalculateSummaryTasks } from "./summary";

export type SchedulingConflictKind = "MANUAL_CONSTRAINT" | "UNSCHEDULED_AUTO";

export interface SchedulingConflict {
  readonly kind: SchedulingConflictKind;
  readonly taskId: string;
  readonly requiredStartDate: string;
  readonly actualStartDate: string | null;
  readonly message: string;
}

export interface ScheduleResult {
  readonly tasks: readonly Task[];
  readonly changedTaskIds: ReadonlySet<string>;
  readonly conflicts: readonly SchedulingConflict[];
}

interface ScheduleInput {
  readonly tasks: readonly Task[];
  readonly dependencies: readonly TaskDependency[];
  readonly calendars: readonly Calendar[];
  readonly projectCalendarId: string;
  readonly changedTaskIds: readonly string[];
}

function calendarResolver(
  calendars: readonly Calendar[],
  projectCalendarId: string,
): (task: Task) => Calendar {
  const calendarsById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  return (task: Task): Calendar => {
    const calendarId = task.calendarId ?? projectCalendarId;
    const calendar = calendarsById.get(calendarId);
    if (calendar === undefined) {
      throw new DomainValidationError(
        "calendar_not_found",
        "calendarId",
        "O calendário usado pela tarefa não existe.",
      );
    }
    return calendar;
  };
}

export function calculateEarliestStart(
  task: Task,
  tasksById: ReadonlyMap<string, Task>,
  dependencies: readonly TaskDependency[],
  calendar: Calendar,
): string | null {
  const constraints = dependencies
    .filter((dependency) => dependency.successorId === task.id)
    .flatMap((dependency) => {
      const predecessorEnd = tasksById.get(dependency.predecessorId)?.endDate;
      return predecessorEnd === null || predecessorEnd === undefined
        ? []
        : [addWorkingDays(calendar, predecessorEnd, dependency.lagDays + 1)];
    });
  return constraints.sort((left, right) => right.localeCompare(left))[0] ?? null;
}

export function rescheduleAffectedTasks(input: ScheduleInput): ScheduleResult {
  const dependencies = validateGraph(input.tasks, input.dependencies);
  const orderedTaskIds = topologicalSort(
    input.tasks.map(({ id }) => id),
    dependencies,
  );
  const affected = affectedTaskIds(input.changedTaskIds, dependencies);
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const calendarForTask = calendarResolver(input.calendars, input.projectCalendarId);
  const conflicts: SchedulingConflict[] = [];

  for (const taskId of orderedTaskIds) {
    if (!affected.has(taskId)) continue;
    const task = tasksById.get(taskId);
    if (task === undefined) continue;
    const earliestStart = calculateEarliestStart(
      task,
      tasksById,
      dependencies,
      calendarForTask(task),
    );
    if (earliestStart === null) continue;

    if (task.schedulingMode === "MANUAL") {
      if (task.startDate === null || task.startDate < earliestStart) {
        conflicts.push({
          kind: "MANUAL_CONSTRAINT",
          taskId,
          requiredStartDate: earliestStart,
          actualStartDate: task.startDate,
          message: `A tarefa manual deveria começar em ${earliestStart} ou depois por causa de sua predecessora.`,
        });
      }
      continue;
    }

    if (task.durationDays === null) {
      conflicts.push({
        kind: "UNSCHEDULED_AUTO",
        taskId,
        requiredStartDate: earliestStart,
        actualStartDate: task.startDate,
        message: "A tarefa automática possui predecessora, mas ainda não tem duração definida.",
      });
      continue;
    }
    if (task.startDate === null || task.startDate < earliestStart) {
      tasksById.set(taskId, {
        ...task,
        startDate: earliestStart,
        endDate: endDateForDuration(calendarForTask(task), earliestStart, task.durationDays),
      });
    }
  }

  const scheduledTasks = input.tasks.map((task) => tasksById.get(task.id) ?? task);
  const withSummaries = recalculateSummaryTasks(scheduledTasks, calendarForTask);
  const changedTaskIds = new Set<string>();
  for (const task of withSummaries) {
    const original = input.tasks.find((candidate) => candidate.id === task.id);
    if (
      original !== undefined &&
      (original.startDate !== task.startDate ||
        original.endDate !== task.endDate ||
        original.durationDays !== task.durationDays)
    ) {
      changedTaskIds.add(task.id);
    }
  }

  return { tasks: withSummaries, changedTaskIds, conflicts };
}
