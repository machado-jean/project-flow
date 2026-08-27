# Modelo de dados

## Estado implementado

A fundação contém somente a tabela técnica `app_metadata`:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `key` | `TEXT` | chave primária, não vazia |
| `value` | `TEXT` | obrigatório |

O registro `schema_version = 1` permite verificar a migration inicial. A tabela usa `STRICT` e `WITHOUT ROWID` para manter tipos previsíveis e evitar estrutura desnecessária.

## Modelo planejado, ainda não implementado

A Fase 2 deverá introduzir migrations próprias para projetos e tarefas. Fases posteriores incluirão dependências, calendários, feriados, templates e estruturas necessárias a importação/exportação.

Princípios já definidos:

- UUIDs imutáveis;
- uma única entidade de tarefa projetada em Tabela, Kanban e Gantt;
- hierarquia por `parent_id`, sem ciclos;
- dependências como entidade própria;
- datas de cronograma em `YYYY-MM-DD`, sem timezone;
- timestamps somente para auditoria técnica;
- foreign keys e operações multi-entidade executadas em transação;
- toda alteração de schema por migration nova e imutável.

O schema de negócio será detalhado antes de sua primeira migration. Este documento não antecipa tabelas ou índices sem os testes de domínio correspondentes.
