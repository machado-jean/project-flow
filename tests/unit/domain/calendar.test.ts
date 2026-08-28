import { describe, expect, it } from "vitest";

import {
  CONTINUOUS_CALENDAR_ID,
  DEFAULT_CALENDAR_ID,
  validateCalendar,
  type Calendar,
} from "../../../src/domain/calendars/calendar";
import {
  addWorkingDays,
  endDateForDuration,
  isWorkingDay,
  nextWorkingDay,
  workingDaysBetween,
} from "../../../src/domain/calendars/working-calendar";

const NOW = "2026-08-27T15:00:00.000Z";

function calendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Calendário padrão",
    workingDays: [1, 2, 3, 4, 5],
    exceptions: [],
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("calendário de trabalho", () => {
  it("identifica dias úteis e finais de semana sem usar timezone local", () => {
    expect(isWorkingDay(calendar(), "2026-08-28")).toBe(true);
    expect(isWorkingDay(calendar(), "2026-08-29")).toBe(false);
    expect(isWorkingDay(calendar(), "2026-08-30")).toBe(false);
  });

  it("aplica feriado e exceção positiva sobre a semana base", () => {
    const withExceptions = calendar({
      exceptions: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          calendarId: "00000000-0000-4000-8000-000000000001",
          date: "2026-08-28",
          isWorkingDay: false,
          name: "Feriado",
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: "30000000-0000-4000-8000-000000000002",
          calendarId: "00000000-0000-4000-8000-000000000001",
          date: "2026-08-29",
          isWorkingDay: true,
          name: "Sábado especial",
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    expect(isWorkingDay(withExceptions, "2026-08-28")).toBe(false);
    expect(isWorkingDay(withExceptions, "2026-08-29")).toBe(true);
  });

  it("encontra o próximo dia útil e atravessa fim de semana e feriado", () => {
    const withHoliday = calendar({
      exceptions: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          calendarId: "00000000-0000-4000-8000-000000000001",
          date: "2026-08-31",
          isWorkingDay: false,
          name: "Feriado",
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    expect(nextWorkingDay(calendar(), "2026-08-28")).toBe("2026-08-31");
    expect(nextWorkingDay(withHoliday, "2026-08-28")).toBe("2026-09-01");
  });

  it("preserva a regra de duração inclusiva", () => {
    expect(endDateForDuration(calendar(), "2026-08-28", 1)).toBe("2026-08-28");
    expect(endDateForDuration(calendar(), "2026-08-28", 2)).toBe("2026-08-31");
    expect(addWorkingDays(calendar(), "2026-08-28", 2)).toBe("2026-09-01");
    expect(workingDaysBetween(calendar(), "2026-08-28", "2026-08-31")).toBe(2);
  });

  it("aceita calendário contínuo para atividades de fim de semana", () => {
    const continuous = calendar({ workingDays: [1, 2, 3, 4, 5, 6, 7] });

    expect(nextWorkingDay(continuous, "2026-08-28")).toBe("2026-08-29");
    expect(addWorkingDays(continuous, "2026-08-28", 2)).toBe("2026-08-30");
  });

  it("rejeita exceção vinculada a outro calendário ou repetida na mesma data", () => {
    const exception = {
      id: "30000000-0000-4000-8000-000000000001",
      calendarId: DEFAULT_CALENDAR_ID,
      date: "2026-09-07",
      isWorkingDay: false,
      name: "Feriado",
      createdAt: NOW,
      updatedAt: NOW,
    };

    expect(() => validateCalendar({
      ...calendar(),
      exceptions: [{ ...exception, calendarId: CONTINUOUS_CALENDAR_ID }],
    })).toThrow("deve pertencer ao calendário");
    expect(() => validateCalendar({
      ...calendar(),
      exceptions: [exception, { ...exception, id: "30000000-0000-4000-8000-000000000002" }],
    })).toThrow("mais de uma exceção");
  });
});
