# Roadmap e registro de evolução

Este é o registro vivo de execução do ProjectFlow. Ele traduz o roadmap definido em `AGENTS.md` em fases acompanháveis, checkpoints verificáveis e um histórico cronológico das entregas.

`AGENTS.md` continua sendo a fonte de verdade para produto, arquitetura e regras operacionais. Este documento não substitui a especificação e não deve introduzir escopo incompatível com ela.

Última atualização: **28 de agosto de 2026**.

## Como manter este documento

Estados utilizados:

- **Concluída:** todos os critérios de saída da fase foram comprovados.
- **Em andamento:** existe trabalho ativo e delimitado na fase.
- **Planejada:** o escopo está previsto, mas ainda não começou.
- **Bloqueada:** há um impedimento explícito registrado no histórico.
- **Decisão pendente:** o avanço depende de uma escolha de arquitetura, integridade de dados ou stack.

Ao concluir uma entrega:

1. atualizar o estado e os itens da fase afetada;
2. registrar evidências, testes e migrations aplicáveis;
3. acrescentar uma entrada no histórico sem apagar entradas anteriores;
4. associar o commit ou escrever `não commitado`;
5. registrar decisões relevantes em ADR;
6. indicar o próximo incremento recomendado.

Não usar percentuais subjetivos. O progresso deve ser demonstrado por entregáveis e validações.

## Estado atual

| Item | Estado |
| --- | --- |
| Etapa do produto | Views sincronizadas concluídas; Checkpoint Git 5 preparado |
| Fase ativa | Nenhuma; Fase 4 pronta para commit local do usuário |
| Próxima fase | Fase 5 — Reutilização, somente após aceite explícito |
| Versão da aplicação | `0.1.0` |
| Versão do schema SQLite | `3` |
| Último commit estável | `6f02673` — `Implement ProjectFlow foundation and core task management` |
| Branch de trabalho | `main`, com o Checkpoint Git 5 ainda não commitado |
| Checkpoints obrigatórios | A, B, C e D concluídos; E reservado à distribuição |
| Funcionalidades de negócio | Project/Task, scheduler FS, filtros, Tabela, Kanban e Gantt implementados |

## Visão geral das fases

| Fase | Objetivo | Estado | Checkpoint Git | Critério principal de saída |
| --- | --- | --- | --- | --- |
| 0 — Ambiente | Preparar e documentar o toolchain Windows | Concluída | 1 | Pré-requisitos oficiais instalados e validados |
| 1 — Fundação | Criar shell, qualidade, persistência e documentação | Concluída | 1 e 2 | Aplicação vazia executa, testes passam e SQLite migra |
| 2 — Core | Implementar Project, Task, hierarquia e Tabela inicial | Concluída | 3 | Core persistido e editável com integridade e testes |
| 3 — Scheduling | Implementar calendário, dependência FS e propagação | Concluída | 4 | Scheduler FS estável e coberto pelos casos obrigatórios |
| 4 — Views | Entregar Kanban, Gantt e filtros sincronizados | Concluída | 5 | As views projetam a mesma tarefa sem duplicar dados |
| 5 — Reutilização | Entregar duplicação e templates | Planejada | 6 | Árvores e relações internas são recriadas com novos UUIDs |
| 6 — Portabilidade | Entregar exportação, importação e backup | Planejada | 7 | Round-trip preserva semanticamente o workspace |
| 7 — Hardening e distribuição | Preparar o produto para uso real no Windows | Planejada | 8 | Instalador e operação offline validados em máquina limpa |

## Fase 0 — Ambiente

Estado: **Concluída**.

- [x] Inspecionar Git, Node, npm, Rust, Cargo, Rustup e requisitos do Tauri.
- [x] Consultar documentação oficial e selecionar versões compatíveis.
- [x] Preservar Git e WebView2 existentes por já estarem adequados.
- [x] Instalar Node.js LTS, Rust MSVC e Visual Studio Build Tools necessários.
- [x] Validar Windows SDK, MSVC e WebView2.
- [x] Registrar versões, origens, hashes e comandos.

Evidência principal: [environment.md](environment.md).

Critério de saída atendido: o ambiente reproduzível permite compilar Tauri 2 no Windows 11 x64.

## Fase 1 — Fundação

Estado: **Concluída**.

- [x] Criar scaffold Tauri 2 + React + TypeScript + Vite com npm.
- [x] Configurar TypeScript estrito e ESLint type-aware.
- [x] Configurar Vitest, Testing Library e CI para Windows.
- [x] Adicionar SQLite embarcado e migration técnica inicial.
- [x] Adicionar logging local.
- [x] Criar a estrutura de módulos prevista em `AGENTS.md`.
- [x] Criar documentação de arquitetura, dados, scheduling e importação/exportação.
- [x] Registrar ADRs das decisões fundamentais.
- [x] Validar lint, typecheck, testes, Rust, Clippy e build de release.
- [x] Executar a aplicação vazia e confirmar banco e log fora do Git.

Evidências principais:

- [architecture.md](architecture.md)
- [data-model.md](data-model.md)
- [migration inicial](../src-tauri/migrations/0001_initial.sql)
- [workflow de CI](../.github/workflows/ci.yml)

Critério de saída atendido: Checkpoints A, B, C e D confirmados, sem regras de negócio implementadas prematuramente.

## Fase 2 — Core

Estado: **Concluída**.

Ordem recomendada:

- [x] Detalhar o modelo de Project e Task antes da primeira migration de negócio.
- [x] Definir contratos, invariantes e erros explícitos em TypeScript puro.
- [x] Criar migration versionada para calendários, Project, Task e tags.
- [x] Testar banco novo e upgrade do schema anterior.
- [x] Implementar repositories e transações SQLite.
- [x] Implementar criação, edição, arquivamento e exclusão segura de projetos.
- [x] Implementar tarefas, status, prioridade, progresso, datas e duração.
- [x] Concluir ordenação/reordenação de projetos e tarefas na interface.
- [x] Implementar hierarquia, troca de pai e prevenção de ciclos de parentesco.
- [x] Estabelecer estado único compartilhável pelas views.
- [x] Entregar a primeira Tabela editável, com hierarquia e controles nativos de teclado.
- [x] Cobrir domínio, repositories, persistência e fluxos principais de UI.
- [x] Atualizar documentação e schema version.

Critérios de saída:

- Project e Task persistem sem perda de integridade.
- Hierarquia inválida é rejeitada antes da escrita.
- A Tabela permite criar e editar o núcleo dos dados.
- Banco novo e upgrade são testados.
- Lint, typecheck, testes e build passam.

Critério de saída atendido: o Core persiste com integridade, rejeita hierarquia
inválida, permite edição e reordenação na Tabela, migra bancos existentes e
passa pelos gates de qualidade. O Checkpoint Git 3 foi consolidado no commit
`1b3e9c6`.

## Fase 3 — Scheduling

Estado: **Concluída**.

- [x] Implementar datas `date-only` e calendário de trabalho em TypeScript puro.
- [x] Implementar fins de semana, feriados e exceções.
- [x] Implementar duração inclusiva em dias úteis.
- [x] Implementar edição assistida entre início, fim e duração.
- [x] Implementar grafo, detecção de ciclo e ordenação topológica.
- [x] Implementar dependência FS com lag e múltiplos predecessores.
- [x] Restringir dependências ao mesmo projeto e a tarefas-folha.
- [x] Implementar modos AUTO e MANUAL com conflitos informativos.
- [x] Implementar calendário opcional por tarefa e opção **Todos os dias**.
- [x] Implementar propagação reativa para frente e para trás em tarefas `AUTO`.
- [x] Recalcular e bloquear edição direta de tarefas-resumo.
- [x] Persistir calendário, relações e recalculações em transação.
- [x] Cobrir todos os 15 casos obrigatórios do scheduler.
- [x] Atualizar documentação e ADRs 009–010.

Critério de saída atendido: scheduler FS determinístico e isolado da UI, com
calendário efetivo, cadeia, ciclos, MANUAL/AUTO, resumos e rollback cobertos.

## Fase 4 — Views

Estado: **Concluída; pronta para commit local**.

- [x] Implementar Kanban por status com alternativa acessível ao drag-and-drop.
- [x] Implementar busca e filtros mínimos.
- [x] Avaliar biblioteca de Gantt por licença, manutenção, TypeScript, desempenho, acessibilidade e bundle.
- [x] Registrar a escolha de Gantt em ADR antes da integração.
- [x] Implementar Gantt com hierarquia, dependências e tarefas-resumo.
- [x] Garantir atualização imediata entre Tabela, Kanban e Gantt.
- [x] Validar que nenhuma view mantém uma cópia persistida de Task.
- [x] Cobrir interação e sincronização entre views.

Critério de saída atendido: as três views operam sobre a mesma fonte de verdade,
os filtros são compartilhados, o Gantt delega alterações ao scheduler e a
sincronização entre Kanban e Tabela está coberta por testes de UI.

Melhorias de UX não bloqueantes, como ação **Hoje**, enquadramento automático
do projeto, navegação entre as pontas de uma relação e densidade compacta do
Kanban, permanecem em backlog. Marcos, baseline e caminho crítico exigirão
decisões próprias e não fazem parte deste checkpoint.

## Fase 5 — Reutilização

Estado: **Planejada**.

- [ ] Duplicar tarefa isolada.
- [ ] Duplicar tarefa com descendentes.
- [ ] Reconstruir `parent_id` usando mapa de UUIDs.
- [ ] Preservar dependências internas e omitir externas por padrão.
- [ ] Duplicar projeto.
- [ ] Criar, persistir e aplicar templates.
- [ ] Validar o grafo antes de confirmar a transação.
- [ ] Cobrir duplicação, identidade e rollback com testes.

Critério de saída: cópias são independentes, mantêm estrutura interna válida e nunca compartilham identidade com a origem.

## Fase 6 — Portabilidade

Estado: **Planejada**.

- [ ] Finalizar e documentar o formato `.projectflow`.
- [ ] Exportar projeto.
- [ ] Exportar workspace completo.
- [ ] Validar manifest, schema, versão, integridade, tamanho e entradas.
- [ ] Impedir path traversal e execução de conteúdo importado.
- [ ] Importar por staging e transação, sem sobrescrita silenciosa.
- [ ] Implementar backup e restore locais.
- [ ] Testar round-trip semântico em workspace vazio.
- [ ] Atualizar [import-export.md](import-export.md).

Critério de saída: exportação e importação preservam semanticamente os dados e falhas relevantes revertem a operação inteira.

## Fase 7 — Hardening e distribuição Windows

Estado: **Planejada**.

- [ ] Medir 1.000 tarefas por projeto e 10.000 por workspace.
- [ ] Ajustar virtualização e processamento de subgrafos quando necessário.
- [ ] Revisar UX desktop, atalhos, foco, contraste e mensagens de erro.
- [ ] Implementar e executar o fluxo E2E mínimo.
- [ ] Avaliar e documentar MSI/NSIS e estratégia WebView2 offline.
- [ ] Gerar build release Windows x64 e instalador.
- [ ] Testar instalação em máquina Windows limpa sem toolchain.
- [ ] Validar funcionamento integralmente offline.
- [ ] Validar preservação de dados em atualização, reinstalação e desinstalação.
- [ ] Documentar instalação, atualização, desinstalação e recuperação.

Critério de saída: Checkpoint E concluído e critérios de aceite do MVP verificados em ambiente limpo.

## Checkpoints Git

| Checkpoint | Estado | Evidência atual |
| --- | --- | --- |
| 0 — Especificação inicial | Concluído | `c525351` — `Initial project setup` |
| 1 — Ambiente + scaffold | Concluído | `7b41a4a` — fundação consolidada |
| 2 — SQLite + migrations + qualidade | Concluído | `7b41a4a` — fundação consolidada |
| 3 — Project/Task core | Concluído | `1b3e9c6` |
| 4 — Scheduler FS | Concluído | `6f02673` |
| 5 — Tabela/Kanban/Gantt | Pronto para commit | entrega e documentação validadas, ainda não commitadas |
| 6 — Duplicação/templates | Planejado | — |
| 7 — Export/import/backup | Planejado | — |
| 8 — Empacotamento Windows | Planejado | — |

Os Checkpoints 1 e 2 foram consolidados no mesmo commit porque a primeira entrega validada incluiu scaffold, qualidade, SQLite e migrations. Futuros checkpoints podem conter vários commits pequenos e coerentes.

## Decisões previstas

Estas decisões ainda não bloqueiam o projeto, mas devem ser resolvidas antes do trabalho correspondente:

| Tema | Momento | Registro esperado |
| --- | --- | --- |
| Biblioteca ou estratégia da Tabela | Antes de adicionar uma dependência de grid | A base atual usa HTML nativo; ADR se uma dependência estrutural for necessária |
| Biblioteca de Gantt | Resolvida na Fase 4 | ADR 013 — SVAR React Gantt 2.7.1 |
| Formato final `.projectflow` | Antes da Fase 6 | `import-export.md` e ADR se necessário |
| Bundle WebView2 e instalador offline | Durante a Fase 7 | ADR de distribuição |

## Histórico de evolução

### 26 de agosto de 2026 — Estado zero

- Especificação inicial adicionada ao repositório.
- Commit: `c525351` — `Initial project setup`.
- Resultado: baseline recuperável contendo `AGENTS.md`.

### 26–27 de agosto de 2026 — Ambiente e fundação técnica

- Ambiente Windows e pré-requisitos do Tauri inspecionados e documentados.
- Node.js LTS, Rust MSVC, Build Tools e Windows SDK preparados.
- Scaffold Tauri 2 + React + TypeScript + Vite criado.
- Qualidade, testes, CI, logging, SQLite e migration inicial configurados.
- Aplicação vazia compilada e executada com banco e logs locais.
- Validações: ESLint, TypeScript, Vitest, Cargo fmt/check/test, Clippy, auditoria npm e build Tauri aprovados.
- Commit: `7b41a4a` — `chore: bootstrap ProjectFlow foundation`.
- Checkpoints: A, B, C, D e Git 1–2 concluídos.
- Resultado: base estável para iniciar o Core, sem funcionalidades de negócio antecipadas.

### 27 de agosto de 2026 — Registro vivo de evolução

- Roadmap executivo, checklists por fase e critérios de saída consolidados neste documento.
- Checkpoints Git e decisões futuras passaram a ter acompanhamento explícito.
- Processo de atualização definido para pessoas e agentes.
- Commit: `não commitado` no momento da criação deste registro.
- Resultado: a evolução futura pode ser acompanhada sem alterar ou duplicar a especificação principal.

### 27 de agosto de 2026 — Primeiro fluxo vertical do Core

- Modelo TypeScript estrito criado para calendários, projetos, tarefas e
  hierarquia, com mensagens destinadas ao usuário em português.
- Migration `0002_core.sql` adicionou calendários configuráveis, projetos,
  tarefas, tags normalizadas, chaves externas e índices.
- Persistência Tauri/SQLite implementada com transações para tags e exclusões.
- Interface em português permite criar, editar, arquivar e excluir projetos,
  além de criar tarefas/subtarefas e editar seus campos na Tabela.
- O calendário padrão usa segunda a sexta; o modelo aceita sábado e domingo sem
  mudança de schema.
- Validações: 16 testes TypeScript/React, 7 testes Rust/SQLite, lint, typecheck,
  build web, Cargo fmt, Clippy e build Tauri release aprovados.
- Reordenação de projetos e tarefas irmãs adicionada com atualização atômica das
  posições; ao trocar de pai, a tarefa recebe posição válida no novo grupo.
- O build real foi reaberto e comprovou a persistência do projeto/tarefa já
  existentes após recompilação e reinício.
- As decisões de interface em português e semana configurável foram registradas
  nos ADRs 007 e 008.
- Commit: `não commitado`.
- Checkpoint: Git 3 pronto para versionar, aguardando autorização do usuário
  para qualquer operação remota.
- Resultado: a Fase 2 está concluída localmente, sem avançar para scheduling.

### 27 de agosto de 2026 — Scheduling FS e calendários

- Funções puras `date-only` e de calendário implementadas com semana
  configurável, feriados, exceções positivas e duração inclusiva.
- Edição da Tabela calcula automaticamente o terceiro campo quando início,
  fim ou duração fornecem informações suficientes.
- Grafo FS implementado com validação, ciclo, ordenação topológica, lag,
  múltiplas predecessoras e propagação reativa do subgrafo afetado.
- Tarefas `AUTO` preservam duração e são deslocadas para a restrição FS mais
  tardia, inclusive quando ela fica anterior; tarefas
  `MANUAL` permanecem fixas e recebem conflito apenas quando uma predecessora
  declarada é violada.
- Calendário opcional por tarefa e calendário integrado **Todos os dias**
  permitem cadeias automáticas em sábado e domingo sem alterar o padrão do projeto.
- Tarefas-resumo passaram a derivar início e fim dos descendentes e bloqueiam
  edição temporal ou dependências diretas.
- Migration `0003_scheduling.sql` criou exceções e dependências com constraints,
  chaves estrangeiras e triggers para repetir as invariantes estruturais.
- `apply_schedule_changes` persiste calendários, dependências, tarefas e resumos
  em uma transação SQLite, com teste de rollback integral.
- Conflitos são reconstruídos ao carregar e recalculados por projeto sem sumir
  quando outra cadeia é editada.
- Validações finais: 48 testes TypeScript/React, 11 testes Rust/SQLite, lint,
  typecheck, build web, Cargo fmt/check, Clippy e build Tauri release aprovados.
- ADRs: 009 (política FS) e 010 (calendário efetivo por tarefa).
- Commit: `não commitado`.
- Checkpoint: Git 4 pronto para versionar após auditoria do usuário.
- Resultado: a Fase 3 está concluída localmente; a Fase 4 não foi iniciada.

### 28 de agosto de 2026 — Ajustes de UX após auditoria da Fase 3

- O painel **Detalhes** deixou de ficar limitado à largura da coluna Tarefa e
  passou a ocupar uma linha própria, com formulário responsivo em duas colunas.
- Alterações de lag deixaram de criar um botão ao lado do campo. O único botão
  **Salvar** da coluna Ações confirma os campos da tarefa e todos os lags
  modificados naquela linha.
- Tarefa, dependências atualizadas e recalculações são enviadas no mesmo
  `ScheduleChangeSet`; lag inválido impede a gravação de toda a linha.
- O campo Código recebeu ajuda contextual acessível, explicando que se trata de
  identificador visual opcional e independente do UUID interno.
- Testes de UI cobrem estrutura do painel, ajuda do código, salvamento único,
  atomicidade e rejeição integral de lag inválido.
- Ao reabrir o app nativo no ambiente visível ao agente, a verificação de
  integridade detectou que somente as mensagens internas de quatro triggers da
  migration 3 haviam sido traduzidas depois de sua primeira aplicação. O
  arquivo publicado foi restaurado byte a byte ao checksum daquele SQLite
  (`1617ADF38E69528743AE170C2D96C1544E5FE4E1C43784C104DAA8F1089FAB098DFF734928DBD6A76663CCB5D3926AA2`),
  preservando aquele banco sem recriação ou edição manual.
- Validações: 51 testes TypeScript/React, 11 testes Rust/SQLite, lint,
  typecheck, build web, Cargo fmt/check, Clippy, build Tauri release e abertura
  nativa com o banco existente aprovados.
- Commit: `não commitado`.
- Resultado: ajustes incorporados ao Checkpoint Git 4, sem iniciar a Fase 4.

### 28 de agosto de 2026 — Compatibilidade segura do release e do banco

- O diagnóstico com redirecionamento de `stderr` mostrou que o release existente
  incorporava a variante traduzida da migration 3, enquanto o banco ativo já
  registrava o checksum canônico. O executável estava desatualizado em relação
  ao arquivo restaurado.
- Um novo build com a migration canônica abriu normalmente e confirmou no log
  que os checksums já estavam atuais; nenhuma linha do banco precisou ser
  alterada e nenhum backup de reparo foi criado nessa execução.
- A migration canônica permaneceu imutável; nenhuma migration nova foi criada,
  pois não há mudança de schema.
- Como salvaguarda para um banco que possa ter sido criado pelo build alternativo,
  uma verificação anterior ao plugin SQL passou a aceitar somente os dois hashes
  conhecidos. Para a variante legada, ela verifica integridade, histórico,
  schema completo e dados estruturais da versão 3.
- Antes de qualquer reparo efetivo é criado um backup consistente em
  `%APPDATA%\com.projectflow.desktop\backups\`. Uma transação altera somente o
  checksum da migration 3; projetos, tarefas e dependências não entram em
  nenhuma instrução de atualização.
- Checksum, histórico ou schema inesperado falha de forma conservadora e sem
  backup ou escrita.
- Testes Rust cobrem os dois checksums, preservação dos dados no banco e no
  backup, recusa de valor desconhecido e recusa de schema divergente.
- A auditoria visual posterior encontrou o workspace vazio. A inspeção forense
  confirmou zero registros ativos e localizou nos bytes não alocados somente um
  projeto/tarefa anteriores à migration 3; os cinco itens relatados não foram
  encontrados em nenhum SQLite do usuário, da Lixeira ou dos perfis de sistema.
- Uma cópia binária do arquivo foi preservada em `.local/backups/` antes da
  investigação; nenhuma restauração parcial foi feita sem confirmação do usuário.
- ADR: 011 (compatibilidade controlada do checksum da migration 3).
- Commit: `não commitado`.
- Resultado: release volta a abrir e a investigação de recuperação permanece
  separada do Checkpoint Git 4, sem iniciar a Fase 4.

### 28 de agosto de 2026 — Base controlada para auditoria da Fase 3

- Com autorização do usuário, o workspace vazio recebeu o projeto **Auditoria
  do scheduler — Fase 3** com três tarefas-resumo e sete subtarefas.
- O grafo contém oito relações FS e exercita cadeia, lag zero e positivo,
  múltiplas predecessoras, feriado em 07/09, calendário **Todos os dias** e
  conflito informativo de uma tarefa manual.
- Uma cópia byte a byte do banco vazio foi criada antes do seed em
  `.local/backups/projectflow-pre-phase3-seed-20260828.sqlite`.
- A gravação ocorreu em uma única transação. `quick_check`, chaves estrangeiras,
  contagens, datas calculadas e reabertura do release foram validados.
- Depois da validação de persistência, uma cópia byte a byte do cenário pronto
  foi criada em
  `.local/backups/projectflow-phase3-audit-baseline-20260828.sqlite`, permitindo
  restaurar o ponto inicial dos testes manuais sem depender de dados versionados.
- O cenário e seus resultados esperados foram registrados em
  `docs/scheduling.md` para orientar auditorias futuras.
- Gates finais aprovados: 51 testes TypeScript/React, 16 testes Rust/SQLite,
  lint, typecheck, build web, Cargo fmt/check e Clippy.
- A base continua local e ignorada pelo Git; código-fonte, migrations e testes
  não dependem dela.
- Commit: `não commitado`.
- Resultado: existe novamente uma base real e reproduzível por descrição para a
  inspeção final do Checkpoint Git 4, sem iniciar a Fase 4.

### 28 de agosto de 2026 — Banco único para desenvolvimento e release local

- A abertura manual do release revelou que as cinco tarefas originais estavam
  preservadas no `AppData` real do usuário.
- O processo iniciado pelo Codex havia recebido a virtualização de `AppData` do
  pacote desktop e, por isso, enxergava uma segunda base com o cenário de
  auditoria. O executável e seu código eram os mesmos; o contexto do Windows era
  diferente.
- Builds debug e o novo release local de teste passaram a compartilhar
  `.local/data/projectflow.sqlite`. Builds de distribuição continuam usando o
  diretório oficial do perfil.
- A primeira abertura manual preserva o banco recuperado com `VACUUM INTO`,
  verifica origem, backup e cópia, e nunca sobrescreve uma base compartilhada
  existente.
- `npm run tauri:build:test` ativa a feature Cargo `shared-dev-data`; o binário
  resultante é apenas para auditoria no checkout local.
- Validações aprovadas: 51 testes TypeScript/React, 20 testes Rust/SQLite,
  typecheck, lint, build web, Cargo fmt/check, Clippy e build release local com a
  feature compartilhada.
- ADR: 012 (banco compartilhado para desenvolvimento e release local de teste).
- Commit: `não commitado`.
- Resultado: eliminada a divergência de dados entre usuário e agente sem mudar o
  schema ou iniciar a Fase 4.

### 28 de agosto de 2026 — Correção do release local de auditoria

- A primeira versão do script chamou `cargo build` diretamente e gerou o
  binário nativo com a feature correta, mas sem o pipeline do Tauri. Sem o Vite,
  a janela tentou acessar `localhost:1420` e exibiu
  `ERR_CONNECTION_REFUSED`.
- O script passou a usar
  `tauri build --no-bundle --features shared-dev-data`, que executa o build web
  configurado e incorpora `frontendDist` ao executável.
- A primeira abertura havia importado o banco recuperado, não o baseline de
  auditoria. Ele foi preservado em
  `.local/backups/projectflow-recovered-user-data-before-audit-switch-20260828.sqlite`
  e a base compartilhada recebeu o cenário **Auditoria do scheduler — Fase 3**.
- Hashes, conteúdo das duas bases e reabertura foram conferidos. O novo
  `project-flow.exe` iniciou sem servidor Vite, permaneceu responsivo e não
  produziu saída de erro.
- Commit: `não commitado`.
- Resultado: release local com frontend incorporado e apontando para a mesma
  base de testes de `tauri dev`, sem perda do banco recuperado.

### 28 de agosto de 2026 — Fase 4: filtros, Kanban e Gantt

- Tabela, Kanban e Gantt passaram a ser três projeções da mesma coleção de
  `Task`; nenhuma view criou tabela, repository ou persistência própria.
- Filtros compartilhados cobrem texto, status, prioridade, conclusão, intervalo
  de datas e tag. Ancestrais são preservados como contexto de hierarquia.
- O Kanban organiza cartões nas cinco colunas de status e permite movimentação
  tanto por drag-and-drop quanto pelo campo acessível **Status**.
- SVAR React Gantt 2.7.1 foi selecionado após avaliação de licença MIT,
  manutenção, React/TypeScript, hierarquia, dependências, desempenho,
  acessibilidade e bundle. A decisão está no ADR 013.
- O Gantt apresenta hierarquia, resumos, progresso, dependências FS, escalas de
  dias/semanas/meses, finais de semana e feriados. O renderer é somente leitura;
  início e duração são editados no painel do ProjectFlow e passam pelo scheduler.
- A numeração hierárquica `1.`, `1.1.`, `1.1.1.` passou a ser derivada da árvore
  e aparece nas três views sem alterar títulos nem o banco.
- A projeção temporal passou a converter o fim inclusivo do ProjectFlow para o
  limite exclusivo do renderer; resumos que atravessam o fim de semana agora
  ocupam todos os dias civis até a data final.
- Dependências podem ser isoladas por clique na linha ou pelo seletor acessível,
  com realce da predecessora e sucessora; a opção **Todas as dependências**
  restaura a visão completa.
- A janela principal foi configurada para iniciar maximizada no Windows.
- Código e CSS do Gantt são carregados sob demanda. O build final gerou chunks
  de aproximadamente 255 kB para a aplicação e 260 kB para o Gantt, além de CSS
  específico de 148 kB, todos antes de gzip.
- A primeira auditoria nativa encontrou uma tela branca ao abrir o Gantt: folhas
  eram marcadas como abertas na árvore interna da biblioteca. O adapter passou a
  abrir somente pais com filhos projetados, recebeu teste de regressão e a view
  ganhou uma barreira de erro para preservar o restante da aplicação.
- A auditoria final também encontrou o destaque visual sem atualização do
  inspetor ao clicar em uma barra. A seleção passou a ouvir a ação oficial
  `select-task` pela API do Gantt e recebeu teste de regressão de interface.
- Auditoria visual aprovou Kanban, Gantt diário/semanal, filtro de resumo sem
  filhos visíveis e bloqueio de prazo da tarefa-resumo, sem alterar o banco.
- Gates aprovados: 69 testes TypeScript/React, 20 testes Rust/SQLite, lint,
  typecheck, build web, auditoria npm sem vulnerabilidades, Cargo fmt/check,
  Clippy e build Tauri local com a feature de dados compartilhados.
- Nenhuma migration foi criada: a Fase 4 altera somente projeção e interação.
- Release local validado em
  `src-tauri/target/release/project-flow.exe`, com as dez tarefas do cenário de
  auditoria e sem servidor Vite.
- Commit: `não commitado`.
- Checkpoint: Git 5 pronto para auditoria do usuário e versionamento posterior.
- Resultado: a Fase 4 está concluída localmente; a Fase 5 não foi iniciada.

### 28 de agosto de 2026 — Revisão da propagação regressiva

- A auditoria manual identificou que antecipar o término de uma predecessora
  não liberava suas sucessoras automáticas, devido à política conservadora
  originalmente adotada no ADR 009.
- A política foi revisada explicitamente: tarefas `AUTO` com predecessoras
  agora ficam alinhadas à restrição FS mais tardia e podem ser deslocadas para
  frente ou para trás, preservando duração, calendário e lag.
- A antecipação segue em cascata pela ordem topológica e continua usando a
  restrição mais tardia quando existem múltiplas predecessoras.
- Tarefas `MANUAL` permanecem intocadas. Folgas intencionais pertencem ao lag;
  remover a última predecessora mantém a data atual por falta de nova âncora.
- Regressão de interface comprovada: reduzir o término da origem de 04/09 para
  02/09 antecipou a sucessora para 03/09 e a tarefa seguinte para 04/09 no
  mesmo `ScheduleChangeSet`.
- Nenhuma migration foi necessária; a mudança afeta somente a regra de domínio
  e usa a transação já existente.
- Gates aprovados: 69 testes TypeScript/React, 20 testes Rust/SQLite, lint,
  typecheck, build web, Cargo fmt/check, Clippy e build Tauri local.
- Commit: `não commitado`.
- Resultado: a correção foi incorporada ao Checkpoint Git 5 sem iniciar a Fase 5.

### 28 de agosto de 2026 — Fechamento documental da Fase 4

- README, ambiente, arquitetura, modelo de dados, scheduler, views,
  importação/exportação planejada, roadmap e ADRs foram auditados em conjunto.
- A documentação explicita a fonte única de verdade, numeração derivada, fim
  inclusivo, foco de dependência, início maximizado e propagação `AUTO` nos dois
  sentidos, sem atribuir persistência própria às views.
- Melhorias possíveis de Gantt e Kanban foram registradas como backlog não
  bloqueante; duplicação e templates permanecem exclusivamente na Fase 5.
- Nenhuma migration ou mudança de schema foi necessária; o schema permanece 3.
- Gates finais: 69 testes TypeScript/React, 20 testes Rust/SQLite, lint,
  typecheck, build web, Cargo fmt/check, Clippy e release local aprovados.
- Commit: `não commitado`; nenhuma operação remota foi executada.
- Resultado: Fase 4 concluída e Checkpoint Git 5 pronto para commit do usuário.

## Regras permanentes de acompanhamento

- Ler `AGENTS.md` e este documento antes de iniciar uma mudança não trivial.
- Confirmar `git status`, branch e histórico antes de editar.
- Trabalhar em um incremento delimitado de uma única fase.
- Não marcar um item como concluído sem evidência proporcional ao risco.
- Atualizar migrations, schema version e testes sempre que o banco mudar.
- Atualizar o histórico na mesma entrega que altera o estado do roadmap.
- Não apagar falhas ou decisões superadas; registrar a resolução em nova entrada.
- Não executar push, merge, tag ou release sem autorização explícita.
- Não avançar automaticamente para a fase seguinte após concluir um checkpoint.
