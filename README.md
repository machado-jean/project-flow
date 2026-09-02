# ProjectFlow

ProjectFlow é uma aplicação desktop local-first para planejamento de projetos e tarefas. A V1 tem como alvo exclusivo o Windows 11 x64 e deve operar integralmente offline após instalada.

## Estado atual

As Fases 0 a 6 estão concluídas e o Checkpoint Git 7 foi consolidado no commit
`fc26a29`. O recorte funcional atual contém:

- Tauri 2, React, TypeScript e Vite;
- SQLite embarcado com migrations versionadas;
- logging local;
- lint, typecheck, testes e CI para Windows;
- projetos com criação, edição, status, arquivamento e exclusão;
- tarefas e subtarefas com edição inline, status, prioridade, progresso, datas,
  duração, responsável, tags e detalhes;
- hierarquia com expansão/recolhimento, troca de pai, reordenação e prevenção de ciclos;
- numeração hierárquica derivada (`1.`, `1.1.`, `1.1.1.`) nas três views;
- calendário configurável com segunda a domingo, feriados e exceções;
- calendário opcional **Todos os dias** para tarefas de fim de semana;
- cálculo assistido entre início, fim e duração;
- predecessoras Término para Início, lag, múltiplas relações e prevenção de ciclos;
- propagação reativa de tarefas automáticas, para frente ou para trás, e aviso
  para conflitos manuais;
- tarefas-resumo com datas derivadas;
- persistência atômica das recalculações;
- filtros compartilhados por texto, status, prioridade, conclusão, datas e tag;
- Kanban por status com drag-and-drop e campo **Status** acessível;
- Gantt com hierarquia, progresso, dependências FS, ajuste automático de lag,
  menu de contexto, desfazer/refazer, resumos, escalas, fins de semana,
  feriados, foco de dependência e edição temporal segura;
- sincronização imediata entre Tabela, Kanban e Gantt;
- janela principal maximizada na inicialização;
- duplicação de tarefa isolada, árvore completa e projeto, sempre com novos UUIDs;
- preservação somente das dependências internas ao conteúdo duplicado;
- biblioteca global de templates de árvores, com aplicação em qualquer projeto
  e data de início escolhida;
- exportação de projeto e workspace em pacote `.projectflow` validado;
- importação seletiva com atualização por UUID ou cópia independente;
- seleção individual de templates e tratamento seguro de calendários;
- backup SQLite verificado e restauração integral com backup de segurança;
- seletor de destino para backup manual e acesso discreto à pasta dos backups
  automáticos;
- interface integralmente em português;
- navegação por teclado com link de salto, foco visível, menus e diálogos com
  retorno de foco, além de alternativas nativas às interações visuais;
- verificação manual de nova versão pelo GitHub, sem consulta na inicialização,
  com download aberto no navegador padrão.

A Fase 7 está em andamento. O primeiro incremento adicionou orçamentos de
desempenho, navegação das views por teclado, instaladores NSIS padrão/offline e
um fluxo automatizado mínimo em camadas. A revisão final de UX/acessibilidade
foi concluída e está registrada em
[docs/ux-accessibility.md](docs/ux-accessibility.md). A validação manual em uma
máquina Windows limpa ainda é critério de saída pendente. A automação da janela
Tauri permanece como diagnóstico não bloqueante
devido a uma regressão do WebView2 150+ registrada no ADR 019.

O progresso por fase, os checkpoints e o histórico de entregas são mantidos em [docs/roadmap.md](docs/roadmap.md).

## Stack

- Tauri 2 e Rust apenas para a camada nativa;
- React e TypeScript estrito na aplicação;
- Vite para desenvolvimento e build do frontend;
- SQLite como fonte local de verdade;
- npm para dependências JavaScript.

Documentação principal:

- [ambiente e versões](docs/environment.md);
- [arquitetura](docs/architecture.md);
- [modelo de dados](docs/data-model.md);
- [scheduler e calendário](docs/scheduling.md);
- [Tabela, Kanban, Gantt e auditoria manual](docs/views.md);
- [duplicação, templates e auditoria manual](docs/reuse.md);
- [roadmap e histórico](docs/roadmap.md);
- [importação, exportação e backup](docs/import-export.md);
- [instalação e manutenção no Windows](docs/installation-windows.md);
- [auditoria de UX e acessibilidade](docs/ux-accessibility.md);
- [decisões arquiteturais](docs/decisions/).

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
npm run test:performance
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

Para gerar instaladores de produção:

```powershell
npm run tauri:build:installer
npm run tauri:build:installer:offline
```

O primeiro é compacto e usa o bootstrapper do WebView2 somente se necessário;
o segundo incorpora o runtime para instalação sem internet. Consulte
[installation-windows.md](docs/installation-windows.md) antes de distribuir.

O build de distribuição e o release local de teste usam o mesmo nome e caminho
de saída. Portanto, executar `npm run tauri:build -- --no-bundle` substitui o
`.exe` pelo modo de produção, que lê `AppConfig`; para voltar a auditar os dados
de desenvolvimento nesse caminho, execute `npm run tauri:build:test` por último.

No fechamento da Fase 6, os números e gates finais estão registrados em
[docs/environment.md](docs/environment.md). O release local de auditoria é
regerado no mesmo caminho e preserva o banco compartilhado de desenvolvimento.

Para validar futuramente o comportamento de distribuição sem gerar instaladores:

```powershell
npm run tauri:build -- --no-bundle
```

NSIS padrão e offline são as estratégias de distribuição definidas no ADR 017.
Atualizações são verificadas manualmente conforme o ADR 018.

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

As atribuições e licenças das bibliotecas e bases de dados incorporadas ficam em
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
