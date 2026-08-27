import { useCallback, useEffect, useMemo, useState } from "react";

import { DEFAULT_CALENDAR_ID, type Calendar } from "../domain/calendars/calendar";
import { validateProject, type Project, type ProjectStatus } from "../domain/projects/project";
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
import type { WorkspaceRepository } from "../repositories/workspace-repository";

interface CreateProjectInput {
  readonly name: string;
  readonly description: string | null;
}

interface CreateTaskInput {
  readonly title: string;
  readonly parentId: string | null;
}

export type MoveDirection = "up" | "down";

export interface WorkspaceController {
  readonly calendars: readonly Calendar[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
  readonly selectedProjectId: string | null;
  readonly selectedProject: Project | null;
  readonly selectedProjectTasks: readonly Task[];
  readonly isLoading: boolean;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly selectProject: (projectId: string) => void;
  readonly clearError: () => void;
  readonly createProject: (input: CreateProjectInput) => Promise<Project | null>;
  readonly saveProject: (project: Project) => Promise<boolean>;
  readonly moveProject: (projectId: string, direction: MoveDirection) => Promise<boolean>;
  readonly removeProject: (projectId: string) => Promise<boolean>;
  readonly createTask: (input: CreateTaskInput) => Promise<Task | null>;
  readonly saveTask: (task: Task) => Promise<boolean>;
  readonly moveTask: (taskId: string, direction: MoveDirection) => Promise<boolean>;
  readonly removeTaskTree: (taskId: string) => Promise<boolean>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
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

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedIds.length) {
    return null;
  }

  const currentId = orderedIds[currentIndex];
  const targetId = orderedIds[targetIndex];
  if (currentId === undefined || targetId === undefined) {
    return null;
  }
  orderedIds[currentIndex] = targetId;
  orderedIds[targetIndex] = currentId;
  return orderedIds;
}

function positionsById(orderedIds: readonly string[]): ReadonlyMap<string, number> {
  return new Map(orderedIds.map((id, position) => [id, position]));
}

export function useWorkspace(repository: WorkspaceRepository): WorkspaceController {
  const [calendars, setCalendars] = useState<readonly Calendar[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    repository
      .load()
      .then((snapshot) => {
        if (!active) {
          return;
        }
        setCalendars(snapshot.calendars);
        setProjects(snapshot.projects);
        setTasks(snapshot.tasks);
        setSelectedProjectId(
          snapshot.projects.find((project) => !project.isArchived)?.id ??
            snapshot.projects[0]?.id ??
            null,
        );
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(errorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [repository]);

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
    async (input: CreateProjectInput): Promise<Project | null> => {
      return runMutation(async () => {
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
      });
    },
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

  const removeProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      const result = await runMutation(async () => {
        await repository.deleteProject(projectId);
        setProjects((currentProjects) => {
          const remaining = currentProjects.filter((project) => project.id !== projectId);
          setSelectedProjectId((currentSelection) =>
            currentSelection === projectId ? (remaining[0]?.id ?? null) : currentSelection,
          );
          return remaining;
        });
        setTasks((currentTasks) => currentTasks.filter((task) => task.projectId !== projectId));
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
      if (projectIds === null) {
        return false;
      }

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

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<Task | null> => {
      if (selectedProjectId === null) {
        setError("Selecione um projeto antes de criar uma tarefa.");
        return null;
      }
      return runMutation(async () => {
        const projectTasks = tasks.filter((task) => task.projectId === selectedProjectId);
        const siblings = projectTasks.filter((task) => task.parentId === input.parentId);
        const createdAt = nowUtc();
        const task = validateTask({
          id: crypto.randomUUID(),
          code: null,
          projectId: selectedProjectId,
          parentId: input.parentId,
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
        assertValidParentAssignment(tasks, task.id, task.projectId, task.parentId);
        await repository.saveTask(task);
        setTasks((currentTasks) => [...currentTasks, task]);
        return task;
      });
    },
    [repository, runMutation, selectedProjectId, tasks],
  );

  const saveTask = useCallback(
    async (task: Task): Promise<boolean> => {
      const result = await runMutation(async () => {
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
        const validated = validateTask({ ...task, position, updatedAt: nowUtc() });
        await repository.saveTask(validated);
        setTasks((currentTasks) =>
          currentTasks.map((candidate) => (candidate.id === validated.id ? validated : candidate)),
        );
        return true;
      });
      return result ?? false;
    },
    [repository, runMutation, tasks],
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
      if (taskIds === null) {
        return false;
      }

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
        await repository.deleteTaskTree(taskId);
        setTasks((currentTasks) => {
          const removedIds = collectTaskTreeIds(currentTasks, taskId);
          return currentTasks.filter((task) => !removedIds.has(task.id));
        });
        return true;
      });
      return result ?? false;
    },
    [repository, runMutation],
  );

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedProjectTasks = useMemo(
    () => tasks.filter((task) => task.projectId === selectedProjectId),
    [selectedProjectId, tasks],
  );

  return {
    calendars,
    projects,
    tasks,
    selectedProjectId,
    selectedProject,
    selectedProjectTasks,
    isLoading,
    isSaving,
    error,
    selectProject: setSelectedProjectId,
    clearError: () => {
      setError(null);
    },
    createProject,
    saveProject,
    moveProject,
    removeProject,
    createTask,
    saveTask,
    moveTask,
    removeTaskTree,
  };
}

export type { ProjectStatus, SchedulingMode, TaskPriority, TaskStatus };
