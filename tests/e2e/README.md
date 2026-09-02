# Testes E2E

O fluxo mínimo definido no `AGENTS.md` é validado por um gate em duas camadas:

```powershell
npm run test:e2e
```

1. `test:e2e:application` percorre pela interface React a criação de projeto,
   tarefas e subtarefa, cadeia A → B → C, propagação de datas, troca entre
   Tabela/Kanban/Gantt, duplicação de árvore, exportação, workspace vazio,
   importação e comparação semântica;
2. `test:e2e:native` executa os testes Rust reais de SQLite, migrations,
   transações, backup e pacotes `.projectflow`.

A primeira camada usa um repositório em memória dedicado ao teste. Isso permite
que o cenário funcional seja determinístico e seguro, enquanto a segunda camada
comprova separadamente a fronteira nativa e persistente. Ambas bloqueiam o CI.

## Diagnóstico da janela Tauri

O projeto preserva um harness experimental para dirigir o WebView2 real por CDP:

```powershell
npm run test:e2e:desktop
```

Ele compila um executável `debug` com a feature Cargo `e2e`, isola banco,
backups, logs e artefatos em `.local/e2e/` e injeta caminhos determinísticos
para os diálogos de exportação/importação. A feature não é ativada no build de
produção.

Esse comando é somente diagnóstico. No WebView2 151 deste host, assim como no
relato upstream para versões 150+, a criação da janela automatizada falha com
`HRESULT 0x800700AA` (“recurso solicitado em uso”). O problema ocorre tanto com
o driver oficial quanto ao habilitar CDP e não é tratado com downgrade do
runtime, patch não publicado ou alteração global do Windows.

Quando a correção upstream chegar a uma versão estável de Tauri/Wry/WebView2, o
harness deve ser revalidado antes de ser promovido novamente a gate obrigatório.

O protocolo completo de isolamento, repetição, diagnóstico, validação em VM e
critérios para promoção ao CI está em
[Diretrizes de validação do WebView2](../../docs/webview2-testing.md). Ele deve
ser seguido antes de alterar o runtime, as dependências ou o status deste gate.

Referências:

- [Tauri — WebDriver](https://v2.tauri.app/develop/tests/webdriver/)
- [Regressão WebView2 150+](https://github.com/webdriverio/desktop-mobile/issues/542)
- [Microsoft — flags do WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags)
- [Playwright — connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
- [Microsoft — User Data Folder](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder)
- [Microsoft — Evergreen versus Fixed Version](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version)
