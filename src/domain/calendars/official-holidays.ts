import type { HolidaysTypes } from "date-holidays";

export const OFFICIAL_HOLIDAY_SOURCE = "date-holidays 3.36.0";

export type OfficialHolidayKind = Extract<
  HolidaysTypes.HolidayType,
  "public" | "bank" | "optional"
>;

export interface OfficialHoliday {
  readonly date: string;
  readonly name: string;
  readonly kind: OfficialHolidayKind;
  readonly rule: string;
}

const IMPORTABLE_TYPES = new Set<OfficialHolidayKind>(["public", "bank", "optional"]);

export const BRAZILIAN_STATES = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"],
  ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"],
  ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"],
  ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"], ["SE", "Sergipe"],
  ["TO", "Tocantins"],
] .map(([code, name]) => ({ code, name })) as readonly { readonly code: string; readonly name: string }[];

export async function officialHolidays(
  years: readonly number[],
  stateCode: string | null,
): Promise<readonly OfficialHoliday[]> {
  const { default: Holidays } = await import("date-holidays");
  const holidays = stateCode === null
    ? new Holidays("BR", { languages: ["pt"] })
    : new Holidays("BR", stateCode, { languages: ["pt"] });

  const byDate = new Map<string, OfficialHoliday>();
  for (const year of [...new Set(years)].sort()) {
    for (const holiday of holidays.getHolidays(year, "pt")) {
      if (!IMPORTABLE_TYPES.has(holiday.type as OfficialHolidayKind)) continue;
      const date = holiday.date.slice(0, 10);
      const kind = holiday.type as OfficialHolidayKind;
      const current = byDate.get(date);
      if (current === undefined) {
        byDate.set(date, { date, name: holiday.name, kind, rule: holiday.rule });
      } else if (!current.name.includes(holiday.name)) {
        byDate.set(date, { ...current, name: `${current.name} / ${holiday.name}` });
      }
    }
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function scheduleYears(
  tasks: readonly { readonly startDate: string | null; readonly endDate: string | null }[],
  fallbackYear = new Date().getFullYear(),
): readonly number[] {
  const years = new Set<number>();
  for (const task of tasks) {
    if (task.startDate !== null) years.add(Number(task.startDate.slice(0, 4)));
    if (task.endDate !== null) years.add(Number(task.endDate.slice(0, 4)));
  }
  return years.size === 0 ? [fallbackYear] : [...years].sort();
}
