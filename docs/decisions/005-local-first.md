# ADR 005 — Arquitetura local-first e offline

- Status: aceito
- Data: 2026-08-26

## Contexto

O produto deve funcionar sem internet, manter dados privados na máquina e continuar utilizável sem serviços externos.

## Decisão

Executar interface, domínio, persistência e logs localmente. Dados só saem da máquina por ação explícita de exportação futura.

## Consequências

Não há telemetria remota por padrão nem dependência de API para telas principais. Backup, importação e exportação serão operações locais explícitas.
