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

As subpastas planejadas já existem localmente, mas permanecem vazias enquanto a Fase 2 não começa.

## Persistência

O plugin SQL oficial do Tauri usa SQLite por meio de SQLx. `src-tauri/migrations/0001_initial.sql` cria somente `app_metadata`; nenhuma tabela de negócio existe ainda.

Migrations são registradas no processo nativo, aplicadas em transação pelo plugin e versionadas de forma crescente. O banco desktop usa o diretório `AppConfig` resolvido pelo Tauri, fora do repositório. A pasta `.local/` está disponível e ignorada para artefatos controlados de desenvolvimento.

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
