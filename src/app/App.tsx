import "./App.css";

const foundations = [
  {
    label: "Desktop nativo",
    detail: "Tauri 2 no Windows 11 x64",
  },
  {
    label: "Interface",
    detail: "React e TypeScript em modo estrito",
  },
  {
    label: "Persistência",
    detail: "SQLite local com migrations transacionais",
  },
  {
    label: "Privacidade",
    detail: "Operação offline e sem telemetria por padrão",
  },
] as const;

function App() {
  return (
    <main className="app-shell">
      <section className="foundation-card" aria-labelledby="app-title">
        <div className="eyebrow">Fundação técnica</div>
        <h1 id="app-title">ProjectFlow</h1>
        <p className="lead">
          A base desktop está pronta para receber o domínio de projetos e tarefas.
        </p>

        <ul className="foundation-grid" aria-label="Componentes da fundação">
          {foundations.map((foundation) => (
            <li key={foundation.label}>
              <span className="status-dot" aria-hidden="true" />
              <div>
                <strong>{foundation.label}</strong>
                <span>{foundation.detail}</span>
              </div>
            </li>
          ))}
        </ul>

        <p className="scope-note">
          Nenhuma funcionalidade de negócio foi implementada nesta etapa.
        </p>
      </section>
    </main>
  );
}

export default App;
