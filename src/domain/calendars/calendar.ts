import {
  optionalText,
  requireDateOnly,
  requireIsoTimestamp,
  requireText,
  requireUuid,
} from "../shared/validation";

export const DEFAULT_CALENDAR_ID = "00000000-0000-4000-8000-000000000001";
export const CONTINUOUS_CALENDAR_ID = "00000000-0000-4000-8000-000000000002";

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CalendarException {
  readonly id: string;
  readonly calendarId: string;
  readonly date: string;
  readonly isWorkingDay: boolean;
  readonly name: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Calendar {
  readonly id: string;
  readonly name: string;
  readonly workingDays: readonly Weekday[];
  readonly exceptions: readonly CalendarException[];
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function validateCalendarException(exception: CalendarException): CalendarException {
  return {
    ...exception,
    id: requireUuid(exception.id, "id", "A exceção do calendário"),
    calendarId: requireUuid(exception.calendarId, "calendarId", "O calendário"),
    date: requireDateOnly(exception.date, "date", "A data da exceção"),
    name: optionalText(exception.name),
    createdAt: requireIsoTimestamp(exception.createdAt, "createdAt"),
    updatedAt: requireIsoTimestamp(exception.updatedAt, "updatedAt"),
  };
}

export function validateCalendar(calendar: Calendar): Calendar {
  const uniqueWorkingDays = [...new Set(calendar.workingDays)].sort((left, right) => left - right);

  if (
    uniqueWorkingDays.length === 0 ||
    uniqueWorkingDays.some((weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7)
  ) {
    throw new Error("O calendário deve possuir ao menos um dia útil válido entre 1 e 7.");
  }

  const exceptions = calendar.exceptions.map(validateCalendarException);
  if (exceptions.some((exception) => exception.calendarId !== calendar.id)) {
    throw new Error("Toda exceção deve pertencer ao calendário que está sendo salvo.");
  }
  if (new Set(exceptions.map(({ date }) => date)).size !== exceptions.length) {
    throw new Error("O calendário não pode possuir mais de uma exceção na mesma data.");
  }

  return {
    ...calendar,
    id: requireUuid(calendar.id, "id", "O calendário"),
    name: requireText(calendar.name, "name", "O nome do calendário"),
    workingDays: uniqueWorkingDays,
    exceptions,
    createdAt: requireIsoTimestamp(calendar.createdAt, "createdAt"),
    updatedAt: requireIsoTimestamp(calendar.updatedAt, "updatedAt"),
  };
}
