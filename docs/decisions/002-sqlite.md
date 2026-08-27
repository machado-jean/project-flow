# ADR 002 — SQLite como fonte local de verdade

- Status: aceito
- Data: 2026-08-26

## Contexto

A V1 é offline, precisa de transações, integridade relacional, migrations e portabilidade entre computadores.

## Decisão

Usar SQLite embarcado por meio do plugin SQL oficial do Tauri. Toda evolução de schema terá migration versionada e testes de banco novo/preservação.

## Consequências

Não existe servidor de banco. Dados ficam no perfil do usuário, separados do executável e do código-fonte. Exportação futura empacotará uma cópia consistente, nunca o arquivo ativo sem coordenação.
