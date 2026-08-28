import type { Calendar } from "./calendar";
import { addCalendarDays } from "./date-only";
import { DomainValidationError, requireDateOnly } from "../shared/validation";
import { weekday } from "./date-only";

function exceptionForDate(calendar: Calendar, date: string) {
  return calendar.exceptions.find((exception) => exception.date === date);
}

export function isWorkingDay(calendar: Calendar, date: string): boolean {
  const validatedDate = requireDateOnly(date, "date", "A data");
  const exception = exceptionForDate(calendar, validatedDate);
  return exception?.isWorkingDay ?? calendar.workingDays.includes(weekday(validatedDate));
}

export function onOrNextWorkingDay(calendar: Calendar, date: string): string {
  let candidate = requireDateOnly(date, "date", "A data");
  while (!isWorkingDay(calendar, candidate)) {
    candidate = addCalendarDays(candidate, 1);
  }
  return candidate;
}

export function nextWorkingDay(calendar: Calendar, date: string): string {
  return onOrNextWorkingDay(calendar, addCalendarDays(date, 1));
}

export function addWorkingDays(calendar: Calendar, startDate: string, amount: number): string {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new DomainValidationError(
      "invalid_working_days",
      "amount",
      "A quantidade de dias úteis deve ser um número inteiro maior ou igual a zero.",
    );
  }

  let candidate = onOrNextWorkingDay(calendar, startDate);
  for (let remaining = amount; remaining > 0; remaining -= 1) {
    candidate = nextWorkingDay(calendar, candidate);
  }
  return candidate;
}

export function workingDaysBetween(
  calendar: Calendar,
  startDate: string,
  endDate: string,
): number {
  const start = requireDateOnly(startDate, "startDate", "A data de início");
  const end = requireDateOnly(endDate, "endDate", "A data de fim");
  if (end < start) {
    throw new DomainValidationError(
      "invalid_date_range",
      "endDate",
      "A data de fim não pode ser anterior à data de início.",
    );
  }

  let count = 0;
  let candidate = start;
  while (candidate <= end) {
    if (isWorkingDay(calendar, candidate)) count += 1;
    candidate = addCalendarDays(candidate, 1);
  }
  return count;
}

export function endDateForDuration(
  calendar: Calendar,
  startDate: string,
  durationDays: number,
): string {
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new DomainValidationError(
      "invalid_duration",
      "durationDays",
      "A duração deve ser um número inteiro maior ou igual a um.",
    );
  }
  return addWorkingDays(calendar, startDate, durationDays - 1);
}
