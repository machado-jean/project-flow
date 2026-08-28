import type { Calendar } from "../calendars/calendar";
import {
  endDateForDuration,
  isWorkingDay,
  nextWorkingDay,
  workingDaysBetween,
} from "../calendars/working-calendar";
import { requireDateOnly } from "../shared/validation";
import type { Task } from "../tasks/task";

export type ScheduleEdit =
  | { readonly field: "startDate"; readonly value: string | null }
  | { readonly field: "endDate"; readonly value: string | null }
  | { readonly field: "durationDays"; readonly value: number | null };

function durationForExplicitRange(calendar: Calendar, startDate: string, endDate: string): number {
  let duration = workingDaysBetween(calendar, startDate, endDate);
  if (!isWorkingDay(calendar, startDate)) duration += 1;
  if (endDate !== startDate && !isWorkingDay(calendar, endDate)) duration += 1;
  return Math.max(1, duration);
}

function endForExplicitStart(calendar: Calendar, startDate: string, durationDays: number): string {
  if (durationDays === 1) return startDate;
  if (isWorkingDay(calendar, startDate)) {
    return endDateForDuration(calendar, startDate, durationDays);
  }

  let endDate = startDate;
  for (let remaining = durationDays - 1; remaining > 0; remaining -= 1) {
    endDate = nextWorkingDay(calendar, endDate);
  }
  return endDate;
}

export function applyScheduleEdit(task: Task, edit: ScheduleEdit, calendar: Calendar): Task {
  if (edit.field === "startDate") {
    if (edit.value === null) {
      return { ...task, startDate: null, endDate: null, durationDays: null };
    }
    const startDate = requireDateOnly(edit.value, "startDate", "A data de início");
    if (task.durationDays !== null) {
      return {
        ...task,
        startDate,
        endDate: endForExplicitStart(calendar, startDate, task.durationDays),
      };
    }
    if (task.endDate !== null) {
      return {
        ...task,
        startDate,
        durationDays: durationForExplicitRange(calendar, startDate, task.endDate),
      };
    }
    return { ...task, startDate };
  }

  if (edit.field === "endDate") {
    if (edit.value === null) {
      return { ...task, endDate: null, durationDays: null };
    }
    const endDate = requireDateOnly(edit.value, "endDate", "A data de fim");
    return task.startDate === null
      ? { ...task, endDate }
      : {
          ...task,
          endDate,
          durationDays: durationForExplicitRange(calendar, task.startDate, endDate),
        };
  }

  if (edit.value === null) {
    return { ...task, durationDays: null, endDate: null };
  }
  return task.startDate === null
    ? { ...task, durationDays: edit.value }
    : {
        ...task,
        durationDays: edit.value,
        endDate: endForExplicitStart(calendar, task.startDate, edit.value),
      };
}
