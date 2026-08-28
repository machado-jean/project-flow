import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

import { validateCalendar } from "../domain/calendars/calendar";
import { validateProject } from "../domain/projects/project";
import { validateTaskDependency } from "../domain/scheduling/dependency";
import { validateTask } from "../domain/tasks/task";
import type {
  ScheduleChangeSet,
  WorkspaceRepository,
  WorkspaceSnapshot,
} from "./workspace-repository";

export class TauriWorkspaceRepository implements WorkspaceRepository {
  private database: Database | null = null;

  private async ensureDatabase(): Promise<void> {
    if (this.database !== null) return;
    const databaseUrl = await invoke<string>("database_url");
    this.database = await Database.load(databaseUrl);
  }

  async load(): Promise<WorkspaceSnapshot> {
    await this.ensureDatabase();
    const snapshot = await invoke<WorkspaceSnapshot>("load_workspace");

    const tasks = snapshot.tasks.map(validateTask);
    return {
      calendars: snapshot.calendars.map(validateCalendar),
      projects: snapshot.projects.map(validateProject),
      tasks,
      dependencies: snapshot.dependencies.map((dependency) =>
        validateTaskDependency(dependency, tasks),
      ),
    };
  }

  async saveCalendar(calendar: Parameters<WorkspaceRepository["saveCalendar"]>[0]): Promise<void> {
    await invoke("save_calendar", { calendar: validateCalendar(calendar) });
  }

  async saveProject(project: Parameters<WorkspaceRepository["saveProject"]>[0]): Promise<void> {
    await invoke("save_project", { project: validateProject(project) });
  }

  async reorderProjects(projectIds: readonly string[]): Promise<void> {
    await invoke("reorder_projects", { projectIds });
  }

  async deleteProject(projectId: string): Promise<void> {
    await invoke("delete_project", { projectId });
  }

  async saveTask(task: Parameters<WorkspaceRepository["saveTask"]>[0]): Promise<void> {
    await invoke("save_task", { task: validateTask(task) });
  }

  async reorderTasks(taskIds: readonly string[]): Promise<void> {
    await invoke("reorder_tasks", { taskIds });
  }

  async applyScheduleChanges(changes: ScheduleChangeSet): Promise<void> {
    await invoke("apply_schedule_changes", {
      changes: {
        calendarsToSave: changes.calendarsToSave.map(validateCalendar),
        tasks: changes.tasks.map(validateTask),
        dependenciesToSave: changes.dependenciesToSave,
        dependencyIdsToDelete: changes.dependencyIdsToDelete,
        taskTreeIdsToDelete: changes.taskTreeIdsToDelete,
      },
    });
  }

  async deleteTaskTree(taskId: string): Promise<void> {
    await invoke("delete_task_tree", { taskId });
  }
}
