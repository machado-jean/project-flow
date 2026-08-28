import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "../../../src/app/App";
import {
  CONTINUOUS_CALENDAR_ID,
  DEFAULT_CALENDAR_ID,
  type Calendar,
} from "../../../src/domain/calendars/calendar";
import type { Project } from "../../../src/domain/projects/project";
import type { Task } from "../../../src/domain/tasks/task";
import type { TaskDependency } from "../../../src/domain/scheduling/dependency";
import type {
  ScheduleChangeSet,
  WorkspaceRepository,
  WorkspaceSnapshot,
} from "../../../src/repositories/workspace-repository";

const NOW = "2026-08-27T15:00:00.000Z";
const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const TASK_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_TASK_ID = "20000000-0000-4000-8000-000000000002";
const THIRD_TASK_ID = "20000000-0000-4000-8000-000000000003";

const defaultCalendar: Calendar = {
  id: DEFAULT_CALENDAR_ID,
  name: "Calendário padrão",
  workingDays: [1, 2, 3, 4, 5],
  exceptions: [],
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const continuousCalendar: Calendar = {
  id: CONTINUOUS_CALENDAR_ID,
  name: "Todos os dias",
  workingDays: [1, 2, 3, 4, 5, 6, 7],
  exceptions: [],
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};

function project(): Project {
  return {
    id: PROJECT_ID,
    name: "Projeto Alfa",
    description: null,
    status: "ACTIVE",
    calendarId: DEFAULT_CALENDAR_ID,
    position: 0,
    isArchived: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function task(): Task {
  return {
    id: TASK_ID,
    code: null,
    projectId: PROJECT_ID,
    parentId: null,
    calendarId: null,
    title: "Preparar operação",
    description: null,
    status: "NOT_STARTED",
    priority: "NORMAL",
    progress: 0,
    startDate: null,
    endDate: null,
    durationDays: null,
    schedulingMode: "AUTO",
    position: 0,
    assignee: null,
    tags: [],
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function scheduledTask(
  id: string,
  title: string,
  startDate: string,
  options: Partial<Task> = {},
): Task {
  return {
    ...task(),
    id,
    title,
    startDate,
    endDate: startDate,
    durationDays: 1,
    ...options,
  };
}

function dependency(predecessorId: string, successorId: string): TaskDependency {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    projectId: PROJECT_ID,
    predecessorId,
    successorId,
    type: "FS",
    lagDays: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

class MemoryWorkspaceRepository implements WorkspaceRepository {
  readonly calendars: Calendar[];
  readonly projects: Project[];
  readonly tasks: Task[];
  readonly dependencies: TaskDependency[];
  readonly appliedScheduleChanges: ScheduleChangeSet[] = [];

  constructor(snapshot: Partial<WorkspaceSnapshot> = {}) {
    this.calendars = [...(snapshot.calendars ?? [defaultCalendar])];
    this.projects = [...(snapshot.projects ?? [])];
    this.tasks = [...(snapshot.tasks ?? [])];
    this.dependencies = [...(snapshot.dependencies ?? [])];
  }

  load(): Promise<WorkspaceSnapshot> {
    return Promise.resolve({
      calendars: [...this.calendars],
      projects: [...this.projects],
      tasks: [...this.tasks],
      dependencies: [...this.dependencies],
    });
  }

  saveCalendar(savedCalendar: Calendar): Promise<void> {
    const index = this.calendars.findIndex((candidate) => candidate.id === savedCalendar.id);
    if (index === -1) this.calendars.push(savedCalendar);
    else this.calendars[index] = savedCalendar;
    return Promise.resolve();
  }

  saveProject(savedProject: Project): Promise<void> {
    const index = this.projects.findIndex((candidate) => candidate.id === savedProject.id);
    if (index === -1) this.projects.push(savedProject);
    else this.projects[index] = savedProject;
    return Promise.resolve();
  }

  reorderProjects(projectIds: readonly string[]): Promise<void> {
    projectIds.forEach((projectId, position) => {
      const project = this.projects.find((candidate) => candidate.id === projectId);
      if (project === undefined) throw new Error("Projeto não encontrado.");
      this.projects[this.projects.indexOf(project)] = { ...project, position };
    });
    return Promise.resolve();
  }

  deleteProject(projectId: string): Promise<void> {
    const projectIndex = this.projects.findIndex((candidate) => candidate.id === projectId);
    if (projectIndex >= 0) this.projects.splice(projectIndex, 1);
    for (let index = this.tasks.length - 1; index >= 0; index -= 1) {
      if (this.tasks[index]?.projectId === projectId) this.tasks.splice(index, 1);
    }
    return Promise.resolve();
  }

  saveTask(savedTask: Task): Promise<void> {
    const index = this.tasks.findIndex((candidate) => candidate.id === savedTask.id);
    if (index === -1) this.tasks.push(savedTask);
    else this.tasks[index] = savedTask;
    return Promise.resolve();
  }

  reorderTasks(taskIds: readonly string[]): Promise<void> {
    taskIds.forEach((taskId, position) => {
      const task = this.tasks.find((candidate) => candidate.id === taskId);
      if (task === undefined) throw new Error("Tarefa não encontrada.");
      this.tasks[this.tasks.indexOf(task)] = { ...task, position };
    });
    return Promise.resolve();
  }

  async applyScheduleChanges(changes: ScheduleChangeSet): Promise<void> {
    this.appliedScheduleChanges.push(changes);
    for (const calendar of changes.calendarsToSave) await this.saveCalendar(calendar);
    for (const taskId of changes.taskTreeIdsToDelete) await this.deleteTaskTree(taskId);
    for (const dependencyId of changes.dependencyIdsToDelete) {
      const index = this.dependencies.findIndex((dependency) => dependency.id === dependencyId);
      if (index >= 0) this.dependencies.splice(index, 1);
    }
    for (const dependency of changes.dependenciesToSave) {
      const index = this.dependencies.findIndex((candidate) => candidate.id === dependency.id);
      if (index === -1) this.dependencies.push(dependency);
      else this.dependencies[index] = dependency;
    }
    for (const task of changes.tasks) await this.saveTask(task);
  }

  deleteTaskTree(taskId: string): Promise<void> {
    const pending = [taskId];
    const removed = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined || removed.has(current)) continue;
      removed.add(current);
      pending.push(...this.tasks.filter((candidate) => candidate.parentId === current).map(({ id }) => id));
    }
    for (let index = this.tasks.length - 1; index >= 0; index -= 1) {
      const candidate = this.tasks[index];
      if (candidate !== undefined && removed.has(candidate.id)) this.tasks.splice(index, 1);
    }
    return Promise.resolve();
  }
}

describe("aplicação ProjectFlow", () => {
  it("apresenta o estado vazio inteiramente em português", async () => {
    render(<App repository={new MemoryWorkspaceRepository()} />);

    expect(await screen.findByRole("heading", { name: "Organize seu primeiro projeto" })).toBeVisible();
    expect(screen.queryByText("Os dados permanecem neste computador.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar projeto" })).toBeVisible();
  });

  it("cria um projeto e abre sua tabela", async () => {
    const repository = new MemoryWorkspaceRepository();
    render(<App repository={repository} />);

    await screen.findByRole("heading", { name: "Organize seu primeiro projeto" });
    fireEvent.click(screen.getByRole("button", { name: "Criar projeto" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Implantação" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    expect(await screen.findByRole("heading", { name: "Tabela de tarefas" })).toBeVisible();
    expect(screen.getByLabelText("Nome do projeto")).toHaveValue("Implantação");
    expect(repository.projects).toHaveLength(1);
  });

  it("cria e edita uma tarefa na tabela", async () => {
    const repository = new MemoryWorkspaceRepository({ projects: [project()] });
    render(<App repository={repository} />);

    const quickTask = await screen.findByLabelText("Título da nova tarefa");
    fireEvent.change(quickTask, { target: { value: "Validar escopo" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    const title = await screen.findByLabelText("Título da tarefa");
    fireEvent.change(title, { target: { value: "Validar escopo aprovado" } });
    fireEvent.change(screen.getByLabelText("Status da tarefa"), {
      target: { value: "IN_PROGRESS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(repository.tasks[0]?.title).toBe("Validar escopo aprovado");
      expect(repository.tasks[0]?.status).toBe("IN_PROGRESS");
    });
  });

  it("carrega uma tarefa persistida", async () => {
    render(<App repository={new MemoryWorkspaceRepository({ projects: [project()], tasks: [task()] })} />);

    expect(await screen.findByDisplayValue("Preparar operação")).toBeVisible();
    expect(screen.getByDisplayValue("Não iniciada")).toBeVisible();
  });

  it("abre detalhes em uma linha ampla e explica o código visual", async () => {
    render(<App repository={new MemoryWorkspaceRepository({ projects: [project()], tasks: [task()] })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Detalhes" }));

    const code = screen.getByLabelText("Código visual da tarefa");
    const detailsRow = code.closest("tr");
    expect(detailsRow).toHaveClass("task-details-row");
    expect(code.closest("td")).toHaveAttribute("colspan", "11");
    expect(screen.getByLabelText("Ajuda sobre o código visual")).toHaveAttribute(
      "title",
      expect.stringContaining("DEV-01"),
    );
    expect(screen.getByText(/Ele não altera o UUID interno da tarefa/)).toBeInTheDocument();
  });

  it("apresenta erros de validação em português sem persistir dados incompletos", async () => {
    const repository = new MemoryWorkspaceRepository({ projects: [project()], tasks: [task()] });
    render(<App repository={repository} />);

    const startDate = await screen.findByLabelText("Início da tarefa");
    fireEvent.change(startDate, { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Início, fim e duração devem ser informados juntos.",
    );
    expect(repository.tasks[0]?.startDate).toBeNull();
  });

  it("reordena tarefas irmãs e persiste as novas posições", async () => {
    const firstTask = task();
    const secondTask: Task = {
      ...task(),
      id: "20000000-0000-4000-8000-000000000002",
      title: "Executar operação",
      position: 1,
    };
    const repository = new MemoryWorkspaceRepository({
      projects: [project()],
      tasks: [firstTask, secondTask],
    });
    render(<App repository={repository} />);

    const moveDown = await screen.findByRole("button", {
      name: "Mover Preparar operação para baixo",
    });
    fireEvent.click(moveDown);

    await waitFor(() => {
      expect(repository.tasks.find(({ id }) => id === firstTask.id)?.position).toBe(1);
      expect(repository.tasks.find(({ id }) => id === secondTask.id)?.position).toBe(0);
    });
    expect(
      screen
        .getAllByLabelText("Título da tarefa")
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(["Executar operação", "Preparar operação"]);
  });

  it("calcula o fim ao informar início e duração", async () => {
    const repository = new MemoryWorkspaceRepository({ projects: [project()], tasks: [task()] });
    render(<App repository={repository} />);

    fireEvent.change(await screen.findByLabelText("Início da tarefa"), {
      target: { value: "2026-08-31" },
    });
    fireEvent.change(screen.getByLabelText("Duração da tarefa"), {
      target: { value: "3" },
    });

    expect(screen.getByLabelText("Fim da tarefa")).toHaveValue("2026-09-02");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(repository.tasks[0]?.startDate).toBe("2026-08-31");
      expect(repository.tasks[0]?.endDate).toBe("2026-09-02");
      expect(repository.tasks[0]?.durationDays).toBe(3);
    });
  });

  it("cria predecessora TI e empurra a sucessora automática para o próximo dia útil", async () => {
    const predecessor = scheduledTask(TASK_ID, "Predecessora", "2026-08-28");
    const successor = scheduledTask(SECOND_TASK_ID, "Sucessora", "2026-08-28", { position: 1 });
    const repository = new MemoryWorkspaceRepository({
      projects: [project()],
      tasks: [predecessor, successor],
    });
    render(<App repository={repository} />);

    fireEvent.change(await screen.findByLabelText("Nova predecessora de Sucessora"), {
      target: { value: predecessor.id },
    });
    fireEvent.click(screen.getByLabelText("Confirmar predecessora de Sucessora"));

    await waitFor(() => {
      expect(repository.dependencies).toHaveLength(1);
      expect(repository.tasks.find(({ id }) => id === successor.id)?.startDate).toBe("2026-08-31");
      expect(repository.tasks.find(({ id }) => id === successor.id)?.endDate).toBe("2026-08-31");
    });
    expect(await screen.findByText("Predecessora", { selector: ".dependency-item span" })).toBeVisible();
  });

  it("salva tarefa e lag juntos pelo único botão da coluna Ações", async () => {
    const predecessor = scheduledTask(TASK_ID, "Predecessora", "2026-08-28");
    const successor = scheduledTask(SECOND_TASK_ID, "Sucessora", "2026-08-31", { position: 1 });
    const repository = new MemoryWorkspaceRepository({
      projects: [project()],
      tasks: [predecessor, successor],
      dependencies: [dependency(predecessor.id, successor.id)],
    });
    render(<App repository={repository} />);

    const lag = await screen.findByLabelText("Intervalo após Predecessora");
    fireEvent.change(lag, { target: { value: "2" } });
    fireEvent.change(screen.getAllByLabelText("Status da tarefa")[1] as HTMLElement, {
      target: { value: "IN_PROGRESS" },
    });

    expect(repository.dependencies[0]?.lagDays).toBe(0);
    expect(repository.tasks.find(({ id }) => id === successor.id)?.status).toBe("NOT_STARTED");
    const saveButtons = screen.getAllByRole("button", { name: "Salvar" });
    expect(saveButtons).toHaveLength(1);
    expect(saveButtons[0]?.closest("td")).toHaveClass("row-actions");
    fireEvent.click(saveButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(repository.dependencies[0]?.lagDays).toBe(2);
      expect(repository.tasks.find(({ id }) => id === successor.id)?.status).toBe("IN_PROGRESS");
      expect(repository.tasks.find(({ id }) => id === successor.id)?.startDate).toBe("2026-09-02");
    });
    expect(repository.appliedScheduleChanges).toHaveLength(1);
    expect(repository.appliedScheduleChanges[0]?.dependenciesToSave[0]?.lagDays).toBe(2);
    expect(
      repository.appliedScheduleChanges[0]?.tasks.some(({ id }) => id === successor.id),
    ).toBe(true);
  });

  it("não salva a tarefa quando o lag da mesma linha é inválido", async () => {
    const predecessor = scheduledTask(TASK_ID, "Predecessora", "2026-08-28");
    const successor = scheduledTask(SECOND_TASK_ID, "Sucessora", "2026-08-31", { position: 1 });
    const repository = new MemoryWorkspaceRepository({
      projects: [project()],
      tasks: [predecessor, successor],
      dependencies: [dependency(predecessor.id, successor.id)],
    });
    render(<App repository={repository} />);

    fireEvent.change(await screen.findByLabelText("Intervalo após Predecessora"), {
      target: { value: "-1" },
    });
    fireEvent.change(screen.getAllByLabelText("Status da tarefa")[1] as HTMLElement, {
      target: { value: "IN_PROGRESS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O intervalo deve ser um número inteiro maior ou igual a zero.",
    );
    expect(repository.dependencies[0]?.lagDays).toBe(0);
    expect(repository.tasks.find(({ id }) => id === successor.id)?.status).toBe("NOT_STARTED");
    expect(repository.appliedScheduleChanges).toHaveLength(0);
  });

  it("preserva tarefa manual e apresenta conflito apenas para sua predecessora declarada", async () => {
    const predecessor = scheduledTask(TASK_ID, "Entrega anterior", "2026-08-28");
    const manual = scheduledTask(SECOND_TASK_ID, "Marco manual", "2026-08-28", {
      position: 1,
      schedulingMode: "MANUAL",
    });
    const repository = new MemoryWorkspaceRepository({
      projects: [project()],
      tasks: [predecessor, manual],
    });
    render(<App repository={repository} />);

    fireEvent.change(await screen.findByLabelText("Nova predecessora de Marco manual"), {
      target: { value: predecessor.id },
    });
    fireEvent.click(screen.getByLabelText("Confirmar predecessora de Marco manual"));

    expect(await screen.findByText("1 conflito de agendamento")).toBeVisible();
    expect(screen.getByText(/deveria começar em 2026-08-31 ou depois/)).toBeVisible();
    expect(repository.tasks.find(({ id }) => id === manual.id)?.startDate).toBe("2026-08-28");
  });

  it("usa o calendário da tarefa para permitir propagação no fim de semana", async () => {
    const predecessor = scheduledTask(TASK_ID, "Fechamento", "2026-08-28");
    const successor = scheduledTask(SECOND_TASK_ID, "Plantão", "2026-08-28", {
      position: 1,
      calendarId: CONTINUOUS_CALENDAR_ID,
    });
    const repository = new MemoryWorkspaceRepository({
      calendars: [defaultCalendar, continuousCalendar],
      projects: [project()],
      tasks: [predecessor, successor],
    });
    render(<App repository={repository} />);

    fireEvent.change(await screen.findByLabelText("Nova predecessora de Plantão"), {
      target: { value: predecessor.id },
    });
    fireEvent.click(screen.getByLabelText("Confirmar predecessora de Plantão"));

    await waitFor(() => {
      expect(repository.tasks.find(({ id }) => id === successor.id)?.startDate).toBe("2026-08-29");
    });
  });

  it("salva uma exceção do calendário e reposiciona tarefa automática em transação", async () => {
    const automaticTask = scheduledTask(TASK_ID, "Atividade útil", "2026-08-31");
    const repository = new MemoryWorkspaceRepository({
      projects: [project()],
      tasks: [automaticTask],
    });
    render(<App repository={repository} />);

    fireEvent.click(await screen.findByText("Calendário: Calendário padrão"));
    fireEvent.change(screen.getByLabelText("Data"), {
      target: { value: "2026-08-31" },
    });
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Feriado local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar exceção" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar calendário" }));

    await waitFor(() => {
      expect(repository.calendars[0]?.exceptions[0]?.date).toBe("2026-08-31");
      expect(repository.tasks[0]?.startDate).toBe("2026-09-01");
      expect(repository.tasks[0]?.endDate).toBe("2026-09-01");
    });
  });

  it("recalcula conflito manual ao alterar o calendário da sucessora", async () => {
    const predecessor = scheduledTask(TASK_ID, "Entrega anterior", "2026-09-04");
    const manual = scheduledTask(SECOND_TASK_ID, "Marco manual", "2026-09-07", {
      position: 1,
      schedulingMode: "MANUAL",
    });
    const repository = new MemoryWorkspaceRepository({
      projects: [project()],
      tasks: [predecessor, manual],
      dependencies: [dependency(predecessor.id, manual.id)],
    });
    render(<App repository={repository} />);

    expect(await screen.findByDisplayValue("Marco manual")).toBeVisible();
    expect(screen.queryByText("1 conflito de agendamento")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Calendário: Calendário padrão"));
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-07" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar exceção" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar calendário" }));

    expect(await screen.findByText("1 conflito de agendamento")).toBeVisible();
    expect(screen.getByText(/deveria começar em 2026-09-08 ou depois/)).toBeVisible();
    expect(repository.tasks.find(({ id }) => id === manual.id)?.startDate).toBe("2026-09-07");
  });

  it("reconstrói e mantém conflito persistido ao editar uma tarefa não relacionada", async () => {
    const predecessor = scheduledTask(TASK_ID, "Entrega anterior", "2026-08-28");
    const manual = scheduledTask(SECOND_TASK_ID, "Marco manual", "2026-08-28", {
      position: 1,
      schedulingMode: "MANUAL",
    });
    const unrelated = scheduledTask(THIRD_TASK_ID, "Atividade paralela", "2026-08-28", {
      position: 2,
    });
    const repository = new MemoryWorkspaceRepository({
      projects: [project()],
      tasks: [predecessor, manual, unrelated],
      dependencies: [dependency(predecessor.id, manual.id)],
    });
    render(<App repository={repository} />);

    expect(await screen.findByText("1 conflito de agendamento")).toBeVisible();
    const statusFields = screen.getAllByLabelText("Status da tarefa");
    fireEvent.change(statusFields[2] as HTMLElement, { target: { value: "IN_PROGRESS" } });
    const saveButtons = screen.getAllByRole("button", { name: "Salvar" });
    fireEvent.click(saveButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(repository.tasks.find(({ id }) => id === unrelated.id)?.status).toBe("IN_PROGRESS");
    });
    expect(screen.getByText("1 conflito de agendamento")).toBeVisible();
  });

  it("reconcilia e persiste uma cadeia automática ao carregar o workspace", async () => {
    const predecessor = scheduledTask(TASK_ID, "Predecessora", "2026-08-28");
    const successor = scheduledTask(SECOND_TASK_ID, "Sucessora", "2026-08-28", { position: 1 });
    const repository = new MemoryWorkspaceRepository({
      projects: [project()],
      tasks: [predecessor, successor],
      dependencies: [dependency(predecessor.id, successor.id)],
    });
    render(<App repository={repository} />);

    expect(await screen.findByDisplayValue("Sucessora")).toBeVisible();
    await waitFor(() => {
      expect(repository.tasks.find(({ id }) => id === successor.id)?.startDate).toBe("2026-08-31");
    });
    expect(screen.getAllByLabelText("Início da tarefa")[1]).toHaveValue("2026-08-31");
  });

  it("deriva e bloqueia as datas da tarefa-resumo a partir da subtarefa", async () => {
    const summary = task();
    const child = scheduledTask(SECOND_TASK_ID, "Subtarefa", "2026-09-01", {
      parentId: summary.id,
    });
    const repository = new MemoryWorkspaceRepository({
      projects: [project()],
      tasks: [summary, child],
    });
    render(<App repository={repository} />);

    fireEvent.click(await screen.findByRole("button", { name: "Expandir subtarefas" }));
    const starts = screen.getAllByLabelText("Início da tarefa");
    const ends = screen.getAllByLabelText("Fim da tarefa");
    const durations = screen.getAllByLabelText("Duração da tarefa");

    expect(starts[0]).toBeDisabled();
    expect(ends[0]).toBeDisabled();
    expect(durations[0]).toBeDisabled();
    expect(screen.getByText("Resumo")).toBeVisible();
    expect(screen.getByText("Datas derivadas")).toBeVisible();
  });
});
