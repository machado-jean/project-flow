import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

import { validateCalendar } from "../domain/calendars/calendar";
import { validateProject } from "../domain/projects/project";
import { validateTaskDependency } from "../domain/scheduling/dependency";
import { validateTask } from "../domain/tasks/task";
import {
  validateTaskTemplateBundle,
  validateTaskTemplateDependency,
  validateTaskTemplateItem,
  validateTaskTemplate,
} from "../domain/templates/template";
import type {
  BackupResult,
  ExportResult,
  ImportPackagePreview,
  ImportResult,
  ImportSelection,
  RestoreResult,
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
    const templates = snapshot.templates.map(validateTaskTemplate);
    const templateItems = snapshot.templateItems.map(validateTaskTemplateItem);
    const templateDependencies = snapshot.templateDependencies.map(
      validateTaskTemplateDependency,
    );
    for (const template of templates) {
      validateTaskTemplateBundle({
        template,
        items: templateItems.filter((item) => item.templateId === template.id),
        dependencies: templateDependencies.filter(
          (dependency) => dependency.templateId === template.id,
        ),
      });
    }
    return {
      calendars: snapshot.calendars.map(validateCalendar),
      projects: snapshot.projects.map(validateProject),
      tasks,
      dependencies: snapshot.dependencies.map((dependency) =>
        validateTaskDependency(dependency, tasks),
      ),
      templates,
      templateItems,
      templateDependencies,
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

  async saveDuplicationBundle(
    bundle: Parameters<WorkspaceRepository["saveDuplicationBundle"]>[0],
  ): Promise<void> {
    const tasks = bundle.tasks.map(validateTask);
    await invoke("save_duplication_bundle", {
      bundle: {
        project: bundle.project === null ? null : validateProject(bundle.project),
        tasks,
        dependencies: bundle.dependencies.map((dependency) =>
          validateTaskDependency(dependency, tasks),
        ),
      },
    });
  }

  async saveTemplateBundle(
    bundle: Parameters<WorkspaceRepository["saveTemplateBundle"]>[0],
  ): Promise<void> {
    await invoke("save_template_bundle", { bundle: validateTaskTemplateBundle(bundle) });
  }

  async deleteTemplate(templateId: string): Promise<void> {
    await invoke("delete_template", { templateId });
  }

  exportProject(projectId: string, suggestedName: string): Promise<ExportResult | null> {
    return invoke("export_project", { projectId, suggestedName });
  }

  exportWorkspace(): Promise<ExportResult | null> {
    return invoke("export_workspace");
  }

  chooseImportPackage(): Promise<ImportPackagePreview | null> {
    return invoke("choose_import_package");
  }

  applyImportPackage(packagePath: string, selection: ImportSelection): Promise<ImportResult> {
    return invoke("apply_import_package", { packagePath, selection });
  }

  createBackup(): Promise<BackupResult | null> {
    return invoke("create_backup");
  }

  openBackupFolder(): Promise<void> {
    return invoke("open_backup_folder");
  }

  chooseRestoreBackup(): Promise<ImportPackagePreview | null> {
    return invoke("choose_restore_backup");
  }

  restoreBackup(backupPath: string): Promise<RestoreResult> {
    return invoke("restore_backup", { backupPath });
  }
}
