# ADR 003 — Domínio em TypeScript puro

- Status: aceito
- Data: 2026-08-26

## Contexto

Scheduling, calendário, duplicação e validação exigem muitos testes e não dependem de recursos nativos.

## Decisão

Implementar regras de negócio em TypeScript estrito, em módulos puros e independentes de React, DOM e Tauri.

## Consequências

React apresenta e coordena interação; Rust fornece capacidades nativas. Regras críticas não ficam em componentes nem são duplicadas entre views.
