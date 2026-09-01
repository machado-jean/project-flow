# ADR 019 — E2E em camadas e diagnóstico da janela Tauri

## Estado

Aceita em 1º de setembro de 2026 para a Fase 7.

## Contexto

O MVP exige um fluxo automatizado mínimo e uma validação real da persistência.
A recomendação oficial atual do Tauri para dirigir a aplicação Windows é
WebdriverIO com `@wdio/tauri-service`. A resolução avaliada trouxe 15 alertas
npm de severidade alta. O driver externo e o provider incorporado também foram
testados diretamente.

No WebView2 151 deste host, criar a janela com automação habilitada falha com
`HRESULT 0x800700AA`. A regressão é reproduzida desde o WebView2 150 e está
registrada no issue `webdriverio/desktop-mobile#542`. O mesmo bloqueio ocorre ao
usar `--remote-debugging-port` para conexão CDP por `playwright-core`.

Tratar isso com downgrade global do WebView2, dependências vulneráveis ou patch
Tauri/Wry ainda não publicado aumentaria o risco do release e da máquina do
usuário.

## Decisão

O gate obrigatório `npm run test:e2e` será composto por:

1. uma jornada de aplicação em Vitest + Testing Library, sobre React, estado e
   domínio reais, usando um repositório em memória específico do teste;
2. a suíte Rust real, que cobre SQLite, migrations, transações, backups e
   exportação/importação `.projectflow`.

A jornada cobre criação de projeto, tarefas e subtarefa, A → B → C, propagação,
Tabela/Kanban/Gantt, duplicação, exportação, workspace vazio, importação e
comparação semântica. As duas camadas são obrigatórias no CI Windows.

O harness CDP permanece versionado como `npm run test:e2e:desktop`, mas é
diagnóstico e não bloqueante até a correção upstream. Sua feature Cargo `e2e`:

- usa banco, backups e logs sob `.local/e2e/`;
- recebe destinos de exportação/importação apenas no processo de teste;
- abre a porta CDP apenas na configuração gerada em `.local/e2e/`;
- não é ativada no executável ou nos instaladores de produção.

## Alternativas rejeitadas

- **Usar o runner vulnerável:** contraria a política de dependências e mantém a
  regressão do runtime.
- **Fixar WebView2 antigo ou alterar políticas globais:** muda o ambiente do
  usuário e não representa máquinas Windows atualizadas.
- **Aplicar patch Tauri/Wry não lançado:** introduz código não estabilizado no
  produto na véspera do release.
- **Ignorar persistência nativa:** deixaria migrations e portabilidade sem
  validação real.
- **Automação por coordenadas:** é frágil e inadequada ao CI.

## Consequências

- O release possui um gate automatizado reproduzível e sem acesso aos dados do
  usuário.
- Nenhum teste isolado afirma atravessar sozinho UI, IPC e SQLite; a cobertura
  é deliberadamente composta e documentada.
- A instalação, abertura, atualização e preservação de dados na VM continuam
  sendo critérios manuais antes de concluir a Fase 7.
- O harness desktop pode voltar ao gate sem reescrever o cenário quando a
  correção chegar às versões estáveis.

## Fontes

- [Tauri — WebDriver](https://v2.tauri.app/develop/tests/webdriver/)
- [Regressão WebView2 150+](https://github.com/webdriverio/desktop-mobile/issues/542)
- [Microsoft — flags do WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags)
- [Playwright — connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
