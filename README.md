# ProjectFlow

ProjectFlow é uma aplicação desktop local-first para planejamento de projetos e tarefas. A V1 tem como alvo exclusivo o Windows 11 x64 e deve operar integralmente offline após instalada.

## Estado atual

As Fases 0 e 1 estão concluídas e a Fase 2 está em andamento. O recorte funcional
atual contém:

- Tauri 2, React, TypeScript e Vite;
- SQLite embarcado com migrations versionadas;
- logging local;
- lint, typecheck, testes e CI para Windows;
- projetos com criação, edição, status, arquivamento e exclusão;
- tarefas e subtarefas com edição inline, status, prioridade, progresso, datas,
  duração, responsável, tags e detalhes;
- hierarquia com expansão/recolhimento, troca de pai, reordenação e prevenção de ciclos;
- interface integralmente em português.

O scheduler, Kanban, Gantt, templates e importação/exportação ainda não foram
implementados. A configuração visual de dias úteis entra com o calendário da
Fase 3; o modelo já aceita atividades aos sábados e domingos.

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
src/                 apresentação e aplicação TypeScript
src/domain/          domínio puro, sem React ou Tauri
src/features/        projeções e fluxos de cada feature
src/repositories/    fronteiras de persistência
src-tauri/           shell nativo, plugins, migrations e logging
tests/               testes TypeScript unitários, integração, E2E e fixtures
docs/                arquitetura, ambiente e decisões
.local/              dados locais de desenvolvimento ignorados
```

`AGENTS.md` é a especificação principal do projeto.
