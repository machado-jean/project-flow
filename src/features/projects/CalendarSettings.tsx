import { useState, type SyntheticEvent } from "react";

import {
  CONTINUOUS_CALENDAR_ID,
  type Calendar,
  type CalendarException,
  type Weekday,
} from "../../domain/calendars/calendar";

const WEEKDAYS: readonly { readonly value: Weekday; readonly label: string }[] = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

interface CalendarSettingsProps {
  readonly calendar: Calendar;
  readonly disabled: boolean;
  readonly onSave: (calendar: Calendar) => Promise<boolean>;
}

export function CalendarSettings({ calendar, disabled, onSave }: CalendarSettingsProps) {
  const [draft, setDraft] = useState(calendar);
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionName, setExceptionName] = useState("");
  const [exceptionIsWorking, setExceptionIsWorking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const isContinuous = calendar.id === CONTINUOUS_CALENDAR_ID;

  const toggleWeekday = (weekday: Weekday): void => {
    setDraft((current) => ({
      ...current,
      workingDays: current.workingDays.includes(weekday)
        ? current.workingDays.filter((candidate) => candidate !== weekday)
        : [...current.workingDays, weekday].sort((left, right) => left - right),
    }));
    setDirty(true);
  };

  const addException = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const timestamp = new Date().toISOString();
    const exception: CalendarException = {
      id: crypto.randomUUID(),
      calendarId: draft.id,
      date: exceptionDate,
      isWorkingDay: exceptionIsWorking,
      name: exceptionName || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setDraft((current) => ({
      ...current,
      exceptions: [
        ...current.exceptions.filter((candidate) => candidate.date !== exceptionDate),
        exception,
      ].sort((left, right) => left.date.localeCompare(right.date)),
    }));
    setExceptionDate("");
    setExceptionName("");
    setExceptionIsWorking(false);
    setDirty(true);
  };

  return (
    <details className="calendar-settings">
      <summary>
        <span>Calendário: {calendar.name}</span>
        <small>{calendar.workingDays.length} dias de trabalho por semana</small>
      </summary>
      <div className="calendar-settings-body">
        <p className="calendar-scope-note">
          Alterações neste calendário valem para todos os projetos e tarefas que o utilizam.
        </p>
        {isContinuous ? (
          <p>Este calendário integrado considera todos os dias como disponíveis.</p>
        ) : (
          <>
            <div className="calendar-weekdays" aria-label="Dias de trabalho">
              {WEEKDAYS.map(({ value, label }) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={draft.workingDays.includes(value)}
                    disabled={disabled}
                    onChange={() => { toggleWeekday(value); }}
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="calendar-exceptions">
              <div>
                <h3>Feriados e exceções</h3>
                <p>Uma exceção pode bloquear um dia útil ou liberar uma data normalmente inativa.</p>
              </div>
              {draft.exceptions.length === 0 ? (
                <span className="muted-text">Nenhuma exceção cadastrada.</span>
              ) : (
                <ul>
                  {draft.exceptions.map((exception) => (
                    <li key={exception.id}>
                      <span>
                        <strong>{exception.date}</strong>
                        {exception.name === null ? "" : ` · ${exception.name}`}
                        {exception.isWorkingDay ? " · Dia liberado" : " · Não útil"}
                      </span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setDraft((current) => ({
                            ...current,
                            exceptions: current.exceptions.filter(
                              (candidate) => candidate.id !== exception.id,
                            ),
                          }));
                          setDirty(true);
                        }}
                      >Remover</button>
                    </li>
                  ))}
                </ul>
              )}
              <form className="calendar-exception-form" onSubmit={addException}>
                <label>Data<input type="date" required value={exceptionDate} disabled={disabled} onChange={(event) => { setExceptionDate(event.target.value); }} /></label>
                <label>Nome<input placeholder="Ex.: feriado local" value={exceptionName} disabled={disabled} onChange={(event) => { setExceptionName(event.target.value); }} /></label>
                <label className="working-exception-toggle"><input type="checkbox" checked={exceptionIsWorking} disabled={disabled} onChange={(event) => { setExceptionIsWorking(event.target.checked); }} />Liberar como dia útil</label>
                <button className="secondary-button" type="submit" disabled={disabled}>Adicionar exceção</button>
              </form>
            </div>

            {dirty ? (
              <button
                className="primary-button"
                type="button"
                disabled={disabled || draft.workingDays.length === 0}
                onClick={() => { void onSave(draft).then((saved) => { if (saved) setDirty(false); }); }}
              >Salvar calendário</button>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
