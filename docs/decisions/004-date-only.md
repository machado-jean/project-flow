# ADR 004 — Datas de cronograma sem horário

- Status: aceito
- Data: 2026-08-26

## Contexto

Tarefas são planejadas em dias úteis. Timestamps e conversões de timezone introduzem mudanças de dia que não representam o domínio.

## Decisão

Persistir datas de cronograma como texto `YYYY-MM-DD`. Duração `1` corresponde ao mesmo dia útil de início e fim.

## Consequências

Operações de calendário devem usar funções próprias de `date-only`. Timestamps ISO continuam permitidos para auditoria técnica, não para datas do cronograma.
