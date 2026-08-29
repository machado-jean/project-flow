# Arquitetura inicial

## Objetivo

A arquitetura separa apresentação, domínio e infraestrutura para manter as regras centrais testáveis sem React, DOM ou Tauri.

```text
React/views
    ↓
estado e casos de uso TypeScript
    ↓
domínio TypeScript puro
    ↓
interfaces de repositories
    ↓
adapters Tauri/SQLite/filesystem
```

Dependências não devem apontar no sentido inverso. React não é fonte de verdade e Rust não recebe regras de scheduling sem uma necessidade nativa concreta.

## Responsabilidades

- `src/app/`: composição da aplicação e navegação.
- `src/components/`: componentes de apresentação reutilizáveis.
- `src/features/`: Tabela, Kanban, Gantt e fluxos orientados a feature.
- `src/domain/`: calendário, scheduling, duplicação e validação em TypeScript puro.
- `src/repositories/`: contratos e adapters de persistência.
- `src/state/`: estado de aplicação, sem duplicar entidades por view.
- `src-tauri/`: shell, SQLite, migrations, logs e integrações nativas.

As Fases 2 e 3 usam essa separação de forma concreta: modelos, calendário,
grafo e scheduler vivem em `src/domain/`; `useWorkspace` coordena casos de uso,
validação e persistência; `WorkspaceRepository` define a fronteira; e o adapter
Tauri invoca comandos nativos explícitos. A interface nunca executa SQL nem
contém regras centrais de agendamento.

A Fase 4 mantém a mesma fronteira. `ProjectViews` conserva somente estado de
navegação e filtros; Tabela, Kanban e Gantt recebem as mesmas entidades do
workspace. `TaskKanban` altera status pelo mesmo `onSave` e `TaskGantt` cria uma
projeção transitória para a biblioteca SVAR. Não existem tabelas, repositories
ou cópias persistidas específicas de view.

A identificação estrutural (`1.`, `1.1.`, `1.1.1.`) também é uma projeção do
domínio. `buildTaskOutlineNumbers` percorre a hierarquia ordenada e fornece os
rótulos às três views. O número não é parte do título, do código visual nem do
schema; reordenar ou mudar o pai recalcula a identificação imediatamente.

## Persistência

O plugin SQL oficial do Tauri abre o SQLite e aplica as migrations registradas.
O schema atual é a versão 3: `0001_initial.sql` cria metadados técnicos,
`0002_core.sql` introduz calendários, projetos, tarefas e tags, e
`0003_scheduling.sql` acrescenta exceções, calendário opcional por tarefa e
dependências FS.

Migrations são registradas no processo nativo, aplicadas em transação pelo
plugin e versionadas de forma crescente. O adapter carrega explicitamente a URL
calculada pelo backend antes do primeiro comando de workspace, evitando que o
preload abra uma segunda instância.

Builds debug e o release local criado por `npm run tauri:build:test` compartilham
`project-flow\.local\data\projectflow.sqlite`. Um build de distribuição sem a
feature `shared-dev-data` continua usando `AppConfig` resolvido pelo Tauri. Na
primeira abertura do modo compartilhado, o banco existente em `AppConfig` é
preservado com `VACUUM INTO`, verificado e copiado para `.local` sem sobrescrever
um destino existente. A separação e a virtualização de `AppData` que a motivou
estão documentadas no [ADR 012](decisions/012-shared-development-database.md).

Antes do plugin SQL, uma verificação nativa trata exclusivamente a variante de
checksum da migration 3 conhecida durante o desenvolvimento. Ela valida
integridade, histórico, schema e dados estruturais, cria um backup SQLite
consistente e altera somente o checksum registrado. Valores desconhecidos
falham sem escrita. A decisão e os hashes permitidos estão no
[ADR 011](decisions/011-migration-checksum-compatibility.md).

Os comandos de CRUD simples continuam disponíveis. A Fase 3 acrescenta
`save_calendar` e `apply_schedule_changes`. Este último recebe o resultado já
validado do domínio e grava calendários, tarefas, dependências e exclusões em
uma única transação. Uma falha reverte todo o conjunto. O SQLite permanece a
fonte de verdade; o estado React é uma projeção em memória do workspace.

Ao carregar, o estado reconcilia uma vez as cadeias automáticas e as
tarefas-resumo. Somente diferenças reais são gravadas pelo mesmo comando
transacional; tarefas manuais permanecem intactas e seus conflitos são
reconstruídos para a interface.

## Fluxo do scheduler

```text
edição na Tabela
    ↓
useWorkspace valida entidade, hierarquia e grafo
    ↓
scheduler TypeScript calcula subgrafo afetado e tarefas-resumo
    ↓
ScheduleChangeSet completo
    ↓
apply_schedule_changes / transação SQLite
    ↓
estado React recebe exatamente o resultado persistido
```

O scheduler ancora tarefas automáticas com predecessoras na restrição FS mais
tardia, podendo propagá-las para frente ou para trás. Ele usa o calendário
efetivo da sucessora e mantém conflitos informativos para tarefas manuais. As
regras detalhadas e a matriz de testes estão em [scheduling.md](scheduling.md).

## Apresentação

- toda a interface destinada ao usuário está em português;
- a Tabela inicial usa HTML nativo e controles acessíveis, sem adicionar uma
  dependência estrutural de grid antes de medir uma necessidade real;
- projetos e tarefas compartilham um único estado entre Tabela, Kanban e Gantt;
- dependências são editadas na coluna **Predecessoras** da Tabela;
- início, fim e duração formam uma edição assistida de duas entradas para três campos;
- calendário e exceções são configuráveis sem sair do projeto;
- tarefas-resumo exibem datas derivadas e bloqueiam edição direta;
- erros de domínio são apresentados ao usuário e não chegam à persistência;
- projetos arquivados são mantidos no banco e ficam em modo somente leitura;
- filtros por texto, status, prioridade, conclusão, intervalo e tag são
  compartilhados pelas três views e preservam ancestrais como contexto;
- o Kanban oferece drag-and-drop e um seletor equivalente operável por teclado;
- o Gantt é carregado sob demanda, fica somente leitura como renderer e envia
  edições de prazo pelo scheduler do ProjectFlow;
- o Gantt converte o fim inclusivo para o limite exclusivo esperado pelo
  renderer e permite isolar relações longas por clique ou seletor;
- a janela desktop inicia maximizada, preservando dimensões mínimas para
  restauração; ver [ADR 013](decisions/013-svar-react-gantt.md).

## Segurança e operação local

- CSP bloqueia origens remotas por padrão e permite apenas os protocolos locais necessários ao IPC/assets.
- Capabilities habilitam apenas `core:default`, leitura/carga SQL padrão e logging.
- Não há backend remoto, telemetria, conta ou sincronização.
- Logs usam o diretório recomendado `LocalAppData` e nível máximo `Info`.
- Bancos e backups de desenvolvimento ficam em `.local/`, fora do Git; builds
  instaláveis não dependem desse diretório.

## Qualidade

- TypeScript strict com verificações adicionais de campos opcionais e acesso indexado.
- ESLint type-aware com regras de React Hooks.
- Vitest + Testing Library para UI e domínio TypeScript.
- Testes Rust reais contra SQLite para migrations.
- Clippy com warnings tratados como erro.
- CI exclusiva em `windows-latest`, sem jobs Linux/macOS.
