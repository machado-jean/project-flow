# ProjectFlow

ProjectFlow é uma aplicação desktop local-first para planejamento de projetos e tarefas. A V1 tem como alvo exclusivo o Windows 11 x64 e deve operar integralmente offline após instalada.

## Estado atual

As Fases 0 a 3 estão concluídas localmente. O recorte funcional atual contém:

- Tauri 2, React, TypeScript e Vite;
- SQLite embarcado com migrations versionadas;
- logging local;
- lint, typecheck, testes e CI para Windows;
- projetos com criação, edição, status, arquivamento e exclusão;
- tarefas e subtarefas com edição inline, status, prioridade, progresso, datas,
  duração, responsável, tags e detalhes;
- hierarquia com expansão/recolhimento, troca de pai, reordenação e prevenção de ciclos;
- calendário configurável com segunda a domingo, feriados e exceções;
- calendário opcional **Todos os dias** para tarefas de fim de semana;
- cálculo assistido entre início, fim e duração;
- predecessoras Término para Início, lag, múltiplas relações e prevenção de ciclos;
- propagação conservadora de tarefas automáticas e aviso para conflitos manuais;
- tarefas-resumo com datas derivadas;
- persistência atômica das recalculações;
- interface integralmente em português.

Kanban, Gantt, filtros, templates e importação/exportação ainda não foram
implementados e permanecem nas fases seguintes.

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

Durante o desenvolvimento, `tauri dev` e o release local de teste compartilham:

```text
project-flow\.local\data\projectflow.sqlite
```

Na primeira abertura, um banco existente no perfil é copiado de forma
consistente para essa base, com backup em `.local\backups`. Uma base de
desenvolvimento já existente nunca é sobrescrita.

O build de distribuição continua usando o diretório de configuração do usuário
resolvido pelo Tauri. No Windows usado no bootstrap:

```text
%APPDATA%\com.projectflow.desktop\projectflow.sqlite
```

Logs ficam no diretório recomendado do Windows:

```text
%LOCALAPPDATA%\com.projectflow.desktop\logs\
```

`.local/` é ignorado pelo Git. A separação entre o release local de teste e o
build instalável está no
[ADR 012](docs/decisions/012-shared-development-database.md).

Durante a estabilização da Fase 3, uma variante conhecida do checksum da
migration 3 existiu em builds locais. A inicialização reconhece somente essa
variante, valida integralmente o banco e cria uma cópia anterior ao reparo em:

```text
%APPDATA%\com.projectflow.desktop\backups\
```

Projetos e tarefas não são modificados. Qualquer divergência diferente da
variante documentada interrompe a abertura sem escrita; detalhes estão no
[ADR 011](docs/decisions/011-migration-checksum-compatibility.md).

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

Para gerar o executável local de teste que usa o mesmo banco de `tauri dev`:

```powershell
npm run tauri:build:test
```

O resultado fica em `src-tauri\target\release\project-flow.exe`. Não distribuir
esse binário, pois ele referencia a `.local` do checkout em que foi compilado.

Para validar futuramente o comportamento de distribuição sem gerar instaladores:

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
