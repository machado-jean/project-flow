import type { Calendar } from "../domain/calendars/calendar";
import type { Project } from "../domain/projects/project";
import type { Task } from "../domain/tasks/task";

export interface WorkspaceSnapshot {
  readonly calendars: readonly Calendar[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
}

export interface WorkspaceRepository {
  load(): Promise<WorkspaceSnapshot>;
  saveProject(project: Project): Promise<void>;
  reorderProjects(projectIds: readonly string[]): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  saveTask(task: Task): Promise<void>;
  reorderTasks(taskIds: readonly string[]): Promise<void>;
  deleteTaskTree(taskId: string): Promise<void>;
}
