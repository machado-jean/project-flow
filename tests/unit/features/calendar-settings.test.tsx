import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Calendar } from "../../../src/domain/calendars/calendar";
import { CalendarSettings } from "../../../src/features/projects/CalendarSettings";

const NOW = "2026-08-29T12:00:00.000Z";

describe("importação de feriados no calendário", () => {
  it("gera a prévia dos anos usados e não sobrescreve uma exceção existente", async () => {
    const calendar: Calendar = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Calendário padrão",
      workingDays: [1, 2, 3, 4, 5],
      exceptions: [{
        id: "30000000-0000-4000-8000-000000000001",
        calendarId: "00000000-0000-4000-8000-000000000001",
        date: "2026-09-07",
        isWorkingDay: false,
        name: "Regra local preservada",
        createdAt: NOW,
        updatedAt: NOW,
      }],
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const onSave = vi.fn().mockResolvedValue(true);
    render(<CalendarSettings calendar={calendar} disabled={false} usedYears={[2026]} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Gerar prévia" }));
    await screen.findByText(/Dia da Independência/);
    const independence = screen.getByText(/Dia da Independência/).closest("label")?.querySelector("input");
    expect(independence).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Adicionar selecionados ao calendário" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar calendário" }));
    await waitFor(() => { expect(onSave).toHaveBeenCalledOnce(); });
    const saved = onSave.mock.calls[0]?.[0] as Calendar;
    expect(saved.exceptions.filter((exception) => exception.date === "2026-09-07")).toEqual([
      expect.objectContaining({ name: "Regra local preservada" }),
    ]);
    expect(saved.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2026-04-03", name: "Sexta-Feira Santa" }),
    ]));
  });
});
