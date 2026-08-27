import { invoke } from "@tauri-apps/api/core";

import { validateCalendar } from "../domain/calendars/calendar";
import { validateProject } from "../domain/projects/project";
import { validateTask } from "../domain/tasks/task";
import type { WorkspaceRepository, WorkspaceSnapshot } from "./workspace-repository";

export class TauriWorkspaceRepository implements WorkspaceRepository {
  async load(): Promise<WorkspaceSnapshot> {
    const snapshot = await invoke<WorkspaceSnapshot>("load_workspace");

    return {
      calendars: snapshot.calendars.map(validateCalendar),
      projects: snapshot.projects.map(validateProject),
      tasks: snapshot.tasks.map(validateTask),
    };
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

  async deleteTaskTree(taskId: string): Promise<void> {
    await invoke("delete_task_tree", { taskId });
  }
}
