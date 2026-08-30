import { useState, type SyntheticEvent } from "react";

import type { TaskTemplate, TaskTemplateItem } from "../../domain/templates/template";

interface TemplateLibraryProps {
  readonly templates: readonly TaskTemplate[];
  readonly items: readonly TaskTemplateItem[];
  readonly projectName: string;
  readonly disabled: boolean;
  readonly onApply: (templateId: string, startDate: string) => Promise<unknown>;
  readonly onDelete: (templateId: string) => Promise<boolean>;
}

function localToday(): string {
  const today = new Date();
  const year = String(today.getFullYear());
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TemplateLibrary({
  templates,
  items,
  projectName,
  disabled,
  onApply,
  onDelete,
}: TemplateLibraryProps) {
  const [startDates, setStartDates] = useState<Readonly<Record<string, string>>>({});

  const apply = async (
    event: SyntheticEvent<HTMLFormElement>,
    templateId: string,
  ): Promise<void> => {
    event.preventDefault();
    await onApply(templateId, startDates[templateId] ?? localToday());
  };

  return (
    <details className="workspace-menu template-library" name="workspace-menu">
      <summary>
        <span>Templates</span>
        <span className="template-count">{templates.length}</span>
      </summary>
      <div className="workspace-menu-popover template-library-content">
        <div className="template-library-heading">
          <div>
            <h2>Aplicar estrutura</h2>
            <p>O destino atual é <strong>{projectName}</strong>. Datas serão calculadas pelo scheduler.</p>
          </div>
        </div>
        {templates.length === 0 ? (
          <p className="template-empty">Abra os detalhes de uma tarefa e use “Salvar árvore como template”.</p>
        ) : (
          <ul className="template-list">
            {templates.map((template) => {
              const taskCount = items.filter((item) => item.templateId === template.id).length;
              return (
                <li className="template-card" key={template.id}>
                  <div className="template-card-copy">
                    <strong>{template.name}</strong>
                    {template.description === null ? null : <span>{template.description}</span>}
                    <small>{taskCount} {taskCount === 1 ? "tarefa" : "tarefas"}</small>
                  </div>
                  <form onSubmit={(event) => { void apply(event, template.id); }}>
                    <label>
                      Data inicial
                      <input
                        type="date"
                        required
                        value={startDates[template.id] ?? localToday()}
                        disabled={disabled}
                        onChange={(event) => {
                          setStartDates((current) => ({
                            ...current,
                            [template.id]: event.target.value,
                          }));
                        }}
                      />
                    </label>
                    <button className="primary-button" type="submit" disabled={disabled}>Aplicar</button>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (window.confirm(`Excluir o template “${template.name}”? As tarefas já aplicadas não serão alteradas.`)) {
                          void onDelete(template.id);
                        }
                      }}
                    >
                      Excluir
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
