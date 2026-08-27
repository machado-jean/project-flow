# Roadmap e registro de evolução

Este é o registro vivo de execução do ProjectFlow. Ele traduz o roadmap definido em `AGENTS.md` em fases acompanháveis, checkpoints verificáveis e um histórico cronológico das entregas.

`AGENTS.md` continua sendo a fonte de verdade para produto, arquitetura e regras operacionais. Este documento não substitui a especificação e não deve introduzir escopo incompatível com ela.

Última atualização: **27 de agosto de 2026**.

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
| Etapa do produto | Core concluído localmente |
| Fase ativa | Nenhuma; aguardando checkpoint Git e início explícito da Fase 3 |
| Próxima fase | Fase 3 — Scheduling |
| Versão da aplicação | `0.1.0` |
| Versão do schema SQLite | `2` |
| Último commit estável | `860b9e2` — `Document roadmap tracking in README` |
| Branch de trabalho | `main`, com o recorte atual ainda não commitado |
| Checkpoints obrigatórios | A, B, C e D concluídos; E reservado à distribuição |
| Funcionalidades de negócio | Primeiro fluxo vertical de Project/Task implementado |

## Visão geral das fases

| Fase | Objetivo | Estado | Checkpoint Git | Critério principal de saída |
| --- | --- | --- | --- | --- |
| 0 — Ambiente | Preparar e documentar o toolchain Windows | Concluída | 1 | Pré-requisitos oficiais instalados e validados |
| 1 — Fundação | Criar shell, qualidade, persistência e documentação | Concluída | 1 e 2 | Aplicação vazia executa, testes passam e SQLite migra |
| 2 — Core | Implementar Project, Task, hierarquia e Tabela inicial | Concluída | 3 | Core persistido e editável com integridade e testes |
| 3 — Scheduling | Implementar calendário, dependência FS e propagação | Planejada | 4 | Scheduler FS estável e coberto pelos casos obrigatórios |
| 4 — Views | Entregar Kanban, Gantt e filtros sincronizados | Planejada | 5 | As views projetam a mesma tarefa sem duplicar dados |
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

Estado: **Concluída localmente**.

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
passa pelos gates de qualidade. O Checkpoint Git 3 aguarda apenas o commit local
e o push autorizado pelo usuário.

## Fase 3 — Scheduling

Estado: **Planejada**.

- [ ] Implementar datas `date-only` e calendário de trabalho em TypeScript puro.
- [ ] Implementar fins de semana, feriados e exceções.
- [ ] Implementar duração inclusiva em dias úteis.
- [ ] Implementar grafo, detecção de ciclo e ordenação topológica.
- [ ] Implementar dependência FS com lag e múltiplos predecessores.
- [ ] Implementar modos AUTO e MANUAL.
- [ ] Implementar propagação conservadora somente para frente.
- [ ] Recalcular tarefas-resumo.
- [ ] Persistir recalculações em transação.
- [ ] Cobrir todos os 15 casos obrigatórios do scheduler.
- [ ] Atualizar [scheduling.md](scheduling.md).

Critério de saída: scheduler FS determinístico, isolado da UI e estável sob cadeia, calendário, ciclos, MANUAL/AUTO e transações.

## Fase 4 — Views

Estado: **Planejada**.

- [ ] Implementar Kanban por status com alternativa acessível ao drag-and-drop.
- [ ] Implementar busca e filtros mínimos.
- [ ] Avaliar biblioteca de Gantt por licença, manutenção, TypeScript, desempenho, acessibilidade e bundle.
- [ ] Registrar a escolha de Gantt em ADR antes da integração.
- [ ] Implementar Gantt com hierarquia, dependências e tarefas-resumo.
- [ ] Garantir atualização imediata entre Tabela, Kanban e Gantt.
- [ ] Validar que nenhuma view mantém uma cópia persistida de Task.
- [ ] Cobrir interação e sincronização entre views.

Critério de saída: as três views operam sobre a mesma fonte de verdade e permanecem consistentes.

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
| 3 — Project/Task core | Pronto para versionar | entrega validada, ainda não commitada |
| 4 — Scheduler FS | Planejado | — |
| 5 — Tabela/Kanban/Gantt | Planejado | — |
| 6 — Duplicação/templates | Planejado | — |
| 7 — Export/import/backup | Planejado | — |
| 8 — Empacotamento Windows | Planejado | — |

Os Checkpoints 1 e 2 foram consolidados no mesmo commit porque a primeira entrega validada incluiu scaffold, qualidade, SQLite e migrations. Futuros checkpoints podem conter vários commits pequenos e coerentes.

## Decisões previstas

Estas decisões ainda não bloqueiam o projeto, mas devem ser resolvidas antes do trabalho correspondente:

| Tema | Momento | Registro esperado |
| --- | --- | --- |
| Biblioteca ou estratégia da Tabela | Antes de adicionar uma dependência de grid | A base atual usa HTML nativo; ADR se uma dependência estrutural for necessária |
| Biblioteca de Gantt | Antes da Fase 4 | ADR obrigatório |
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
