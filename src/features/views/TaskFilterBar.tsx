import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "../../domain/tasks/task";
import { EMPTY_TASK_FILTERS, type TaskFilters } from "./task-filters";

interface TaskFilterBarProps {
  readonly filters: TaskFilters;
  readonly resultCount: number;
  readonly totalCount: number;
  readonly onChange: (filters: TaskFilters) => void;
}

export function TaskFilterBar({
  filters,
  resultCount,
  totalCount,
  onChange,
}: TaskFilterBarProps) {
  const update = (changes: Partial<TaskFilters>): void => {
    onChange({ ...filters, ...changes });
  };

  return (
    <section className="task-filters" aria-labelledby="task-filters-title">
      <div className="filter-heading">
        <div>
          <strong id="task-filters-title">Localizar e filtrar</strong>
          <span aria-live="polite">{String(resultCount)} de {String(totalCount)} tarefas</span>
        </div>
        <button
          type="button"
          className="text-button filter-clear"
          onClick={() => { onChange(EMPTY_TASK_FILTERS); }}
        >
          Limpar filtros
        </button>
      </div>
      <div className="filter-grid">
        <label className="filter-search">
          <span>Texto</span>
          <input
            type="search"
            placeholder="Título, código, responsável…"
            value={filters.query}
            onChange={(event) => { update({ query: event.target.value }); }}
          />
        </label>
        <label>
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => {
              update({ status: event.target.value as TaskFilters["status"] });
            }}
          >
            <option value="ALL">Todos</option>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Prioridade</span>
          <select
            value={filters.priority}
            onChange={(event) => {
              update({ priority: event.target.value as TaskFilters["priority"] });
            }}
          >
            <option value="ALL">Todas</option>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{TASK_PRIORITY_LABELS[priority]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Conclusão</span>
          <select
            value={filters.completion}
            onChange={(event) => {
              update({ completion: event.target.value as TaskFilters["completion"] });
            }}
          >
            <option value="ALL">Todas</option>
            <option value="OPEN">Não concluídas</option>
            <option value="COMPLETED">Concluídas</option>
          </select>
        </label>
        <label>
          <span>De</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => { update({ dateFrom: event.target.value }); }}
          />
        </label>
        <label>
          <span>Até</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => { update({ dateTo: event.target.value }); }}
          />
        </label>
        <label>
          <span>Tag</span>
          <input
            type="search"
            placeholder="Ex.: frontend"
            value={filters.tag}
            onChange={(event) => { update({ tag: event.target.value }); }}
          />
        </label>
      </div>
    </section>
  );
}
