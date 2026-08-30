export function WorkspaceHelpMenu() {
  return (
    <details className="workspace-menu help-menu" name="workspace-menu">
      <summary>Ajuda</summary>
      <div className="workspace-menu-popover help-menu-popover">
        <strong>Orientações rápidas</strong>
        <p>A Tabela é a visualização principal para editar tarefas e dependências.</p>
        <p>Kanban e Gantt usam as mesmas tarefas e refletem as alterações salvas.</p>
        <p>Feriados municipais podem ser criados manualmente no menu Calendário.</p>
        <hr />
        <small>ProjectFlow 0.1.0 · operação local e offline</small>
        <small>Licenças de terceiros: THIRD_PARTY_NOTICES.md</small>
      </div>
    </details>
  );
}
