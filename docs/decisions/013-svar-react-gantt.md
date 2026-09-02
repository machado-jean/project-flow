# ADR 013 — SVAR React Gantt como projeção temporal

- Estado: Aceita
- Data: 28 de agosto de 2026

## Contexto

A Fase 4 exige um Gantt com hierarquia, barras, progresso, dependências FS,
tarefas-resumo, escala temporal, zoom e seleção. `AGENTS.md` proíbe criar um
renderer completo sem justificativa e exige avaliar licença, manutenção,
TypeScript, React, desempenho, edição, acessibilidade, bundle e customização.

O scheduler TypeScript e o SQLite já são as fontes de verdade. Uma biblioteca de
Gantt não pode recalcular ou persistir um segundo cronograma em paralelo.

## Alternativas avaliadas

### SVAR React Gantt 2.7.1

- licença MIT e repositório público ativo;
- componente React com declarações TypeScript e suporte a React 18 ou superior;
- hierarquia, tarefas-resumo, dependências, progresso, escalas e virtualização;
- eventos e propriedades suficientes para seleção, zoom e realce de células;
- grid exposto à tecnologia assistiva, enquanto o ProjectFlow fornece um painel
  próprio para seleção e edição segura;
- CSS e código do Gantt podem ser carregados sob demanda.

### Frappe Gantt 1.2.2

- licença MIT e bundle pequeno;
- integração imperativa, sem componente React e sem hierarquia de tarefas
  equivalente à requerida;
- exigiria mais código de adaptação, foco e acessibilidade mantido pelo projeto.

### gantt-task-react

- API React/TypeScript simples;
- sinais de manutenção e evolução mais fracos para uma dependência estrutural;
- menor aderência aos requisitos de hierarquia e extensibilidade da Fase 4.

## Decisão

Adotar `@svar-ui/react-gantt` **2.7.1**, fixado exatamente no `package.json` e
instalado somente no projeto.

O ProjectFlow converte `Task` e `TaskDependency` para uma projeção transitória;
nenhuma entidade própria do Gantt é persistida. Além do painel lateral, os
eventos finais de mover/redimensionar e criar ligação são interceptados pela API
do renderer. Eles são validados pelo domínio, passam pelo scheduler e usam a
mesma operação transacional da Tabela; o estado interno do SVAR é descartado e
reprojetado após sucesso ou falha.

O evento visual final é aceito para não devolver a barra imediatamente à origem.
O ProjectFlow persiste movimento, término e conclusão; em falha, força nova
projeção. Eventos com `eventSource`, gerados internamente pelo SVAR ao atualizar
resumos, seguem apenas dentro do renderer e nunca são persistidos como comandos
do usuário.

O contrato `date-only` do ProjectFlow trata o fim como inclusivo, enquanto o
renderer trata `end` como limite exclusivo. O adaptador soma um dia civil ao
fim somente na projeção e não envia simultaneamente `duration`; a duração útil
permanece em um campo informativo próprio. Isso preserva finais de semana e
feriados dentro da extensão visual exata da barra.

Relações existentes podem ser isoladas por seletor ou clique no hitbox oficial
da linha. Uma nova ligação visual aceita somente FS com lag zero e tarefas
executáveis do mesmo projeto; auto-dependência, resumo, duplicidade e ciclo são
rejeitados antes da persistência. Lag e remoção continuam na Tabela.

Tarefas livres podem ser movidas ou redimensionadas. Em tarefa com predecessora,
início e movimento completo são bloqueados: somente a borda final pode mudar a
duração, e o scheduler propaga o novo fim aos sucessores. Resumos não são
editáveis. O inspetor permanece a alternativa operável por teclado.

Finais de semana e feriados são destacados pelo calendário do ProjectFlow. Não
adotamos o calendário ou o agendamento automático da edição PRO da biblioteca:
isso duplicaria regras que pertencem ao domínio. Tarefas sem cronograma são
informadas e permanecem acessíveis na Tabela e no seletor do painel.

O Gantt e seu CSS são carregados sob demanda ao abrir a view. No build final da
Fase 4, o chunk principal ficou com aproximadamente 255 kB e o chunk do Gantt
com 260 kB antes de gzip; o CSS específico do Gantt ficou isolado em cerca de
148 kB.

## Consequências

- A Fase 4 ganha um renderer maduro sem duplicar scheduling ou persistência.
- A dependência adiciona seus pacotes SVAR transitivos ao lockfile.
- A interceptação exige testes de integração para garantir que drag/resize não
  contorne calendários, predecessoras, tarefas manuais ou tarefas-resumo.
- A Tabela continua sendo a referência acessível completa; Kanban e o painel do
  Gantt oferecem caminhos por teclado para as ações essenciais.
- O seletor **Dependência em foco** oferece alternativa de teclado ao clique na
  linha e reduz cruzamentos visualmente, sem manter um renderer próprio.
- Atualizações da biblioteca devem repetir a avaliação de licença,
  compatibilidade, regressões visuais e impacto no bundle.

## Referências

- [Visão geral oficial do SVAR React Gantt](https://docs.svar.dev/react/gantt/overview/)
- [Repositório e licença](https://github.com/svar-widgets/react-gantt)
- [Escalas](https://docs.svar.dev/react/gantt/api/properties/scales/)
- [Configuração de ações](https://docs.svar.dev/react/gantt/guides/configuration/prevent_actions/)
