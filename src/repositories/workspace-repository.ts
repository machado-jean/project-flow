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

export type ExportType = "project" | "workspace";
export type ProjectImportMode = "REPLACE" | "COPY";

export interface ImportProjectPreview {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly taskCount: number;
  readonly existsLocally: boolean;
  readonly localUpdatedAt: string | null;
}

export interface ImportTemplatePreview {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly itemCount: number;
  readonly existsLocally: boolean;
  readonly localUpdatedAt: string | null;
}

export interface ImportPackagePreview {
  readonly packagePath: string;
  readonly exportType: ExportType;
  readonly exportedAt: string;
  readonly schemaVersion: number;
  readonly projects: readonly ImportProjectPreview[];
  readonly templates: readonly ImportTemplatePreview[];
}

export interface ImportSelection {
  readonly projects: readonly {
    readonly projectId: string;
    readonly mode: ProjectImportMode;
  }[];
  readonly templateIds: readonly string[];
}

export interface ExportResult {
  readonly path: string;
  readonly projectCount: number;
  readonly templateCount: number;
}

export interface ImportResult {
  readonly backupPath: string;
  readonly importedProjectCount: number;
  readonly copiedProjectCount: number;
  readonly importedTemplateCount: number;
}

export interface BackupResult { readonly path: string }

export interface RestoreResult {
  readonly safetyBackupPath: string;
  readonly projectCount: number;
  readonly templateCount: number;
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
  exportProject(projectId: string, suggestedName: string): Promise<ExportResult | null>;
  exportWorkspace(): Promise<ExportResult | null>;
  chooseImportPackage(): Promise<ImportPackagePreview | null>;
  applyImportPackage(packagePath: string, selection: ImportSelection): Promise<ImportResult>;
  createBackup(): Promise<BackupResult | null>;
  openBackupFolder(): Promise<void>;
  chooseRestoreBackup(): Promise<ImportPackagePreview | null>;
  restoreBackup(backupPath: string): Promise<RestoreResult>;
}
