import {
  DomainValidationError,
  optionalText,
  requireIsoTimestamp,
  requireNonNegativeInteger,
  requireText,
  requireUuid,
} from "../shared/validation";
import {
  isTaskPriority,
  isTaskStatus,
  normalizeTags,
  type TaskPriority,
  type TaskStatus,
} from "../tasks/task";

export interface TaskTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskTemplateItem {
  readonly id: string;
  readonly templateId: string;
  readonly parentId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly durationDays: number | null;
  readonly priority: TaskPriority;
  readonly initialStatus: TaskStatus;
  readonly position: number;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskTemplateDependency {
  readonly id: string;
  readonly templateId: string;
  readonly predecessorId: string;
  readonly successorId: string;
  readonly type: "FS";
  readonly lagDays: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskTemplateBundle {
  readonly template: TaskTemplate;
  readonly items: readonly TaskTemplateItem[];
  readonly dependencies: readonly TaskTemplateDependency[];
}

export function validateTaskTemplate(template: TaskTemplate): TaskTemplate {
  return {
    ...template,
    id: requireUuid(template.id, "id", "O template"),
    name: requireText(template.name, "name", "O nome do template"),
    description: optionalText(template.description),
    createdAt: requireIsoTimestamp(template.createdAt, "createdAt"),
    updatedAt: requireIsoTimestamp(template.updatedAt, "updatedAt"),
  };
}

export function validateTaskTemplateItem(item: TaskTemplateItem): TaskTemplateItem {
  if (!isTaskPriority(item.priority)) {
    throw new DomainValidationError(
      "invalid_template_priority",
      "priority",
      "A prioridade do item de template não é válida.",
    );
  }
  if (!isTaskStatus(item.initialStatus)) {
    throw new DomainValidationError(
      "invalid_template_status",
      "initialStatus",
      "O status inicial do item de template não é válido.",
    );
  }
  if (item.durationDays !== null && (!Number.isInteger(item.durationDays) || item.durationDays < 1)) {
    throw new DomainValidationError(
      "invalid_template_duration",
      "durationDays",
      "A duração do item de template deve ser um inteiro maior ou igual a um.",
    );
  }

  return {
    ...item,
    id: requireUuid(item.id, "id", "O item de template"),
    templateId: requireUuid(item.templateId, "templateId", "O template"),
    parentId:
      item.parentId === null
        ? null
        : requireUuid(item.parentId, "parentId", "O item-pai do template"),
    title: requireText(item.title, "title", "O título do item de template"),
    description: optionalText(item.description),
    position: requireNonNegativeInteger(item.position, "position", "A posição do item"),
    tags: normalizeTags(item.tags),
    createdAt: requireIsoTimestamp(item.createdAt, "createdAt"),
    updatedAt: requireIsoTimestamp(item.updatedAt, "updatedAt"),
  };
}

export function validateTaskTemplateDependency(
  dependency: TaskTemplateDependency,
): TaskTemplateDependency {
  const dependencyType: unknown = dependency.type;
  if (dependencyType !== "FS") {
    throw new DomainValidationError(
      "unsupported_template_dependency",
      "type",
      "Templates aceitam somente dependências Término para Início (TI).",
    );
  }
  const validated = {
    ...dependency,
    id: requireUuid(dependency.id, "id", "A dependência do template"),
    templateId: requireUuid(dependency.templateId, "templateId", "O template"),
    predecessorId: requireUuid(
      dependency.predecessorId,
      "predecessorId",
      "O item predecessor",
    ),
    successorId: requireUuid(dependency.successorId, "successorId", "O item sucessor"),
    lagDays: requireNonNegativeInteger(dependency.lagDays, "lagDays", "O intervalo"),
    createdAt: requireIsoTimestamp(dependency.createdAt, "createdAt"),
    updatedAt: requireIsoTimestamp(dependency.updatedAt, "updatedAt"),
  };
  if (validated.predecessorId === validated.successorId) {
    throw new DomainValidationError(
      "self_template_dependency",
      "predecessorId",
      "Um item de template não pode depender dele mesmo.",
    );
  }
  return validated;
}

export function validateTaskTemplateBundle(bundle: TaskTemplateBundle): TaskTemplateBundle {
  const template = validateTaskTemplate(bundle.template);
  const items = bundle.items.map(validateTaskTemplateItem);
  const dependencies = bundle.dependencies.map(validateTaskTemplateDependency);
  if (items.length === 0) {
    throw new DomainValidationError(
      "empty_template",
      "items",
      "O template deve possuir pelo menos uma tarefa.",
    );
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  if (itemById.size !== items.length) {
    throw new DomainValidationError(
      "duplicate_template_item",
      "items",
      "O template contém itens duplicados.",
    );
  }
  if (items.some((item) => item.templateId !== template.id)) {
    throw new DomainValidationError(
      "template_item_mismatch",
      "templateId",
      "Todos os itens devem pertencer ao mesmo template.",
    );
  }
  const roots = items.filter((item) => item.parentId === null);
  if (roots.length !== 1) {
    throw new DomainValidationError(
      "invalid_template_root",
      "parentId",
      "O template deve possuir exatamente uma tarefa-raiz.",
    );
  }

  for (const item of items) {
    if (item.parentId !== null && !itemById.has(item.parentId)) {
      throw new DomainValidationError(
        "template_parent_not_found",
        "parentId",
        "O item-pai do template não existe.",
      );
    }
    const visited = new Set<string>();
    let candidate: TaskTemplateItem | undefined = item;
    while (candidate?.parentId !== null && candidate !== undefined) {
      if (visited.has(candidate.id)) {
        throw new DomainValidationError(
          "template_hierarchy_cycle",
          "parentId",
          "A hierarquia do template contém um ciclo.",
        );
      }
      visited.add(candidate.id);
      candidate = itemById.get(candidate.parentId);
    }
  }

  const summaryIds = new Set(items.flatMap((item) => item.parentId === null ? [] : [item.parentId]));
  for (const item of items) {
    if (!summaryIds.has(item.id) && item.durationDays === null) {
      throw new DomainValidationError(
        "missing_template_duration",
        "durationDays",
        `Defina a duração da tarefa “${item.title}” antes de criar o template.`,
      );
    }
  }

  const relationKeys = new Set<string>();
  const successors = new Map(items.map((item) => [item.id, [] as string[]]));
  for (const dependency of dependencies) {
    if (dependency.templateId !== template.id) {
      throw new DomainValidationError(
        "template_dependency_mismatch",
        "templateId",
        "Todas as dependências devem pertencer ao mesmo template.",
      );
    }
    if (!itemById.has(dependency.predecessorId) || !itemById.has(dependency.successorId)) {
      throw new DomainValidationError(
        "template_dependency_item_not_found",
        "predecessorId",
        "Os dois itens da dependência devem existir no template.",
      );
    }
    if (summaryIds.has(dependency.predecessorId) || summaryIds.has(dependency.successorId)) {
      throw new DomainValidationError(
        "template_summary_dependency",
        "predecessorId",
        "Dependências de template devem relacionar tarefas-folha.",
      );
    }
    const relationKey = `${dependency.predecessorId}:${dependency.successorId}:${dependency.type}`;
    if (relationKeys.has(relationKey)) {
      throw new DomainValidationError(
        "duplicate_template_dependency",
        "dependencies",
        "O template contém uma dependência duplicada.",
      );
    }
    relationKeys.add(relationKey);
    successors.get(dependency.predecessorId)?.push(dependency.successorId);
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (itemId: string): void => {
    if (active.has(itemId)) {
      throw new DomainValidationError(
        "template_dependency_cycle",
        "dependencies",
        "As dependências do template criam um ciclo.",
      );
    }
    if (visited.has(itemId)) return;
    active.add(itemId);
    for (const successorId of successors.get(itemId) ?? []) visit(successorId);
    active.delete(itemId);
    visited.add(itemId);
  };
  for (const item of items) visit(item.id);

  return { template, items, dependencies };
}
