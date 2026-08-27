# ADR 001 — Tauri 2 como shell desktop

- Status: aceito
- Data: 2026-08-26

## Contexto

ProjectFlow precisa de uma aplicação Windows instalável, offline e com integração segura a filesystem e SQLite, sem exigir toolchain no computador do usuário final.

## Decisão

Usar Tauri 2 como shell desktop, React/Vite no WebView2 e Rust somente na camada nativa necessária.

## Consequências

O build de desenvolvimento exige Rust MSVC, Build Tools, Windows SDK e WebView2. A distribuição incorpora o frontend compilado e não depende de servidor web remoto.
