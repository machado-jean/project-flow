import type { Calendar } from "../domain/calendars/calendar";
import type { Project } from "../domain/projects/project";
import type { TaskDependency } from "../domain/scheduling/dependency";
import type { Task } from "../domain/tasks/task";

export interface WorkspaceSnapshot {
  readonly calendars: readonly Calendar[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
  readonly dependencies: readonly TaskDependency[];
}

export interface ScheduleChangeSet {
  readonly calendarsToSave: readonly Calendar[];
  readonly tasks: readonly Task[];
  readonly dependenciesToSave: readonly TaskDependency[];
  readonly dependencyIdsToDelete: readonly string[];
  readonly taskTreeIdsToDelete: readonly string[];
}

export interface WorkspaceRepository {
  load(): Promise<WorkspaceSnapshot>;
  saveCalendar(calendar: Calendar): Promise<void>;
  saveProject(project: Project): Promise<void>;
  reorderProjects(projectIds: readonly string[]): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  saveTask(task: Task): Promise<void>;
  reorderTasks(taskIds: readonly string[]): Promise<void>;
  applyScheduleChanges(changes: ScheduleChangeSet): Promise<void>;
  deleteTaskTree(taskId: string): Promise<void>;
}
