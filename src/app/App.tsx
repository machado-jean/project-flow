import { useMemo } from "react";

import { ProjectHeader } from "../features/projects/ProjectHeader";
import { ProjectActionsMenu } from "../features/projects/ProjectActionsMenu";
import { CalendarSettings } from "../features/projects/CalendarSettings";
import { ProjectSidebar } from "../features/projects/ProjectSidebar";
import { ProjectViews } from "../features/views/ProjectViews";
import { TemplateLibrary } from "../features/templates/TemplateLibrary";
import { PortabilityPanel } from "../features/import-export/PortabilityPanel";
import { TauriWorkspaceRepository } from "../repositories/tauri-workspace-repository";
import type { WorkspaceRepository } from "../repositories/workspace-repository";
import { useWorkspace } from "../state/use-workspace";
import "./App.css";
import { scheduleYears } from "../domain/calendars/official-holidays";
import { WorkspaceHelpMenu } from "../components/WorkspaceHelpMenu";
import { WorkspaceMenuBar } from "../components/WorkspaceMenuBar";

interface AppProps {
  readonly repository?: WorkspaceRepository;
}

function App({ repository }: AppProps) {
  const activeRepository = useMemo(() => repository ?? new TauriWorkspaceRepository(), [repository]);
  const workspace = useWorkspace(activeRepository);
  const projectPeers = workspace.selectedProject === null
    ? []
    : workspace.projects
        .filter((project) => project.isArchived === workspace.selectedProject?.isArchived)
        .sort(
          (left, right) =>
            left.position - right.position || left.createdAt.localeCompare(right.createdAt),
        );
  const selectedProjectIndex = projectPeers.findIndex(
    (project) => project.id === workspace.selectedProjectId,
  );
  const selectedCalendar = workspace.calendars.find(
    (calendar) => calendar.id === workspace.selectedProject?.calendarId,
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-content">Ir para o conteúdo principal</a>
      <ProjectSidebar
        projects={workspace.projects}
        selectedProjectId={workspace.selectedProjectId}
        disabled={workspace.isLoading || workspace.isSaving}
        onSelect={workspace.selectProject}
        onCreate={workspace.createProject}
      />

      <main className="workspace-main" id="workspace-content" tabIndex={-1}>
        {workspace.error !== null ? (
          <div className="error-banner" role="alert">
            <span>{workspace.error}</span>
            <button type="button" aria-label="Fechar mensagem de erro" onClick={workspace.clearError}>Fechar</button>
          </div>
        ) : null}

        {workspace.isLoading ? (
          <section className="center-state" aria-live="polite">
            <div className="loading-indicator" aria-hidden="true" />
            <h1>Carregando seu workspace…</h1>
            <p>Os dados permanecem neste computador.</p>
          </section>
        ) : workspace.selectedProject === null ? (
          <>
            <WorkspaceMenuBar>
              <PortabilityPanel
                repository={activeRepository}
                selectedProject={null}
                disabled={workspace.isSaving}
                onWorkspaceChanged={workspace.reloadWorkspace}
              />
              <WorkspaceHelpMenu />
            </WorkspaceMenuBar>
            <section className="center-state">
              <span className="empty-illustration" aria-hidden="true">PF</span>
              <h1>Organize seu primeiro projeto</h1>
              <p>Use o botão “+” ao lado de Projetos para criar um espaço de planejamento.</p>
            </section>
          </>
        ) : (
          <div className="project-workspace">
            <WorkspaceMenuBar>
              <PortabilityPanel
                repository={activeRepository}
                selectedProject={workspace.selectedProject}
                disabled={workspace.isSaving}
                onWorkspaceChanged={workspace.reloadWorkspace}
              />
              <ProjectActionsMenu
                project={workspace.selectedProject}
                disabled={workspace.isSaving}
                canMoveUp={selectedProjectIndex > 0}
                canMoveDown={selectedProjectIndex >= 0 && selectedProjectIndex < projectPeers.length - 1}
                onSave={workspace.saveProject}
                onMove={workspace.moveProject}
                onDelete={workspace.removeProject}
                onDuplicate={workspace.duplicateProject}
              />
              {selectedCalendar !== undefined ? (
                <CalendarSettings
                  key={selectedCalendar.updatedAt}
                  calendar={selectedCalendar}
                  disabled={workspace.isSaving || workspace.selectedProject.isArchived}
                  usedYears={scheduleYears(workspace.selectedProjectTasks)}
                  onSave={workspace.saveCalendar}
                />
              ) : null}
              <TemplateLibrary
                templates={workspace.templates}
                items={workspace.templateItems}
                projectName={workspace.selectedProject.name}
                disabled={workspace.isSaving || workspace.selectedProject.isArchived}
                onApply={workspace.applyTemplate}
                onDelete={workspace.removeTemplate}
              />
              <WorkspaceHelpMenu />
            </WorkspaceMenuBar>
            <ProjectHeader
              key={`${workspace.selectedProject.id}-${workspace.selectedProject.updatedAt}`}
              project={workspace.selectedProject}
              taskCount={workspace.selectedProjectTasks.length}
              disabled={workspace.isSaving}
              onSave={workspace.saveProject}
            />
            <ProjectViews
              tasks={workspace.selectedProjectTasks}
              calendars={workspace.calendars}
              projectCalendarId={workspace.selectedProject.calendarId}
              dependencies={workspace.selectedProjectDependencies}
              conflicts={workspace.schedulingConflicts.filter((conflict) =>
                workspace.selectedProjectTasks.some((task) => task.id === conflict.taskId),
              )}
              disabled={workspace.isSaving || workspace.selectedProject.isArchived}
              onCreate={workspace.createTask}
              onSave={workspace.saveTask}
              onMove={workspace.moveTask}
              onDelete={workspace.removeTaskTree}
              onCreateDependency={workspace.createDependency}
              onDeleteDependency={workspace.removeDependency}
              onDuplicateTask={workspace.duplicateTask}
              onCreateTemplate={workspace.createTemplate}
            />
          </div>
        )}

        {workspace.isSaving ? <div className="saving-toast" role="status">Salvando no dispositivo…</div> : null}
      </main>
    </div>
  );
}

export default App;
