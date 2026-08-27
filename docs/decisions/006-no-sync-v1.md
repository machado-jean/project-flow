# ADR 006 — Sem sincronização na V1

- Status: aceito
- Data: 2026-08-26

## Contexto

Sincronização acrescentaria contas, autenticação, resolução de conflitos, backend remoto e riscos à integridade antes de o domínio local estar estabilizado.

## Decisão

Não implementar sync, colaboração online, contas ou backend remoto na V1.

## Consequências

A migração entre computadores será feita por exportação/importação. Qualquer sincronização futura exigirá nova decisão arquitetural explícita.
