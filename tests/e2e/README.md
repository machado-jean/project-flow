# Testes E2E

O fluxo mínimo está definido no `AGENTS.md`: criar projeto, tarefas,
subtarefas e cadeia A → B → C; propagar uma alteração; alternar views;
duplicar; exportar; importar em workspace vazio e comparar o resultado.

## Estado na Fase 7

O caminho recomendado atualmente pela documentação oficial do Tauri é
WebdriverIO com `@wdio/tauri-service` e o provider incorporado. A combinação
publicada em 30/08/2026 (`@wdio/tauri-service` 1.3.0 e WebdriverIO 9.31.x) foi
testada somente como resolução de dependências e removida: ela introduziu 15
alertas npm de severidade alta em ferramentas de desenvolvimento.

Não executar `npm audit fix --force`: a correção proposta faz downgrade para
uma linha incompatível. O projeto permanece sem os plugins WDIO e com auditoria
limpa. A implementação E2E nativa deve ser retomada quando houver uma resolução
compatível e sem esses alertas, sempre com:

- feature Cargo exclusiva de E2E;
- permissões Tauri exclusivas do build de teste;
- banco isolado sob `.local/e2e/`;
- nenhum plugin WebDriver no executável de produção;
- limpeza determinística somente do banco E2E;
- execução local e no CI Windows.

Fontes:

- [Tauri — WebDriver](https://v2.tauri.app/develop/tests/webdriver/)
- [WebdriverIO — Tauri plugin setup](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup/)
