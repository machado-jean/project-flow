import { DomainValidationError, requireDateOnly } from "../shared/validation";

const MILLISECONDS_PER_DAY = 86_400_000;

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function parts(date: string): DateParts {
  const validated = requireDateOnly(date, "date", "A data");
  const [year, month, day] = validated.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new DomainValidationError("invalid_date_only", "date", "A data não é válida.");
  }
  return { year, month, day };
}

function epochMilliseconds(date: string): number {
  const { year, month, day } = parts(date);
  return Date.UTC(year, month - 1, day);
}

function formatUtcDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date: string, amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new DomainValidationError(
      "invalid_calendar_days",
      "amount",
      "A quantidade de dias deve ser um número inteiro.",
    );
  }
  return formatUtcDate(new Date(epochMilliseconds(date) + amount * MILLISECONDS_PER_DAY));
}

export function calendarDaysBetween(startDate: string, endDate: string): number {
  const difference = epochMilliseconds(endDate) - epochMilliseconds(startDate);
  return difference / MILLISECONDS_PER_DAY;
}

export function weekday(date: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const utcWeekday = new Date(epochMilliseconds(date)).getUTCDay();
  return (utcWeekday === 0 ? 7 : utcWeekday) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}
