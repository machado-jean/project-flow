import { useMemo, useState } from "react";

import type {
  ImportPackagePreview,
  ProjectImportMode,
  WorkspaceRepository,
} from "../../repositories/workspace-repository";

interface PortabilityPanelProps {
  readonly repository: WorkspaceRepository;
  readonly selectedProject: { readonly id: string; readonly name: string } | null;
  readonly disabled: boolean;
  readonly onWorkspaceChanged: () => void;
}

type ProjectChoice = ProjectImportMode | "IGNORE";

function safeFilename(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, "-") || "projeto";
}

function packageSummary(preview: ImportPackagePreview): string {
  const projects = `${String(preview.projects.length)} ${preview.projects.length === 1 ? "projeto" : "projetos"}`;
  const templates = `${String(preview.templates.length)} ${preview.templates.length === 1 ? "template" : "templates"}`;
  return `${projects} e ${templates}`;
}

export function PortabilityPanel({
  repository,
  selectedProject,
  disabled,
  onWorkspaceChanged,
}: PortabilityPanelProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPackagePreview | null>(null);
  const [restorePreview, setRestorePreview] = useState<ImportPackagePreview | null>(null);
  const [projectChoices, setProjectChoices] = useState<Record<string, ProjectChoice>>({});
  const [templateChoices, setTemplateChoices] = useState<ReadonlySet<string>>(new Set());

  const hasImportSelection = useMemo(
    () =>
      Object.values(projectChoices).some((choice) => choice !== "IGNORE") ||
      templateChoices.size > 0,
    [projectChoices, templateChoices],
  );

  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await operation();
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : String(operationError));
    } finally {
      setBusy(false);
    }
  };

  const chooseImport = (): void => {
    void run(async () => {
      const preview = await repository.chooseImportPackage();
      if (preview === null) return;
      setProjectChoices(
        Object.fromEntries(preview.projects.map((project) => [project.id, "REPLACE"])),
      );
      setTemplateChoices(new Set(preview.templates.map((template) => template.id)));
      setImportPreview(preview);
    });
  };

  const applyImport = (): void => {
    if (importPreview === null) return;
    void run(async () => {
      const result = await repository.applyImportPackage(importPreview.packagePath, {
        projects: importPreview.projects.flatMap((project) => {
          const mode = projectChoices[project.id] ?? "IGNORE";
          return mode === "IGNORE" ? [] : [{ projectId: project.id, mode }];
        }),
        templateIds: [...templateChoices],
      });
      setImportPreview(null);
      setMessage(
        `Importação concluída: ${String(result.importedProjectCount)} atualizado(s), ${String(result.copiedProjectCount)} cópia(s) e ${String(result.importedTemplateCount)} template(s). Backup: ${result.backupPath}`,
      );
      onWorkspaceChanged();
    });
  };

  const chooseRestore = (): void => {
    void run(async () => {
      const preview = await repository.chooseRestoreBackup();
      if (preview !== null) setRestorePreview(preview);
    });
  };

  const applyRestore = (): void => {
    if (restorePreview === null) return;
    void run(async () => {
      const result = await repository.restoreBackup(restorePreview.packagePath);
      setRestorePreview(null);
      setMessage(
        `Workspace restaurado com ${String(result.projectCount)} projeto(s) e ${String(result.templateCount)} template(s). Backup de segurança: ${result.safetyBackupPath}`,
      );
      onWorkspaceChanged();
    });
  };

  return (
    <section className="portability-bar" aria-label="Portabilidade e backup">
      <div className="portability-actions">
        <strong>Dados</strong>
        {selectedProject !== null ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => {
              void run(async () => {
                const result = await repository.exportProject(
                  selectedProject.id,
                  safeFilename(selectedProject.name),
                );
                if (result !== null) setMessage(`Projeto exportado para ${result.path}`);
              });
            }}
          >
            Exportar projeto
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => {
            void run(async () => {
              const result = await repository.exportWorkspace();
              if (result !== null) setMessage(`Workspace exportado para ${result.path}`);
            });
          }}
        >
          Exportar workspace
        </button>
        <button type="button" disabled={disabled || busy} onClick={chooseImport}>
          Importar pacote
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => {
            void run(async () => {
              const result = await repository.createBackup();
              setMessage(`Backup verificado criado em ${result.path}`);
            });
          }}
        >
          Criar backup
        </button>
        <button type="button" disabled={disabled || busy} onClick={chooseRestore}>
          Restaurar backup
        </button>
      </div>
      {busy ? <span className="portability-status" role="status">Processando dados locais…</span> : null}
      {message !== null ? <p className="portability-message" role="status">{message}</p> : null}
      {error !== null ? <p className="portability-error" role="alert">{error}</p> : null}

      {importPreview !== null ? (
        <div className="modal-backdrop" role="presentation">
          <section className="portability-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <header>
              <div>
                <h2 id="import-title">Escolher conteúdo para importar</h2>
                <p>{packageSummary(importPreview)} · schema {importPreview.schemaVersion}</p>
              </div>
              <button type="button" aria-label="Fechar importação" onClick={() => { setImportPreview(null); }}>×</button>
            </header>
            <div className="import-list">
              <h3>Projetos</h3>
              {importPreview.projects.length === 0 ? <p>Nenhum projeto no pacote.</p> : null}
              {importPreview.projects.map((project) => (
                <label className="import-row" key={project.id}>
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.taskCount} tarefa(s){project.existsLocally ? " · já existe neste workspace" : " · novo"}</small>
                  </span>
                  <select
                    aria-label={`Ação para ${project.name}`}
                    value={projectChoices[project.id] ?? "IGNORE"}
                    onChange={(event) => {
                      setProjectChoices((current) => ({
                        ...current,
                        [project.id]: event.target.value as ProjectChoice,
                      }));
                    }}
                  >
                    <option value="REPLACE">{project.existsLocally ? "Atualizar projeto" : "Importar"}</option>
                    <option value="COPY">Importar como cópia</option>
                    <option value="IGNORE">Não importar</option>
                  </select>
                </label>
              ))}
              <h3>Templates</h3>
              {importPreview.templates.length === 0 ? <p>Nenhum template no pacote.</p> : null}
              {importPreview.templates.map((template) => (
                <label className="import-row import-checkbox" key={template.id}>
                  <span>
                    <strong>{template.name}</strong>
                    <small>{template.itemCount} item(ns){template.existsLocally ? " · será substituído" : " · novo"}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={templateChoices.has(template.id)}
                    onChange={(event) => {
                      setTemplateChoices((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(template.id); else next.delete(template.id);
                        return next;
                      });
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="import-warning">Projetos atualizados são substituídos pelo conteúdo do pacote. Um backup automático é criado antes da transação.</p>
            <footer>
              <button type="button" className="secondary-button" onClick={() => { setImportPreview(null); }}>Cancelar</button>
              <button type="button" className="primary-button" disabled={!hasImportSelection || busy} onClick={applyImport}>Importar seleção</button>
            </footer>
          </section>
        </div>
      ) : null}

      {restorePreview !== null ? (
        <div className="modal-backdrop" role="presentation">
          <section className="portability-modal compact" role="alertdialog" aria-modal="true" aria-labelledby="restore-title">
            <header>
              <div>
                <h2 id="restore-title">Restaurar workspace completo?</h2>
                <p>O backup contém {packageSummary(restorePreview)}.</p>
              </div>
            </header>
            <p className="import-warning">A restauração substitui todo o workspace atual. Antes disso, o ProjectFlow cria outro backup de segurança.</p>
            <footer>
              <button type="button" className="secondary-button" onClick={() => { setRestorePreview(null); }}>Cancelar</button>
              <button type="button" className="danger-button" disabled={busy} onClick={applyRestore}>Restaurar tudo</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
