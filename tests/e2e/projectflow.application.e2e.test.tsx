import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import App from "../../src/app/App";
import { DEFAULT_CALENDAR_ID, type Calendar } from "../../src/domain/calendars/calendar";
import type { Project } from "../../src/domain/projects/project";
import type { TaskDependency } from "../../src/domain/scheduling/dependency";
import type { Task } from "../../src/domain/tasks/task";
import type {
  TaskTemplate,
  TaskTemplateBundle,
  TaskTemplateDependency,
  TaskTemplateItem,
} from "../../src/domain/templates/template";
import type {
  BackupResult,
  DuplicationBundle,
  ExportResult,
  ImportPackagePreview,
  ImportResult,
  ImportSelection,
  RestoreResult,
  ScheduleChangeSet,
  WorkspaceRepository,
  WorkspaceSnapshot,
} from "../../src/repositories/workspace-repository";

const ganttHarness = vi.hoisted(() => ({
  api: {
    on: vi.fn(),
    intercept: vi.fn(),
    detach: vi.fn(),
  },
}));

vi.mock("@svar-ui/react-gantt", () => ({
  Gantt: ({
    init,
  }: {
    readonly init?: (api: typeof ganttHarness.api) => void;
  }) => {
    useEffect(() => { init?.(ganttHarness.api); }, [init]);
    return <div data-testid="projectflow-gantt" />;
  },
  Willow: ({ children }: PropsWithChildren) => <>{children}</>,
}));

const NOW = "2026-09-01T12:00:00.000Z";
const defaultCalendar: Calendar = {
  id: DEFAULT_CALENDAR_ID,
  name: "Calendário padrão",
  workingDays: [1, 2, 3, 4, 5],
  exceptions: [],
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
};

class JourneyRepository implements WorkspaceRepository {
  calendars: Calendar[] = [defaultCalendar];
  projects: Project[] = [];
  tasks: Task[] = [];
  dependencies: TaskDependency[] = [];
  templates: TaskTemplate[] = [];
  templateItems: TaskTemplateItem[] = [];
  templateDependencies: TaskTemplateDependency[] = [];
  private exportedSnapshot: WorkspaceSnapshot | null = null;

  load(): Promise<WorkspaceSnapshot> {
    return Promise.resolve(structuredClone({
      calendars: this.calendars,
      projects: this.projects,
      tasks: this.tasks,
      dependencies: this.dependencies,
      templates: this.templates,
      templateItems: this.templateItems,
      templateDependencies: this.templateDependencies,
    }));
  }

  saveCalendar(calendar: Calendar): Promise<void> { this.upsert(this.calendars, calendar); return Promise.resolve(); }
  saveProject(project: Project): Promise<void> { this.upsert(this.projects, project); return Promise.resolve(); }
  saveTask(task: Task): Promise<void> { this.upsert(this.tasks, task); return Promise.resolve(); }

  reorderProjects(projectIds: readonly string[]): Promise<void> {
    projectIds.forEach((id, position) => { const item = this.projects.find((candidate) => candidate.id === id); if (item !== undefined) this.upsert(this.projects, { ...item, position }); });
    return Promise.resolve();
  }

  reorderTasks(taskIds: readonly string[]): Promise<void> {
    taskIds.forEach((id, position) => { const item = this.tasks.find((candidate) => candidate.id === id); if (item !== undefined) this.upsert(this.tasks, { ...item, position }); });
    return Promise.resolve();
  }

  deleteProject(projectId: string): Promise<void> {
    this.projects = this.projects.filter(({ id }) => id !== projectId);
    const taskIds = new Set(this.tasks.filter(({ projectId: id }) => id === projectId).map(({ id }) => id));
    this.tasks = this.tasks.filter(({ id }) => !taskIds.has(id));
    this.dependencies = this.dependencies.filter(({ predecessorId, successorId }) => !taskIds.has(predecessorId) && !taskIds.has(successorId));
    return Promise.resolve();
  }

  async applyScheduleChanges(changes: ScheduleChangeSet): Promise<void> {
    for (const calendar of changes.calendarsToSave) this.upsert(this.calendars, calendar);
    for (const taskId of changes.taskTreeIdsToDelete) await this.deleteTaskTree(taskId);
    this.dependencies = this.dependencies.filter(({ id }) => !changes.dependencyIdsToDelete.includes(id));
    for (const dependency of changes.dependenciesToSave) this.upsert(this.dependencies, dependency);
    for (const task of changes.tasks) this.upsert(this.tasks, task);
  }

  deleteTaskTree(taskId: string): Promise<void> {
    const removed = new Set([taskId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of this.tasks) {
        if (task.parentId !== null && removed.has(task.parentId) && !removed.has(task.id)) {
          removed.add(task.id); changed = true;
        }
      }
    }
    this.tasks = this.tasks.filter(({ id }) => !removed.has(id));
    this.dependencies = this.dependencies.filter(({ predecessorId, successorId }) => !removed.has(predecessorId) && !removed.has(successorId));
    return Promise.resolve();
  }

  saveDuplicationBundle(bundle: DuplicationBundle): Promise<void> {
    if (bundle.project !== null) this.upsert(this.projects, bundle.project);
    for (const task of bundle.tasks) this.upsert(this.tasks, task);
    for (const dependency of bundle.dependencies) this.upsert(this.dependencies, dependency);
    return Promise.resolve();
  }

  saveTemplateBundle(bundle: TaskTemplateBundle): Promise<void> {
    this.upsert(this.templates, bundle.template);
    this.templateItems = [...this.templateItems.filter(({ templateId }) => templateId !== bundle.template.id), ...bundle.items];
    this.templateDependencies = [...this.templateDependencies.filter(({ templateId }) => templateId !== bundle.template.id), ...bundle.dependencies];
    return Promise.resolve();
  }

  deleteTemplate(templateId: string): Promise<void> {
    this.templates = this.templates.filter(({ id }) => id !== templateId);
    this.templateItems = this.templateItems.filter(({ templateId: id }) => id !== templateId);
    this.templateDependencies = this.templateDependencies.filter(({ templateId: id }) => id !== templateId);
    return Promise.resolve();
  }

  exportProject(): Promise<ExportResult | null> { return Promise.resolve(null); }

  async exportWorkspace(): Promise<ExportResult | null> {
    this.exportedSnapshot = await this.load();
    return { path: "C:\\e2e\\workspace.projectflow", projectCount: this.projects.length, templateCount: this.templates.length };
  }

  chooseImportPackage(): Promise<ImportPackagePreview | null> {
    const project = this.exportedSnapshot?.projects[0];
    if (project === undefined || this.exportedSnapshot === null) return Promise.resolve(null);
    return Promise.resolve({
      packagePath: "C:\\e2e\\workspace.projectflow",
      exportType: "workspace",
      exportedAt: NOW,
      schemaVersion: 4,
      projects: [{ id: project.id, name: project.name, updatedAt: project.updatedAt, taskCount: this.exportedSnapshot.tasks.length, existsLocally: false, localUpdatedAt: null }],
      templates: [],
    });
  }

  applyImportPackage(packagePath: string, selection: ImportSelection): Promise<ImportResult> {
    void packagePath;
    void selection;
    if (this.exportedSnapshot === null) throw new Error("Nenhum workspace foi exportado.");
    const snapshot = structuredClone(this.exportedSnapshot);
    this.calendars = [...snapshot.calendars]; this.projects = [...snapshot.projects]; this.tasks = [...snapshot.tasks];
    this.dependencies = [...snapshot.dependencies]; this.templates = [...snapshot.templates];
    this.templateItems = [...snapshot.templateItems]; this.templateDependencies = [...snapshot.templateDependencies];
    return Promise.resolve({ backupPath: "C:\\e2e\\backup.sqlite", importedProjectCount: 1, copiedProjectCount: 0, importedTemplateCount: 0 });
  }

  createBackup(): Promise<BackupResult | null> { return Promise.resolve(null); }
  openBackupFolder(): Promise<void> { return Promise.resolve(); }
  chooseRestoreBackup(): Promise<ImportPackagePreview | null> { return Promise.resolve(null); }
  restoreBackup(): Promise<RestoreResult> { return Promise.reject(new Error("Restauração fora desta jornada.")); }

  clearWorkspace(): void {
    this.projects = []; this.tasks = []; this.dependencies = []; this.templates = [];
    this.templateItems = []; this.templateDependencies = [];
  }

  private upsert<T extends { readonly id: string }>(items: T[], item: T): void {
    const index = items.findIndex(({ id }) => id === item.id);
    if (index === -1) items.push(item); else items[index] = item;
  }
}

function taskRow(title: string): HTMLTableRowElement {
  const input = screen.getByDisplayValue(title);
  const row = input.closest("tr");
  if (!(row instanceof HTMLTableRowElement)) throw new Error(`Linha não encontrada para ${title}.`);
  return row;
}

async function createTask(title: string, parentLabel?: string): Promise<void> {
  if (parentLabel !== undefined) fireEvent.change(screen.getByLabelText("Tarefa-pai"), { target: { value: parentLabel } });
  fireEvent.change(screen.getByLabelText("Título da nova tarefa"), { target: { value: title } });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  await screen.findByDisplayValue(title);
}

async function scheduleTask(title: string, startDate: string, duration: string): Promise<void> {
  const row = taskRow(title);
  fireEvent.change(within(row).getByLabelText("Início da tarefa"), { target: { value: startDate } });
  fireEvent.change(within(row).getByLabelText("Duração da tarefa"), { target: { value: duration } });
  fireEvent.click(within(row).getByRole("button", { name: "Salvar" }));
  await waitFor(() => { expect(taskRow(title)).not.toHaveClass("dirty"); }, { timeout: 5_000 });
}

describe("jornada E2E mínima da aplicação", () => {
  it("planeja, propaga, alterna views, duplica, exporta e importa semanticamente", async () => {
    const repository = new JourneyRepository();
    const firstRender = render(<App repository={repository} />);
    await screen.findByRole("heading", { name: "Organize seu primeiro projeto" });
    fireEvent.click(screen.getByRole("button", { name: "Criar projeto" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "E2E — Fluxo mínimo" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await screen.findByRole("heading", { name: "Tabela de tarefas" });

    await createTask("Tarefa A"); await createTask("Tarefa B"); await createTask("Tarefa C");
    await createTask("Entrega com subtarefa");
    const summary = repository.tasks.find(({ title }) => title === "Entrega com subtarefa");
    if (summary === undefined) throw new Error("Tarefa-resumo não criada.");
    await createTask("Subtarefa de validação", summary.id);

    await scheduleTask("Tarefa A", "2026-09-01", "2");
    await scheduleTask("Tarefa B", "2026-09-03", "2");
    await scheduleTask("Tarefa C", "2026-09-07", "1");
    await scheduleTask("Subtarefa de validação", "2026-09-01", "3");

    const taskA = repository.tasks.find(({ title }) => title === "Tarefa A");
    const taskB = repository.tasks.find(({ title }) => title === "Tarefa B");
    if (taskA === undefined || taskB === undefined) throw new Error("Cadeia de tarefas incompleta.");
    fireEvent.change(screen.getByLabelText("Nova predecessora de Tarefa B"), { target: { value: taskA.id } });
    fireEvent.click(screen.getByLabelText("Confirmar predecessora de Tarefa B"));
    await waitFor(() => { expect(repository.dependencies).toHaveLength(1); });
    fireEvent.change(screen.getByLabelText("Nova predecessora de Tarefa C"), { target: { value: taskB.id } });
    fireEvent.click(screen.getByLabelText("Confirmar predecessora de Tarefa C"));
    await waitFor(() => { expect(repository.dependencies).toHaveLength(2); });

    const rowA = taskRow("Tarefa A");
    fireEvent.change(within(rowA).getByLabelText("Início da tarefa"), { target: { value: "2026-09-03" } });
    fireEvent.click(within(rowA).getByRole("button", { name: "Salvar" }));
    await waitFor(() => {
      expect(repository.tasks.find(({ title }) => title === "Tarefa B")?.startDate).toBe("2026-09-07");
      expect(repository.tasks.find(({ title }) => title === "Tarefa C")?.startDate).toBe("2026-09-09");
    });

    fireEvent.click(screen.getByRole("tab", { name: "Kanban" }));
    expect(await screen.findByRole("heading", { name: "Quadro Kanban" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Gantt" }));
    expect(await screen.findByRole("heading", { name: "Gráfico de Gantt" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Tabela" }));

    fireEvent.click(within(taskRow("Entrega com subtarefa")).getByRole("button", { name: "Detalhes" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicar árvore" }));
    await waitFor(() => { expect(repository.tasks).toHaveLength(7); });

    fireEvent.click(screen.getByText("Arquivo"));
    fireEvent.click(screen.getByRole("button", { name: "Exportar workspace" }));
    expect(await screen.findByText(/Workspace exportado para C:\\e2e\\workspace.projectflow/)).toBeVisible();
    const expectedSnapshot = await repository.load();

    repository.clearWorkspace(); firstRender.unmount();
    render(<App repository={repository} />);
    await screen.findByRole("heading", { name: "Organize seu primeiro projeto" });
    fireEvent.click(screen.getByText("Arquivo"));
    fireEvent.click(screen.getByRole("button", { name: "Importar pacote" }));
    const dialog = await screen.findByRole("dialog", { name: "Escolher conteúdo para importar" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Importar seleção" }));

    await screen.findByDisplayValue("E2E — Fluxo mínimo");
    await waitFor(async () => {
      expect(repository.tasks).toHaveLength(7);
      expect(repository.dependencies).toHaveLength(2);
      expect(repository.tasks.find(({ title }) => title === "Tarefa C")?.startDate).toBe("2026-09-09");
      expect(await repository.load()).toEqual(expectedSnapshot);
    });
    fireEvent.click(screen.getByRole("tab", { name: "Kanban" }));
    expect(await screen.findByRole("heading", { name: "Quadro Kanban" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Gantt" }));
    expect(await screen.findByRole("heading", { name: "Gráfico de Gantt" })).toBeVisible();
  });
});
