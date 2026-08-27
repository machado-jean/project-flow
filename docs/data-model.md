# Modelo de dados

## Estado implementado

O schema atual é a versão **2**.

| Migration | Conteúdo |
| --- | --- |
| `0001_initial.sql` | `app_metadata` e `schema_version = 1` |
| `0002_core.sql` | calendários, projetos, tarefas e tags; atualiza para versão 2 |

As tabelas usam o modo `STRICT`. Chaves externas são habilitadas em todas as
conexões e as migrations são crescentes e imutáveis.

## Entidades

### Calendário

`calendars` armazena identidade, nome, indicador de padrão e timestamps.
`calendar_working_days` armazena os dias úteis normalizados como números de 1 a
7, de segunda a domingo. O calendário inicial contém segunda a sexta, mas o
modelo aceita sábado e domingo sem migration futura.

Ainda não existem feriados e exceções; pertencem à Fase 3.

### Projeto

`projects` possui UUID imutável, nome, descrição opcional, status, calendário,
posição, arquivamento e timestamps. Os status internos atuais são:

| Código persistido | Rótulo da interface |
| --- | --- |
| `ACTIVE` | Ativo |
| `ON_HOLD` | Em espera |
| `COMPLETED` | Concluído |
| `CANCELLED` | Cancelado |

O arquivamento é reversível. A exclusão é definitiva e remove suas tarefas por
cascade depois de confirmação na interface.

### Tarefa

`tasks` possui UUID imutável, código opcional, projeto, tarefa-pai, título,
descrição, status, prioridade, progresso, datas, duração, modo de agendamento,
posição, responsável livre opcional, observações e timestamps.

Regras atuais:

- progresso é inteiro entre 0 e 100;
- status: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, `CANCELLED`;
- prioridade: `LOW`, `NORMAL`, `HIGH`, `CRITICAL`;
- modo de agendamento: `AUTO` ou `MANUAL`;
- uma tarefa pode não estar agendada; quando estiver, início, fim e duração são
  obrigatórios em conjunto;
- datas de cronograma usam `YYYY-MM-DD`, sem timezone;
- duração é inteira e maior ou igual a 1;
- fim não pode ser anterior ao início;
- pai e filho devem pertencer ao mesmo projeto;
- auto-parentesco é bloqueado pelo banco e ciclos mais longos são rejeitados no
  domínio antes da escrita;
- excluir uma tarefa remove toda a sua árvore em transação.

As tags são normalizadas em `tags` e `task_tags`, com comparação sem distinção
de maiúsculas/minúsculas. Não há JSON duplicando tags dentro de `tasks`.

## Integridade e evolução

- `projects.calendar_id` usa `ON DELETE RESTRICT`;
- tarefas usam chaves compostas para impedir pai de outro projeto;
- tarefas e tags associadas usam cascades controlados;
- índices atendem hierarquia/ordenação, status, prioridade, datas e busca por tag;
- banco novo e upgrade da versão 1 para 2 são cobertos por testes;
- o teste de upgrade comprova que os dados técnicos existentes são preservados;
- dependências FS, feriados, exceções, templates e importação/exportação ainda
  receberão migrations próprias nas fases correspondentes.
