import { describe, expect, it } from "vitest";

import { officialHolidays, scheduleYears } from "../../../src/domain/calendars/official-holidays";

describe("feriados oficiais brasileiros", () => {
  it("carrega feriados nacionais móveis e fixos em português", async () => {
    const holidays = await officialHolidays([2026], null);
    expect(holidays).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2026-04-03", name: "Sexta-Feira Santa", kind: "public" }),
      expect.objectContaining({ date: "2026-09-07", name: "Dia da Independência", kind: "public" }),
    ]));
    expect(holidays.every((holiday) => ["public", "bank", "optional"].includes(holiday.kind))).toBe(true);
  });

  it("inclui o feriado estadual da UF escolhida", async () => {
    const holidays = await officialHolidays([2026], "SP");
    expect(holidays).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2026-07-09", name: "Revolução Constitucionalista" }),
    ]));
  });

  it("limita a prévia aos anos usados e aplica fallback ao projeto sem datas", () => {
    expect(scheduleYears([
      { startDate: "2026-12-20", endDate: "2027-01-10" },
      { startDate: "2026-02-01", endDate: "2026-02-02" },
    ], 2030)).toEqual([2026, 2027]);
    expect(scheduleYears([], 2030)).toEqual([2030]);
  });
});
