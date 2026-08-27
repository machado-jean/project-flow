import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "../../../src/app/App";
import {
  DEFAULT_CALENDAR_ID,
  type Calendar,
} from "../../../src/domain/calendars/calendar";
import type { Project } from "../../../src/domain/projects/project";
import type { Task } from "../../../src/domain/tasks/task";
import type {
  WorkspaceRepository,
  WorkspaceSnapshot,
} from "../../../src/repositories/workspace-repository";

const NOW = "2026-08-27T15:00:00.000Z";
const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const TASK_ID = "20000000-0000-4000-8000-000000000001";

const defaultCalendar: Calendar = {
  id: DEFAULT_CALENDAR_ID,
  name: "Calendário padrão",
  workingDays: [1, 2, 3, 4, 5],
  isDefault: true,
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

class MemoryWorkspaceRepository implements WorkspaceRepository {
  readonly calendars: Calendar[];
  readonly projects: Project[];
  readonly tasks: Task[];

  constructor(snapshot: Partial<WorkspaceSnapshot> = {}) {
    this.calendars = [...(snapshot.calendars ?? [defaultCalendar])];
    this.projects = [...(snapshot.projects ?? [])];
    this.tasks = [...(snapshot.tasks ?? [])];
  }

  load(): Promise<WorkspaceSnapshot> {
    return Promise.resolve({
      calendars: [...this.calendars],
      projects: [...this.projects],
      tasks: [...this.tasks],
    });
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
});
