# ProjectFlow

ProjectFlow é uma aplicação desktop local-first para planejamento de projetos e tarefas. A V1 tem como alvo exclusivo o Windows 11 x64 e deve operar integralmente offline após instalada.

## Estado atual

O repositório contém somente a fundação técnica da primeira entrega:

- Tauri 2, React, TypeScript e Vite;
- SQLite embarcado com migration inicial;
- logging local;
- lint, typecheck, testes e CI para Windows;
- documentação de arquitetura e ambiente.

As funcionalidades de projetos, tarefas, scheduler, Tabela, Kanban, Gantt, templates e importação/exportação ainda não foram implementadas.

O progresso por fase, os checkpoints e o histórico de entregas são mantidos em [docs/roadmap.md](docs/roadmap.md).

## Stack

- Tauri 2 e Rust apenas para a camada nativa;
- React e TypeScript estrito na aplicação;
- Vite para desenvolvimento e build do frontend;
- SQLite como fonte local de verdade;
- npm para dependências JavaScript.

As versões exatas e os pré-requisitos estão em [docs/environment.md](docs/environment.md).

## Preparação

Em um Windows 11 x64 com os pré-requisitos instalados:

```powershell
npm ci
npm run tauri:dev
```

O banco desktop fica no diretório de configuração do usuário resolvido pelo Tauri. No Windows usado no bootstrap:

```text
%APPDATA%\com.projectflow.desktop\projectflow.sqlite
```

Logs ficam no diretório recomendado do Windows:

```text
%LOCALAPPDATA%\com.projectflow.desktop\logs\
```

`.local/` permanece reservado a dados e artefatos locais de desenvolvimento e é ignorado pelo Git.

## Qualidade e testes

```powershell
npm run lint
npm run typecheck
npm test
npm run build

cd src-tauri
cargo fmt --all -- --check
cargo check --locked --all-targets
cargo test --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
```

Para validar o executável sem gerar instaladores:

```powershell
npm run tauri:build -- --no-bundle
```

MSI/NSIS e instalação offline serão decididos apenas na fase de distribuição.

## Estrutura

```text
src/                 apresentação e futura aplicação TypeScript
src/domain/          domínio puro, sem React ou Tauri
src/features/        projeções e fluxos de cada feature
src/repositories/    fronteiras de persistência
src-tauri/           shell nativo, plugins, migrations e logging
tests/               testes TypeScript unitários, integração, E2E e fixtures
docs/                arquitetura, ambiente e decisões
.local/              dados locais de desenvolvimento ignorados
```

`AGENTS.md` é a especificação principal do projeto.
