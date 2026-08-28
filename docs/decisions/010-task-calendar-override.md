# ADR 010 — Calendário efetivo por tarefa

## Estado

Aceita em 27 de agosto de 2026.

## Contexto

O calendário padrão de segunda a sexta atende a maior parte do planejamento,
mas uma atividade específica pode ocorrer no fim de semana. Digitar uma data
manual de sábado deve ser permitido, enquanto uma cadeia automática só deve
usar sábado e domingo quando isso tiver sido declarado.

## Decisão

Cada tarefa herda o calendário do projeto quando `calendar_id` é nulo e pode
selecionar outro calendário por override. A migration da Fase 3 cria o
calendário integrado **Todos os dias**, com segunda a domingo.

O scheduler calcula a restrição FS e a duração usando o calendário efetivo da
sucessora. Assim, uma predecessora que termina sexta com lag zero leva uma
sucessora comum para segunda, mas leva uma sucessora configurada com **Todos os
dias** para sábado.

Datas não úteis digitadas explicitamente em tarefas `MANUAL` são preservadas e
recebem aviso. Alterações do calendário recalculam tarefas `AUTO` afetadas e
seus sucessores em uma transação que também inclui a própria configuração do
calendário.

## Consequências

- trabalho de fim de semana é opt-in e visível por tarefa;
- o projeto mantém um padrão simples sem impedir exceções operacionais;
- calendários são compartilháveis e a UI deve informar que uma alteração afeta todos os seus usuários;
- feriados e exceções positivas podem alterar datas específicas;
- o calendário selecionado precisa existir e não pode ser removido enquanto estiver em uso;
- a UI futura poderá permitir calendários adicionais sem mudar o modelo de tarefa.
