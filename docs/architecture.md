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

O primeiro recorte da Fase 2 usa essa separação de forma concreta: modelos e
invariantes vivem em `src/domain/`, `useWorkspace` coordena os casos de uso,
`WorkspaceRepository` define a fronteira e o adapter Tauri invoca comandos
nativos explícitos. A interface nunca executa SQL diretamente.

## Persistência

O plugin SQL oficial do Tauri abre o SQLite e aplica as migrations registradas.
O schema atual é a versão 2: `0001_initial.sql` cria os metadados técnicos e
`0002_core.sql` introduz calendários, projetos, tarefas e tags.

Migrations são registradas no processo nativo, aplicadas em transação pelo
plugin e versionadas de forma crescente. O banco desktop usa o diretório
`AppConfig` resolvido pelo Tauri, fora do repositório. A pasta `.local/` está
disponível e ignorada para artefatos controlados de desenvolvimento.

Os comandos `load_workspace`, `save_project`, `reorder_projects`,
`delete_project`, `save_task`, `reorder_tasks` e `delete_task_tree` formam a API
nativa atual. Escritas compostas, como tags, reordenação e exclusão de árvores,
são transacionais. O SQLite permanece a fonte de verdade; o estado React é uma
projeção em memória do workspace carregado.

## Apresentação inicial

- toda a interface destinada ao usuário está em português;
- a Tabela inicial usa HTML nativo e controles acessíveis, sem adicionar uma
  dependência estrutural de grid antes de medir uma necessidade real;
- projetos e tarefas compartilham um único estado, preparando as futuras views;
- erros de domínio são apresentados ao usuário e não chegam à persistência;
- projetos arquivados são mantidos no banco e ficam em modo somente leitura.

## Segurança e operação local

- CSP bloqueia origens remotas por padrão e permite apenas os protocolos locais necessários ao IPC/assets.
- Capabilities habilitam apenas `core:default`, leitura/carga SQL padrão e logging.
- Não há backend remoto, telemetria, conta ou sincronização.
- Logs usam o diretório recomendado `LocalAppData` e nível máximo `Info`.

## Qualidade

- TypeScript strict com verificações adicionais de campos opcionais e acesso indexado.
- ESLint type-aware com regras de React Hooks.
- Vitest + Testing Library para UI e domínio TypeScript.
- Testes Rust reais contra SQLite para migrations.
- Clippy com warnings tratados como erro.
- CI exclusiva em `windows-latest`, sem jobs Linux/macOS.
