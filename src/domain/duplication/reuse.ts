import type { Calendar } from "../calendars/calendar";
import { onOrNextWorkingDay, endDateForDuration } from "../calendars/working-calendar";
import { validateProject, type Project } from "../projects/project";
import { validateGraph } from "../scheduling/graph";
import { rescheduleAffectedTasks } from "../scheduling/scheduler";
import { DomainValidationError, requireDateOnly } from "../shared/validation";
import { collectTaskTreeIds } from "../tasks/hierarchy";
import { validateTask, type Task } from "../tasks/task";
import {
  validateTaskTemplateBundle,
  type TaskTemplate,
  type TaskTemplateBundle,
  type TaskTemplateDependency,
  type TaskTemplateItem,
} from "../templates/template";
import type { TaskDependency } from "../scheduling/dependency";

export interface DuplicatedTasks {
  readonly tasks: readonly Task[];
  readonly dependencies: readonly TaskDependency[];
  readonly sourceToCopyId: ReadonlyMap<string, string>;
}

export interface DuplicatedProject extends DuplicatedTasks {
  readonly project: Project;
}

interface TaskDuplicationInput {
  readonly tasks: readonly Task[];
  readonly dependencies: readonly TaskDependency[];
  readonly rootTaskId: string;
  readonly includeDescendants: boolean;
  readonly rootPosition: number;
  readonly idFactory: () => string;
  readonly timestamp: string;
}

function copyTasks(
  sourceTasks: readonly Task[],
  targetProjectId: string,
  rootParentId: string | null,
  rootPosition: number,
  idFactory: () => string,
  timestamp: string,
): { readonly tasks: readonly Task[]; readonly idMap: ReadonlyMap<string, string> } {
  const selectedIds = new Set(sourceTasks.map((task) => task.id));
  const idMap = new Map(sourceTasks.map((task) => [task.id, idFactory()]));
  const root = sourceTasks.find((task) => !selectedIds.has(task.parentId ?? ""));
  if (root === undefined) {
    throw new DomainValidationError(
      "duplication_root_not_found",
      "rootTaskId",
      "Não foi possível determinar a raiz da cópia.",
    );
  }

  const tasks = sourceTasks.map((task) =>
    validateTask({
      ...task,
      id: idMap.get(task.id) as string,
      projectId: targetProjectId,
      parentId:
        task.id === root.id
          ? rootParentId
          : task.parentId === null
            ? null
            : (idMap.get(task.parentId) ?? null),
      position: task.id === root.id ? rootPosition : task.position,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  return { tasks, idMap };
}

function copyInternalDependencies(
  sourceDependencies: readonly TaskDependency[],
  sourceIds: ReadonlySet<string>,
  idMap: ReadonlyMap<string, string>,
  targetProjectId: string,
  idFactory: () => string,
  timestamp: string,
): readonly TaskDependency[] {
  return sourceDependencies.flatMap((dependency) => {
    if (!sourceIds.has(dependency.predecessorId) || !sourceIds.has(dependency.successorId)) {
      return [];
    }
    return [{
      ...dependency,
      id: idFactory(),
      projectId: targetProjectId,
      predecessorId: idMap.get(dependency.predecessorId) as string,
      successorId: idMap.get(dependency.successorId) as string,
      createdAt: timestamp,
      updatedAt: timestamp,
    }];
  });
}

export function duplicateTaskTree(input: TaskDuplicationInput): DuplicatedTasks {
  const root = input.tasks.find((task) => task.id === input.rootTaskId);
  if (root === undefined) {
    throw new DomainValidationError(
      "duplication_task_not_found",
      "rootTaskId",
      "A tarefa selecionada para duplicação não existe.",
    );
  }
  const selectedIds = input.includeDescendants
    ? collectTaskTreeIds(input.tasks, root.id)
    : new Set([root.id]);
  const sourceTasks = input.tasks.filter((task) => selectedIds.has(task.id));
  const copied = copyTasks(
    sourceTasks,
    root.projectId,
    root.parentId,
    input.rootPosition,
    input.idFactory,
    input.timestamp,
  );
  const dependencies = copyInternalDependencies(
    input.dependencies,
    selectedIds,
    copied.idMap,
    root.projectId,
    input.idFactory,
    input.timestamp,
  );
  validateGraph(copied.tasks, dependencies);
  return { tasks: copied.tasks, dependencies, sourceToCopyId: copied.idMap };
}

interface ProjectDuplicationInput {
  readonly project: Project;
  readonly tasks: readonly Task[];
  readonly dependencies: readonly TaskDependency[];
  readonly position: number;
  readonly idFactory: () => string;
  readonly timestamp: string;
}

export function duplicateProject(input: ProjectDuplicationInput): DuplicatedProject {
  const projectId = input.idFactory();
  const project = validateProject({
    ...input.project,
    id: projectId,
    name: `${input.project.name} — cópia`,
    position: input.position,
    isArchived: false,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  });
  const sourceTasks = input.tasks.filter((task) => task.projectId === input.project.id);
  const sourceIds = new Set(sourceTasks.map((task) => task.id));
  const roots = sourceTasks.filter((task) => task.parentId === null);
  const idMap = new Map(sourceTasks.map((task) => [task.id, input.idFactory()]));
  const tasks = sourceTasks.map((task) =>
    validateTask({
      ...task,
      id: idMap.get(task.id) as string,
      projectId,
      parentId: task.parentId === null ? null : (idMap.get(task.parentId) ?? null),
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    }),
  );
  if (sourceTasks.length > 0 && roots.length === 0) {
    throw new DomainValidationError(
      "project_duplication_root_not_found",
      "parentId",
      "A hierarquia do projeto não possui uma tarefa-raiz válida.",
    );
  }
  const dependencies = copyInternalDependencies(
    input.dependencies.filter((dependency) => dependency.projectId === input.project.id),
    sourceIds,
    idMap,
    projectId,
    input.idFactory,
    input.timestamp,
  );
  validateGraph(tasks, dependencies);
  return { project, tasks, dependencies, sourceToCopyId: idMap };
}

interface CreateTemplateInput {
  readonly name: string;
  readonly description: string | null;
  readonly rootTaskId: string;
  readonly tasks: readonly Task[];
  readonly dependencies: readonly TaskDependency[];
  readonly idFactory: () => string;
  readonly timestamp: string;
}

export function createTemplateFromTaskTree(input: CreateTemplateInput): TaskTemplateBundle {
  const root = input.tasks.find((task) => task.id === input.rootTaskId);
  if (root === undefined) {
    throw new DomainValidationError(
      "template_source_not_found",
      "rootTaskId",
      "A tarefa usada para criar o template não existe.",
    );
  }
  const sourceIds = collectTaskTreeIds(input.tasks, root.id);
  const sourceTasks = input.tasks.filter((task) => sourceIds.has(task.id));
  const templateId = input.idFactory();
  const itemIdMap = new Map(sourceTasks.map((task) => [task.id, input.idFactory()]));
  const summaryIds = new Set(sourceTasks.flatMap((task) => task.parentId === null ? [] : [task.parentId]));
  const template: TaskTemplate = {
    id: templateId,
    name: input.name,
    description: input.description,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
  const items: TaskTemplateItem[] = sourceTasks.map((task) => ({
    id: itemIdMap.get(task.id) as string,
    templateId,
    parentId: task.id === root.id ? null : task.parentId === null ? null : (itemIdMap.get(task.parentId) ?? null),
    title: task.title,
    description: task.description,
    durationDays: summaryIds.has(task.id) ? null : task.durationDays,
    priority: task.priority,
    initialStatus: task.status,
    position: task.id === root.id ? 0 : task.position,
    tags: task.tags,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  }));
  const dependencies: TaskTemplateDependency[] = input.dependencies.flatMap((dependency) => {
    if (!sourceIds.has(dependency.predecessorId) || !sourceIds.has(dependency.successorId)) return [];
    return [{
      id: input.idFactory(),
      templateId,
      predecessorId: itemIdMap.get(dependency.predecessorId) as string,
      successorId: itemIdMap.get(dependency.successorId) as string,
      type: "FS",
      lagDays: dependency.lagDays,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    }];
  });
  return validateTaskTemplateBundle({ template, items, dependencies });
}

interface ApplyTemplateInput {
  readonly bundle: TaskTemplateBundle;
  readonly targetProject: Project;
  readonly calendars: readonly Calendar[];
  readonly startDate: string;
  readonly rootPosition: number;
  readonly idFactory: () => string;
  readonly timestamp: string;
}

export function applyTaskTemplate(input: ApplyTemplateInput): DuplicatedTasks {
  const bundle = validateTaskTemplateBundle(input.bundle);
  const startDate = requireDateOnly(input.startDate, "startDate", "A data inicial");
  const calendar = input.calendars.find(
    (candidate) => candidate.id === input.targetProject.calendarId,
  );
  if (calendar === undefined) {
    throw new DomainValidationError(
      "template_calendar_not_found",
      "calendarId",
      "O calendário do projeto de destino não existe.",
    );
  }
  const anchor = onOrNextWorkingDay(calendar, startDate);
  const itemIds = new Set(bundle.items.map((item) => item.id));
  const summaryIds = new Set(bundle.items.flatMap((item) => item.parentId === null ? [] : [item.parentId]));
  const idMap = new Map(bundle.items.map((item) => [item.id, input.idFactory()]));
  const root = bundle.items.find((item) => item.parentId === null) as TaskTemplateItem;
  const tasks = bundle.items.map((item) => {
    const durationDays = summaryIds.has(item.id) ? null : item.durationDays;
    return validateTask({
      id: idMap.get(item.id) as string,
      code: null,
      projectId: input.targetProject.id,
      parentId: item.id === root.id ? null : item.parentId === null ? null : (idMap.get(item.parentId) ?? null),
      calendarId: null,
      title: item.title,
      description: item.description,
      status: item.initialStatus,
      priority: item.priority,
      progress: 0,
      startDate: durationDays === null ? null : anchor,
      endDate: durationDays === null ? null : endDateForDuration(calendar, anchor, durationDays),
      durationDays,
      schedulingMode: "AUTO",
      position: item.id === root.id ? input.rootPosition : item.position,
      assignee: null,
      tags: item.tags,
      notes: null,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    });
  });
  const dependencies: TaskDependency[] = bundle.dependencies.map((dependency) => ({
    id: input.idFactory(),
    projectId: input.targetProject.id,
    predecessorId: idMap.get(dependency.predecessorId) as string,
    successorId: idMap.get(dependency.successorId) as string,
    type: "FS",
    lagDays: dependency.lagDays,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  }));
  if (itemIds.size !== bundle.items.length) {
    throw new DomainValidationError(
      "duplicate_template_item",
      "items",
      "O template contém itens duplicados.",
    );
  }
  validateGraph(tasks, dependencies);
  const scheduled = rescheduleAffectedTasks({
    tasks,
    dependencies,
    calendars: input.calendars,
    projectCalendarId: input.targetProject.calendarId,
    changedTaskIds: tasks.map((task) => task.id),
  });
  return {
    tasks: scheduled.tasks.map((task) => validateTask({ ...task, updatedAt: input.timestamp })),
    dependencies,
    sourceToCopyId: idMap,
  };
}
