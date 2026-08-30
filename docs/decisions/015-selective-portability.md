# ADR 015 — Pacote SQLite com importação seletiva por agregado

Data: 29 de agosto de 2026  
Estado: aceito

## Contexto

O usuário precisa transportar vários projetos entre computadores, atualizar um projeto já conhecido e poder importar somente parte de um workspace. Um merge tarefa a tarefa teria semântica ambígua para exclusões, hierarquia, calendários e dependências.

## Decisão

Usar `.projectflow` como ZIP estrito contendo manifest, snapshot SQLite e README. A prévia validada lista projetos e templates individualmente.

Projeto selecionado é tratado como agregado:

- UUID ausente: inserir preservando identidades;
- UUID existente: substituir integralmente somente o projeto, como padrão;
- cópia solicitada: remapear todas as identidades e relações internas.

Templates também são agregados substituíveis por UUID. Calendários são dependências compartilhadas: importar se ausentes, reutilizar se equivalentes e copiar/remapear quando houver colisão semântica.

Criar backup verificado antes de toda importação ou restauração. Importação seletiva e restauração integral permanecem fluxos separados.

O processo nativo usa `tauri-plugin-dialog`, `zip`, `sha2`, `uuid` e `chrono`, todos locais ao projeto. A versão 1 aceita apenas entradas armazenadas sem compressão, reduzindo superfície de ataque e dependências de codecs.

## Consequências

- Atualizações preservam exclusões e relações exatamente como foram exportadas.
- Projetos locais não selecionados permanecem intactos.
- A cópia é independente e não compartilha UUIDs com a origem.
- Não há merge seletivo de campos entre duas versões da mesma tarefa; isso exigirá um fluxo explícito de comparação no futuro.
- Pacotes de schema ou formato futuro são recusados até existir migração deliberada.
