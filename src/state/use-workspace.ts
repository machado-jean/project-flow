import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_CALENDAR_ID,
  validateCalendar,
  type Calendar,
} from "../domain/calendars/calendar";
import {
  endDateForDuration,
  onOrNextWorkingDay,
} from "../domain/calendars/working-calendar";
import {
  applyTaskTemplate,
  createTemplateFromTaskTree,
  duplicateProject as duplicateProjectStructure,
  duplicateTaskTree,
} from "../domain/duplication/reuse";
import { validateProject, type Project, type ProjectStatus } from "../domain/projects/project";
import {
  validateTaskDependency,
  type TaskDependency,
} from "../domain/scheduling/dependency";
import { validateGraph } from "../domain/scheduling/graph";
import {
  rescheduleAffectedTasks,
  type SchedulingConflict,
} from "../domain/scheduling/scheduler";
import {
  assertValidParentAssignment,
  collectTaskTreeIds,
} from "../domain/tasks/hierarchy";
import {
  validateTask,
  type SchedulingMode,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../domain/tasks/task";
import type {
  TaskTemplate,
  TaskTemplateBundle,
  TaskTemplateDependency,
  TaskTemplateItem,
} from "../domain/templates/template";
import type { WorkspaceRepository } from "../repositories/workspace-repository";

interface CreateProjectInput {
  readonly name: string;
  readonly description: string | null;
}

interface CreateTaskInput {
  readonly title: string;
  readonly parentId: string | null;
}

interface DependencyInput {
  readonly predecessorId: string;
  readonly successorId: string;
  readonly lagDays: number;
}

interface CreateTemplateInput {
  readonly rootTaskId: string;
  readonly name: string;
  readonly description: string | null;
}

export type MoveDirection = "up" | "down";

export interface WorkspaceController {
  readonly calendars: readonly Calendar[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
  readonly dependencies: readonly TaskDependency[];
  readonly templates: readonly TaskTemplate[];
  readonly templateItems: readonly TaskTemplateItem[];
  readonly templateDependencies: readonly TaskTemplateDependency[];
  readonly schedulingConflicts: readonly SchedulingConflict[];
  readonly selectedProjectId: string | null;
  readonly selectedProject: Project | null;
  readonly selectedProjectTasks: readonly Task[];
  readonly selectedProjectDependencies: readonly TaskDependency[];
  readonly isLoading: boolean;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly selectProject: (projectId: string) => void;
  readonly clearError: () => void;
  readonly reloadWorkspace: () => void;
  readonly createProject: (input: CreateProjectInput) => Promise<Project | null>;
  readonly saveProject: (project: Project) => Promise<boolean>;
  readonly moveProject: (projectId: string, direction: MoveDirection) => Promise<boolean>;
  readonly removeProject: (projectId: string) => Promise<boolean>;
  readonly saveCalendar: (calendar: Calendar) => Promise<boolean>;
  readonly createTask: (input: CreateTaskInput) => Promise<Task | null>;
  readonly saveTask: (
    task: Task,
    dependencyUpdates?: readonly TaskDependency[],
  ) => Promise<boolean>;
  readonly moveTask: (taskId: string, direction: MoveDirection) => Promise<boolean>;
  readonly removeTaskTree: (taskId: string) => Promise<boolean>;
  readonly createDependency: (input: DependencyInput) => Promise<TaskDependency | null>;
  readonly saveDependency: (dependency: TaskDependency) => Promise<boolean>;
  readonly removeDependency: (dependencyId: string) => Promise<boolean>;
  readonly duplicateTask: (taskId: string, includeDescendants: boolean) => Promise<Task | null>;
  readonly duplicateProject: (projectId: string) => Promise<Project | null>;
  readonly createTemplate: (input: CreateTemplateInput) => Promise<TaskTemplate | null>;
  readonly applyTemplate: (templateId: string, startDate: string) => Promise<Task | null>;
  readonly removeTemplate: (templateId: string) => Promise<boolean>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Ocorreu um erro inesperado.";
}

function nowUtc(): string {
  return new Date().toISOString();
}

function nextPosition(items: readonly { readonly position: number }[]): number {
  return items.reduce((highest, item) => Math.max(highest, item.position), -1) + 1;
}

function orderAfterMove(
  items: readonly { readonly id: string; readonly position: number; readonly createdAt: string }[],
  itemId: string,
  direction: MoveDirection,
): readonly string[] | null {
  const orderedIds = [...items]
    .sort(
      (left, right) =>
        left.position - right.position || left.createdAt.localeCompare(right.createdAt),
    )
    .map(({ id }) => id);
  const currentIndex = orderedIds.indexOf(itemId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedIds.length) return null;

  const currentId = orderedIds[currentIndex];
  const targetId = orderedIds[targetIndex];
  if (currentId === undefined || targetId === undefined) return null;
  orderedIds[currentIndex] = targetId;
  orderedIds[targetIndex] = currentId;
  return orderedIds;
}

function positionsById(orderedIds: readonly string[]): ReadonlyMap<string, number> {
  return new Map(orderedIds.map((id, position) => [id, position]));
}

function replaceTasks(
  currentTasks: readonly Task[],
  replacements: readonly Task[],
  removedIds: ReadonlySet<string> = new Set(),
): readonly Task[] {
  const replacementsById = new Map(replacements.map((task) => [task.id, task]));
  const existingIds = new Set(currentTasks.map(({ id }) => id));
  return [
    ...currentTasks
      .filter((task) => !removedIds.has(task.id))
      .map((task) => replacementsById.get(task.id) ?? task),
    ...replacements.filter((task) => !existingIds.has(task.id)),
  ];
}

function uniqueTasks(tasks: readonly Task[]): readonly Task[] {
  return [...new Map(tasks.map((task) => [task.id, task])).values()];
}

function stampedScheduledTasks(
  scheduledTasks: readonly Task[],
  taskIds: ReadonlySet<string>,
  updatedAt: string,
): readonly Task[] {
  return scheduledTasks.map((task) =>
    taskIds.has(task.id) ? validateTask({ ...task, updatedAt }) : task,
  );
}

function projectSchedulingConflicts(
  project: Project,
  projectTasks: readonly Task[],
  projectDependencies: readonly TaskDependency[],
  calendars: readonly Calendar[],
): readonly SchedulingConflict[] {
  return rescheduleAffectedTasks({
    tasks: projectTasks,
    dependencies: projectDependencies,
    calendars,
    projectCalendarId: project.calendarId,
    changedTaskIds: projectTasks.map(({ id }) => id),
  }).conflicts;
}

function workspaceSchedulingConflicts(
  projects: readonly Project[],
  tasks: readonly Task[],
  dependencies: readonly TaskDependency[],
  calendars: readonly Calendar[],
): readonly SchedulingConflict[] {
  return projects.flatMap((project) =>
    projectSchedulingConflicts(
      project,
      tasks.filter((task) => task.projectId === project.id),
      dependencies.filter((dependency) => dependency.projectId === project.id),
      calendars,
    ),
  );
}

function replaceProjectConflicts(
  current: readonly SchedulingConflict[],
  projectTaskIds: ReadonlySet<string>,
  next: readonly SchedulingConflict[],
): readonly SchedulingConflict[] {
  return [...current.filter((conflict) => !projectTaskIds.has(conflict.taskId)), ...next];
}

export function useWorkspace(repository: WorkspaceRepository): WorkspaceController {
  const [calendars, setCalendars] = useState<readonly Calendar[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [dependencies, setDependencies] = useState<readonly TaskDependency[]>([]);
  const [templates, setTemplates] = useState<readonly TaskTemplate[]>([]);
  const [templateItems, setTemplateItems] = useState<readonly TaskTemplateItem[]>([]);
  const [templateDependencies, setTemplateDependencies] = useState<readonly TaskTemplateDependency[]>([]);
  const [schedulingConflicts, setSchedulingConflicts] = useState<readonly SchedulingConflict[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let active = true;
    repository
      .load()
      .then(async (snapshot) => {
        if (!active) return;
        const updatedAt = nowUtc();
        let reconciledTasks = [...snapshot.tasks];
        const tasksToPersist: Task[] = [];
        const loadedConflicts: SchedulingConflict[] = [];
        for (const project of snapshot.projects) {
          const projectTasks = reconciledTasks.filter((task) => task.projectId === project.id);
          const projectDependencies = snapshot.dependencies.filter(
            (dependency) => dependency.projectId === project.id,
          );
          const scheduled = rescheduleAffectedTasks({
            tasks: projectTasks,
            dependencies: projectDependencies,
            calendars: snapshot.calendars,
            projectCalendarId: project.calendarId,
            changedTaskIds: projectTasks.map(({ id }) => id),
          });
          const stamped = stampedScheduledTasks(
            scheduled.tasks,
            scheduled.changedTaskIds,
            updatedAt,
          );
          tasksToPersist.push(
            ...stamped.filter((task) => scheduled.changedTaskIds.has(task.id)),
          );
          reconciledTasks = [...replaceTasks(reconciledTasks, stamped)];
          loadedConflicts.push(...scheduled.conflicts);
        }
        if (tasksToPersist.length > 0) {
          await repository.applyScheduleChanges({
            calendarsToSave: [],
            tasks: uniqueTasks(tasksToPersist),
            dependenciesToSave: [],
            dependencyIdsToDelete: [],
            taskTreeIdsToDelete: [],
          });
        }
        // A desmontagem pode ocorrer enquanto a transação assíncrona está em andamento.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!active) return;
        setCalendars(snapshot.calendars);
        setProjects(snapshot.projects);
        setTasks(reconciledTasks);
        setDependencies(snapshot.dependencies);
        setTemplates(snapshot.templates);
        setTemplateItems(snapshot.templateItems);
        setTemplateDependencies(snapshot.templateDependencies);
        setSchedulingConflicts(loadedConflicts);
        setSelectedProjectId((current) =>
          snapshot.projects.some((project) => project.id === current)
            ? current
            : snapshot.projects.find((project) => !project.isArchived)?.id ??
              snapshot.projects[0]?.id ??
              null,
        );
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository, reloadVersion]);

  const runMutation = useCallback(async <T,>(mutation: () => Promise<T>): Promise<T | null> => {
    setIsSaving(true);
    setError(null);
    try {
      return await mutation();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<Project | null> =>
      runMutation(async () => {
        const createdAt = nowUtc();
        const project = validateProject({
          id: crypto.randomUUID(),
          name: input.name,
          description: input.description,
          status: "ACTIVE",
          calendarId: calendars.find((calendar) => calendar.isDefault)?.id ?? DEFAULT_CALENDAR_ID,
          position: nextPosition(projects),
          isArchived: false,
          createdAt,
          updatedAt: createdAt,
        });
        await repository.saveProject(project);
        setProjects((currentProjects) => [...currentProjects, project]);
        setSelectedProjectId(project.id);
        return project;
      }),
    [calendars, projects, repository, runMutation],
  );

  const saveProject = useCallback(
    async (project: Project): Promise<boolean> => {
      const result = await runMutation(async () => {
        const validated = validateProject({ ...project, updatedAt: nowUtc() });
        await repository.saveProject(validated);
        setProjects((currentProjects) =>
          currentProjects.map((candidate) => (candidate.id === validated.id ? validated : candidate)),
        );
        return true;
      });
      return result ?? false;
    },
    [repository, runMutation],
  );

  const moveProject = useCallback(
    async (projectId: string, direction: MoveDirection): Promise<boolean> => {
      const project = projects.find((candidate) => candidate.id === projectId);
      if (project === undefined) {
        setError("O projeto selecionado não existe.");
        return false;
      }
      const projectIds = orderAfterMove(
        projects.filter((candidate) => candidate.isArchived === project.isArchived),
        projectId,
        direction,
      );
      if (projectIds === null) return false;
      const positions = positionsById(projectIds);
      const result = await runMutation(async () => {
        await repository.reorderProjects(projectIds);
        setProjects((currentProjects) =>
          currentProjects.map((candidate) => {
            const position = positions.get(candidate.id);
            return position === undefined ? candidate : { ...candidate, position };
          }),
        );
        return true;
      });
      return result ?? false;
    },
    [projects, repository, runMutation],
  );

  const removeProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      const result = await runMutation(async () => {
        await repository.deleteProject(projectId);
        const removedTaskIds = new Set(
          tasks.filter((task) => task.projectId === projectId).map(({ id }) => id),
        );
        setProjects((currentProjects) => {
          const remaining = currentProjects.filter((project) => project.id !== projectId);
          setSelectedProjectId((selection) =>
            selection === projectId ? (remaining[0]?.id ?? null) : selection,
          );
          return remaining;
        });
        setTasks((currentTasks) => currentTasks.filter((task) => task.projectId !== projectId));
        setDependencies((current) => current.filter((item) => item.projectId !== projectId));
        setSchedulingConflicts((current) =>
          current.filter((conflict) => !removedTaskIds.has(conflict.taskId)),
        );
        return true;
      });
      return result ?? false;
    },
    [repository, runMutation, tasks],
  );

  const saveCalendar = useCallback(
    async (calendar: Calendar): Promise<boolean> => {
      const result = await runMutation(async () => {
        const updatedAt = nowUtc();
        const validatedCalendar = validateCalendar({ ...calendar, updatedAt });
        const nextCalendars = calendars.map((candidate) =>
          candidate.id === validatedCalendar.id ? validatedCalendar : candidate,
        );
        let nextTasks = [...tasks];
        const allTasksToPersist: Task[] = [];

        for (const project of projects) {
          const projectTasks = nextTasks.filter((task) => task.projectId === project.id);
          const projectDependencies = dependencies.filter(
            (dependency) => dependency.projectId === project.id,
          );
          const directlyAffectedIds = new Set(
            projectTasks
              .filter(
                (task) =>
                  (task.calendarId ?? project.calendarId) === validatedCalendar.id &&
                  !projectTasks.some((candidate) => candidate.parentId === task.id),
              )
              .map(({ id }) => id),
          );
          if (directlyAffectedIds.size === 0) continue;
          const impactedIds = new Set(
            projectTasks
              .filter(
                (task) =>
                  directlyAffectedIds.has(task.id) &&
                  task.schedulingMode === "AUTO" &&
                  task.startDate !== null &&
                  task.durationDays !== null,
              )
              .map(({ id }) => id),
          );
          const recalculated = projectTasks.map((task) => {
            if (!impactedIds.has(task.id) || task.startDate === null || task.durationDays === null) {
              return task;
            }
            const startDate = onOrNextWorkingDay(validatedCalendar, task.startDate);
            return {
              ...task,
              startDate,
              endDate: endDateForDuration(validatedCalendar, startDate, task.durationDays),
            };
          });
          const scheduled = rescheduleAffectedTasks({
            tasks: recalculated,
            dependencies: projectDependencies,
            calendars: nextCalendars,
            projectCalendarId: project.calendarId,
            changedTaskIds: [...directlyAffectedIds],
          });
          const persistIds = new Set([...impactedIds, ...scheduled.changedTaskIds]);
          const stamped = stampedScheduledTasks(scheduled.tasks, persistIds, updatedAt);
          allTasksToPersist.push(...stamped.filter((task) => persistIds.has(task.id)));
          nextTasks = [...replaceTasks(nextTasks, stamped)];
        }

        await repository.applyScheduleChanges({
          calendarsToSave: [validatedCalendar],
          tasks: uniqueTasks(allTasksToPersist),
          dependenciesToSave: [],
          dependencyIdsToDelete: [],
          taskTreeIdsToDelete: [],
        });
        setCalendars(nextCalendars);
        setTasks(nextTasks);
        setSchedulingConflicts(
          workspaceSchedulingConflicts(projects, nextTasks, dependencies, nextCalendars),
        );
        return true;
      });
      return result ?? false;
    },
    [calendars, dependencies, projects, repository, runMutation, tasks],
  );

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<Task | null> => {
      if (selectedProjectId === null) {
        setError("Selecione um projeto antes de criar uma tarefa.");
        return null;
      }
      return runMutation(async () => {
        const project = projects.find((candidate) => candidate.id === selectedProjectId);
        if (project === undefined) throw new Error("O projeto selecionado não existe.");
        const projectTasks = tasks.filter((task) => task.projectId === selectedProjectId);
        const projectDependencies = dependencies.filter(
          (dependency) => dependency.projectId === selectedProjectId,
        );
        const siblings = projectTasks.filter((task) => task.parentId === input.parentId);
        const createdAt = nowUtc();
        const createdTask = validateTask({
          id: crypto.randomUUID(),
          code: null,
          projectId: selectedProjectId,
          parentId: input.parentId,
          calendarId: null,
          title: input.title,
          description: null,
          status: "NOT_STARTED",
          priority: "NORMAL",
          progress: 0,
          startDate: null,
          endDate: null,
          durationDays: null,
          schedulingMode: "AUTO",
          position: nextPosition(siblings),
          assignee: null,
          tags: [],
          notes: null,
          createdAt,
          updatedAt: createdAt,
        });
        assertValidParentAssignment(tasks, createdTask.id, createdTask.projectId, createdTask.parentId);
        const nextProjectTasks = [...projectTasks, createdTask];
        validateGraph(nextProjectTasks, projectDependencies);
        const scheduled = rescheduleAffectedTasks({
          tasks: nextProjectTasks,
          dependencies: projectDependencies,
          calendars,
          projectCalendarId: project.calendarId,
          changedTaskIds: [createdTask.id],
        });
        const persistIds = new Set([createdTask.id, ...scheduled.changedTaskIds]);
        const persistedTasks = stampedScheduledTasks(scheduled.tasks, persistIds, createdAt);
        await repository.applyScheduleChanges({
          calendarsToSave: [],
          tasks: persistedTasks.filter((task) => persistIds.has(task.id)),
          dependenciesToSave: [],
          dependencyIdsToDelete: [],
          taskTreeIdsToDelete: [],
        });
        setTasks((current) => replaceTasks(current, persistedTasks));
        setSchedulingConflicts((current) =>
          replaceProjectConflicts(
            current,
            new Set(persistedTasks.map(({ id }) => id)),
            projectSchedulingConflicts(project, persistedTasks, projectDependencies, calendars),
          ),
        );
        return persistedTasks.find((task) => task.id === createdTask.id) ?? createdTask;
      });
    },
    [calendars, dependencies, projects, repository, runMutation, selectedProjectId, tasks],
  );

  const saveTask = useCallback(
    async (
      task: Task,
      dependencyUpdates: readonly TaskDependency[] = [],
    ): Promise<boolean> => {
      const result = await runMutation(async () => {
        const project = projects.find((candidate) => candidate.id === task.projectId);
        if (project === undefined) throw new Error("O projeto da tarefa não existe.");
        if (!calendars.some((calendar) => calendar.id === (task.calendarId ?? project.calendarId))) {
          throw new Error("O calendário usado pela tarefa não existe.");
        }
        assertValidParentAssignment(tasks, task.id, task.projectId, task.parentId);
        const previous = tasks.find((candidate) => candidate.id === task.id);
        const movedToAnotherParent = previous !== undefined && previous.parentId !== task.parentId;
        const position = movedToAnotherParent
          ? nextPosition(
              tasks.filter(
                (candidate) =>
                  candidate.id !== task.id &&
                  candidate.projectId === task.projectId &&
                  candidate.parentId === task.parentId,
              ),
            )
          : task.position;
        const updatedAt = nowUtc();
        const validated = validateTask({ ...task, position, updatedAt });
        const projectTasks = tasks
          .filter((candidate) => candidate.projectId === task.projectId)
          .map((candidate) => (candidate.id === validated.id ? validated : candidate));
        const existingProjectDependencies = dependencies.filter(
          (dependency) => dependency.projectId === task.projectId,
        );
        const dependencyUpdateIds = new Set<string>();
        const validatedDependencyUpdates = dependencyUpdates.map((dependency) => {
          if (dependencyUpdateIds.has(dependency.id)) {
            throw new Error("A mesma dependência não pode ser alterada duas vezes.");
          }
          dependencyUpdateIds.add(dependency.id);
          const existing = existingProjectDependencies.find(
            (candidate) => candidate.id === dependency.id,
          );
          if (existing === undefined || existing.successorId !== validated.id) {
            throw new Error("A dependência alterada não pertence a esta tarefa.");
          }
          if (
            existing.projectId !== dependency.projectId ||
            existing.predecessorId !== dependency.predecessorId ||
            existing.successorId !== dependency.successorId
          ) {
            throw new Error("Nesta linha, somente o intervalo da dependência pode ser alterado.");
          }
          return validateTaskDependency({ ...dependency, updatedAt }, projectTasks);
        });
        const updatesById = new Map(
          validatedDependencyUpdates.map((dependency) => [dependency.id, dependency]),
        );
        const projectDependencies = existingProjectDependencies.map(
          (dependency) => updatesById.get(dependency.id) ?? dependency,
        );
        validateGraph(projectTasks, projectDependencies);
        const scheduled = rescheduleAffectedTasks({
          tasks: projectTasks,
          dependencies: projectDependencies,
          calendars,
          projectCalendarId: project.calendarId,
          changedTaskIds: [
            validated.id,
            ...validatedDependencyUpdates.map(({ successorId }) => successorId),
          ],
        });
        const persistIds = new Set([validated.id, ...scheduled.changedTaskIds]);
        const persistedTasks = stampedScheduledTasks(scheduled.tasks, persistIds, updatedAt);
        await repository.applyScheduleChanges({
          calendarsToSave: [],
          tasks: persistedTasks.filter((candidate) => persistIds.has(candidate.id)),
          dependenciesToSave: validatedDependencyUpdates,
          dependencyIdsToDelete: [],
          taskTreeIdsToDelete: [],
        });
        setTasks((current) => replaceTasks(current, persistedTasks));
        if (validatedDependencyUpdates.length > 0) {
          setDependencies((current) =>
            current.map((dependency) => updatesById.get(dependency.id) ?? dependency),
          );
        }
        setSchedulingConflicts((current) =>
          replaceProjectConflicts(
            current,
            new Set(persistedTasks.map(({ id }) => id)),
            projectSchedulingConflicts(project, persistedTasks, projectDependencies, calendars),
          ),
        );
        return true;
      });
      return result ?? false;
    },
    [calendars, dependencies, projects, repository, runMutation, tasks],
  );

  const moveTask = useCallback(
    async (taskId: string, direction: MoveDirection): Promise<boolean> => {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (task === undefined) {
        setError("A tarefa selecionada não existe.");
        return false;
      }
      const taskIds = orderAfterMove(
        tasks.filter(
          (candidate) =>
            candidate.projectId === task.projectId && candidate.parentId === task.parentId,
        ),
        taskId,
        direction,
      );
      if (taskIds === null) return false;
      const positions = positionsById(taskIds);
      const result = await runMutation(async () => {
        await repository.reorderTasks(taskIds);
        setTasks((currentTasks) =>
          currentTasks.map((candidate) => {
            const position = positions.get(candidate.id);
            return position === undefined ? candidate : { ...candidate, position };
          }),
        );
        return true;
      });
      return result ?? false;
    },
    [repository, runMutation, tasks],
  );

  const removeTaskTree = useCallback(
    async (taskId: string): Promise<boolean> => {
      const result = await runMutation(async () => {
        const root = tasks.find((task) => task.id === taskId);
        if (root === undefined) throw new Error("A tarefa selecionada não existe.");
        const project = projects.find((candidate) => candidate.id === root.projectId);
        if (project === undefined) throw new Error("O projeto da tarefa não existe.");
        const removedIds = collectTaskTreeIds(tasks, taskId);
        const remainingProjectTasks = tasks.filter(
          (task) => task.projectId === root.projectId && !removedIds.has(task.id),
        );
        const remainingDependencies = dependencies.filter(
          (dependency) =>
            dependency.projectId === root.projectId &&
            !removedIds.has(dependency.predecessorId) &&
            !removedIds.has(dependency.successorId),
        );
        const scheduled = rescheduleAffectedTasks({
          tasks: remainingProjectTasks,
          dependencies: remainingDependencies,
          calendars,
          projectCalendarId: project.calendarId,
          changedTaskIds: root.parentId === null ? [] : [root.parentId],
        });
        const updatedAt = nowUtc();
        const persistedTasks = stampedScheduledTasks(
          scheduled.tasks,
          scheduled.changedTaskIds,
          updatedAt,
        );
        await repository.applyScheduleChanges({
          calendarsToSave: [],
          tasks: persistedTasks.filter((task) => scheduled.changedTaskIds.has(task.id)),
          dependenciesToSave: [],
          dependencyIdsToDelete: [],
          taskTreeIdsToDelete: [taskId],
        });
        setTasks((current) => replaceTasks(current, persistedTasks, removedIds));
        setDependencies((current) =>
          current.filter(
            (dependency) =>
              !removedIds.has(dependency.predecessorId) &&
              !removedIds.has(dependency.successorId),
          ),
        );
        setSchedulingConflicts((current) =>
          replaceProjectConflicts(
            current,
            new Set(
              tasks.filter((task) => task.projectId === root.projectId).map(({ id }) => id),
            ),
            projectSchedulingConflicts(project, persistedTasks, remainingDependencies, calendars),
          ),
        );
        return true;
      });
      return result ?? false;
    },
    [calendars, dependencies, projects, repository, runMutation, tasks],
  );

  const persistDependency = useCallback(
    async (
      dependency: TaskDependency,
      nextDependencies: readonly TaskDependency[],
    ): Promise<boolean> => {
      const project = projects.find((candidate) => candidate.id === dependency.projectId);
      if (project === undefined) throw new Error("O projeto da dependência não existe.");
      const projectTasks = tasks.filter((task) => task.projectId === dependency.projectId);
      const projectDependencies = nextDependencies.filter(
        (candidate) => candidate.projectId === dependency.projectId,
      );
      validateGraph(projectTasks, projectDependencies);
      const scheduled = rescheduleAffectedTasks({
        tasks: projectTasks,
        dependencies: projectDependencies,
        calendars,
        projectCalendarId: project.calendarId,
        changedTaskIds: [dependency.successorId],
      });
      const updatedAt = nowUtc();
      const persistedTasks = stampedScheduledTasks(
        scheduled.tasks,
        scheduled.changedTaskIds,
        updatedAt,
      );
      await repository.applyScheduleChanges({
        calendarsToSave: [],
        tasks: persistedTasks.filter((task) => scheduled.changedTaskIds.has(task.id)),
        dependenciesToSave: [{ ...dependency, updatedAt }],
        dependencyIdsToDelete: [],
        taskTreeIdsToDelete: [],
      });
      setTasks((current) => replaceTasks(current, persistedTasks));
      setDependencies(nextDependencies.map((item) => (item.id === dependency.id ? { ...dependency, updatedAt } : item)));
      setSchedulingConflicts((current) =>
        replaceProjectConflicts(
          current,
          new Set(persistedTasks.map(({ id }) => id)),
          projectSchedulingConflicts(project, persistedTasks, projectDependencies, calendars),
        ),
      );
      return true;
    },
    [calendars, projects, repository, tasks],
  );

  const createDependency = useCallback(
    async (input: DependencyInput): Promise<TaskDependency | null> =>
      runMutation(async () => {
        const successor = tasks.find((task) => task.id === input.successorId);
        if (successor === undefined) throw new Error("A tarefa sucessora não existe.");
        const createdAt = nowUtc();
        const dependency = validateTaskDependency(
          {
            id: crypto.randomUUID(),
            projectId: successor.projectId,
            predecessorId: input.predecessorId,
            successorId: input.successorId,
            type: "FS",
            lagDays: input.lagDays,
            createdAt,
            updatedAt: createdAt,
          },
          tasks,
        );
        const nextDependencies = [...dependencies, dependency];
        await persistDependency(dependency, nextDependencies);
        return dependency;
      }),
    [dependencies, persistDependency, runMutation, tasks],
  );

  const saveDependency = useCallback(
    async (dependency: TaskDependency): Promise<boolean> => {
      const result = await runMutation(async () => {
        const validated = validateTaskDependency(dependency, tasks);
        const nextDependencies = dependencies.map((candidate) =>
          candidate.id === validated.id ? validated : candidate,
        );
        return persistDependency(validated, nextDependencies);
      });
      return result ?? false;
    },
    [dependencies, persistDependency, runMutation, tasks],
  );

  const removeDependency = useCallback(
    async (dependencyId: string): Promise<boolean> => {
      const result = await runMutation(async () => {
        const removed = dependencies.find((dependency) => dependency.id === dependencyId);
        if (removed === undefined) throw new Error("A dependência selecionada não existe.");
        const project = projects.find((candidate) => candidate.id === removed.projectId);
        if (project === undefined) throw new Error("O projeto da dependência não existe.");
        const nextDependencies = dependencies.filter((dependency) => dependency.id !== dependencyId);
        const projectTasks = tasks.filter((task) => task.projectId === removed.projectId);
        const scheduled = rescheduleAffectedTasks({
          tasks: projectTasks,
          dependencies: nextDependencies.filter(
            (dependency) => dependency.projectId === removed.projectId,
          ),
          calendars,
          projectCalendarId: project.calendarId,
          changedTaskIds: [removed.successorId],
        });
        const updatedAt = nowUtc();
        const persistedTasks = stampedScheduledTasks(
          scheduled.tasks,
          scheduled.changedTaskIds,
          updatedAt,
        );
        await repository.applyScheduleChanges({
          calendarsToSave: [],
          tasks: persistedTasks.filter((task) => scheduled.changedTaskIds.has(task.id)),
          dependenciesToSave: [],
          dependencyIdsToDelete: [dependencyId],
          taskTreeIdsToDelete: [],
        });
        setTasks((current) => replaceTasks(current, persistedTasks));
        setDependencies(nextDependencies);
        setSchedulingConflicts((current) =>
          replaceProjectConflicts(
            current,
            new Set(persistedTasks.map(({ id }) => id)),
            projectSchedulingConflicts(
              project,
              persistedTasks,
              nextDependencies.filter((dependency) => dependency.projectId === removed.projectId),
              calendars,
            ),
          ),
        );
        return true;
      });
      return result ?? false;
    },
    [calendars, dependencies, projects, repository, runMutation, tasks],
  );

  const duplicateTask = useCallback(
    async (taskId: string, includeDescendants: boolean): Promise<Task | null> =>
      runMutation(async () => {
        const source = tasks.find((task) => task.id === taskId);
        if (source === undefined) throw new Error("A tarefa selecionada não existe.");
        const project = projects.find((candidate) => candidate.id === source.projectId);
        if (project === undefined) throw new Error("O projeto da tarefa não existe.");
        const projectTasks = tasks.filter((task) => task.projectId === source.projectId);
        const projectDependencies = dependencies.filter(
          (dependency) => dependency.projectId === source.projectId,
        );
        const rootPosition = nextPosition(
          projectTasks.filter((task) => task.parentId === source.parentId),
        );
        const timestamp = nowUtc();
        const duplicated = duplicateTaskTree({
          tasks: projectTasks,
          dependencies: projectDependencies,
          rootTaskId: taskId,
          includeDescendants,
          rootPosition,
          idFactory: () => crypto.randomUUID(),
          timestamp,
        });
        const nextDependencies = [...projectDependencies, ...duplicated.dependencies];
        const nextProjectTasks = [...projectTasks, ...duplicated.tasks];
        validateGraph(nextProjectTasks, nextDependencies);
        const scheduled = rescheduleAffectedTasks({
          tasks: nextProjectTasks,
          dependencies: nextDependencies,
          calendars,
          projectCalendarId: project.calendarId,
          changedTaskIds: duplicated.tasks.map((task) => task.id),
        });
        const persistIds = new Set([
          ...duplicated.tasks.map((task) => task.id),
          ...scheduled.changedTaskIds,
        ]);
        const persistedProjectTasks = stampedScheduledTasks(
          scheduled.tasks,
          persistIds,
          timestamp,
        );
        await repository.saveDuplicationBundle({
          project: null,
          tasks: persistedProjectTasks.filter((task) => persistIds.has(task.id)),
          dependencies: duplicated.dependencies,
        });
        setTasks((current) => replaceTasks(current, persistedProjectTasks));
        setDependencies((current) => [...current, ...duplicated.dependencies]);
        setSchedulingConflicts((current) =>
          replaceProjectConflicts(
            current,
            new Set(persistedProjectTasks.map(({ id }) => id)),
            projectSchedulingConflicts(project, persistedProjectTasks, nextDependencies, calendars),
          ),
        );
        const copiedRootId = duplicated.sourceToCopyId.get(taskId);
        return persistedProjectTasks.find((task) => task.id === copiedRootId) ?? null;
      }),
    [calendars, dependencies, projects, repository, runMutation, tasks],
  );

  const duplicateProject = useCallback(
    async (projectId: string): Promise<Project | null> =>
      runMutation(async () => {
        const source = projects.find((project) => project.id === projectId);
        if (source === undefined) throw new Error("O projeto selecionado não existe.");
        const timestamp = nowUtc();
        const duplicated = duplicateProjectStructure({
          project: source,
          tasks,
          dependencies,
          position: nextPosition(projects.filter((project) => !project.isArchived)),
          idFactory: () => crypto.randomUUID(),
          timestamp,
        });
        await repository.saveDuplicationBundle({
          project: duplicated.project,
          tasks: duplicated.tasks,
          dependencies: duplicated.dependencies,
        });
        setProjects((current) => [...current, duplicated.project]);
        setTasks((current) => [...current, ...duplicated.tasks]);
        setDependencies((current) => [...current, ...duplicated.dependencies]);
        setSelectedProjectId(duplicated.project.id);
        return duplicated.project;
      }),
    [dependencies, projects, repository, runMutation, tasks],
  );

  const createTemplate = useCallback(
    async (input: CreateTemplateInput): Promise<TaskTemplate | null> =>
      runMutation(async () => {
        const timestamp = nowUtc();
        const bundle = createTemplateFromTaskTree({
          ...input,
          tasks,
          dependencies,
          idFactory: () => crypto.randomUUID(),
          timestamp,
        });
        await repository.saveTemplateBundle(bundle);
        setTemplates((current) => [...current, bundle.template]);
        setTemplateItems((current) => [...current, ...bundle.items]);
        setTemplateDependencies((current) => [...current, ...bundle.dependencies]);
        return bundle.template;
      }),
    [dependencies, repository, runMutation, tasks],
  );

  const applyTemplate = useCallback(
    async (templateId: string, startDate: string): Promise<Task | null> => {
      if (selectedProjectId === null) {
        setError("Selecione um projeto antes de aplicar um template.");
        return null;
      }
      return runMutation(async () => {
        const template = templates.find((candidate) => candidate.id === templateId);
        const project = projects.find((candidate) => candidate.id === selectedProjectId);
        if (template === undefined) throw new Error("O template selecionado não existe.");
        if (project === undefined) throw new Error("O projeto de destino não existe.");
        const bundle: TaskTemplateBundle = {
          template,
          items: templateItems.filter((item) => item.templateId === templateId),
          dependencies: templateDependencies.filter(
            (dependency) => dependency.templateId === templateId,
          ),
        };
        const timestamp = nowUtc();
        const applied = applyTaskTemplate({
          bundle,
          targetProject: project,
          calendars,
          startDate,
          rootPosition: nextPosition(
            tasks.filter(
              (task) => task.projectId === selectedProjectId && task.parentId === null,
            ),
          ),
          idFactory: () => crypto.randomUUID(),
          timestamp,
        });
        await repository.saveDuplicationBundle({
          project: null,
          tasks: applied.tasks,
          dependencies: applied.dependencies,
        });
        setTasks((current) => [...current, ...applied.tasks]);
        setDependencies((current) => [...current, ...applied.dependencies]);
        setSchedulingConflicts((current) => [
          ...current,
          ...projectSchedulingConflicts(project, applied.tasks, applied.dependencies, calendars),
        ]);
        const root = applied.tasks.find((task) => task.parentId === null);
        return root ?? null;
      });
    },
    [
      calendars,
      projects,
      repository,
      runMutation,
      selectedProjectId,
      tasks,
      templateDependencies,
      templateItems,
      templates,
    ],
  );

  const removeTemplate = useCallback(
    async (templateId: string): Promise<boolean> => {
      const result = await runMutation(async () => {
        if (!templates.some((template) => template.id === templateId)) {
          throw new Error("O template selecionado não existe.");
        }
        await repository.deleteTemplate(templateId);
        setTemplates((current) => current.filter((template) => template.id !== templateId));
        setTemplateItems((current) => current.filter((item) => item.templateId !== templateId));
        setTemplateDependencies((current) =>
          current.filter((dependency) => dependency.templateId !== templateId),
        );
        return true;
      });
      return result ?? false;
    },
    [repository, runMutation, templates],
  );

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedProjectTasks = useMemo(
    () => tasks.filter((task) => task.projectId === selectedProjectId),
    [selectedProjectId, tasks],
  );
  const selectedProjectDependencies = useMemo(
    () => dependencies.filter((dependency) => dependency.projectId === selectedProjectId),
    [dependencies, selectedProjectId],
  );

  return {
    calendars,
    projects,
    tasks,
    dependencies,
    templates,
    templateItems,
    templateDependencies,
    schedulingConflicts,
    selectedProjectId,
    selectedProject,
    selectedProjectTasks,
    selectedProjectDependencies,
    isLoading,
    isSaving,
    error,
    selectProject: setSelectedProjectId,
    clearError: () => { setError(null); },
    reloadWorkspace: () => {
      setReloadVersion((current) => current + 1);
    },
    createProject,
    saveProject,
    moveProject,
    removeProject,
    saveCalendar,
    createTask,
    saveTask,
    moveTask,
    removeTaskTree,
    createDependency,
    saveDependency,
    removeDependency,
    duplicateTask,
    duplicateProject,
    createTemplate,
    applyTemplate,
    removeTemplate,
  };
}

export type { ProjectStatus, SchedulingMode, TaskPriority, TaskStatus };
