import type { Calendar } from "../domain/calendars/calendar";
import type { Project } from "../domain/projects/project";
import type { TaskDependency } from "../domain/scheduling/dependency";
import type { Task } from "../domain/tasks/task";
import type {
  TaskTemplate,
  TaskTemplateBundle,
  TaskTemplateDependency,
  TaskTemplateItem,
} from "../domain/templates/template";

export interface WorkspaceSnapshot {
  readonly calendars: readonly Calendar[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
  readonly dependencies: readonly TaskDependency[];
  readonly templates: readonly TaskTemplate[];
  readonly templateItems: readonly TaskTemplateItem[];
  readonly templateDependencies: readonly TaskTemplateDependency[];
}

export interface DuplicationBundle {
  readonly project: Project | null;
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
  saveDuplicationBundle(bundle: DuplicationBundle): Promise<void>;
  saveTemplateBundle(bundle: TaskTemplateBundle): Promise<void>;
  deleteTemplate(templateId: string): Promise<void>;
}
