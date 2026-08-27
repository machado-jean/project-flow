import {
  requireIsoTimestamp,
  requireText,
  requireUuid,
} from "../shared/validation";

export const DEFAULT_CALENDAR_ID = "00000000-0000-4000-8000-000000000001";

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Calendar {
  readonly id: string;
  readonly name: string;
  readonly workingDays: readonly Weekday[];
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function validateCalendar(calendar: Calendar): Calendar {
  const uniqueWorkingDays = [...new Set(calendar.workingDays)].sort((left, right) => left - right);

  if (
    uniqueWorkingDays.length === 0 ||
    uniqueWorkingDays.some((weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7)
  ) {
    throw new Error("O calendário deve possuir ao menos um dia útil válido entre 1 e 7.");
  }

  return {
    ...calendar,
    id: requireUuid(calendar.id, "id", "O calendário"),
    name: requireText(calendar.name, "name", "O nome do calendário"),
    workingDays: uniqueWorkingDays,
    createdAt: requireIsoTimestamp(calendar.createdAt, "createdAt"),
    updatedAt: requireIsoTimestamp(calendar.updatedAt, "updatedAt"),
  };
}
