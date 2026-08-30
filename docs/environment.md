# Ambiente de desenvolvimento

Inspeção e bootstrap executados em 26 de agosto de 2026, no Windows 11 Pro x64 25H2, build `26200.9168`. O campo legado `ProductName` do Registro ainda reporta “Windows 10 Pro”; arquitetura e build confirmam o ambiente Windows 11 x64 informado para o projeto.

## Critério de versões

A seleção seguiu a ordem definida em `AGENTS.md`: compatibilidade, estabilidade, manutenção e atualidade.

- Tauri requer Microsoft C++ Build Tools, WebView2, Rust MSVC e Node LTS no Windows ([pré-requisitos oficiais](https://v2.tauri.app/start/prerequisites/)).
- O scaffold foi criado com o utilitário oficial `create-tauri-app` ([guia oficial](https://v2.tauri.app/start/create-project/)).
- Node 24 é a linha Active LTS escolhida; foi usado o patch x64 disponível no índice oficial em 26/08/2026 ([releases do Node](https://nodejs.org/en/about/previous-releases), [distribuição 24.x](https://nodejs.org/dist/latest-v24.x/)).
- Rust 1.98.0 é stable e foi instalado pelo Rustup oficial com o host MSVC x64 ([anúncio 1.98.0](https://blog.rust-lang.org/2026/08/20/Rust-1.98.0/), [instalação](https://www.rust-lang.org/tools/install)).
- Vite 8.2 é suportado e aceita Node `^20.19 || >=22.12` ([política de releases](https://vite.dev/releases)).
- React 19.2 é a linha estável atual ([versões do React](https://react.dev/versions)).
- TypeScript 7.0.2 não foi adotado porque `typescript-eslint` 8.68.0 declara suporte a TypeScript `<6.1.0`. TypeScript 6.0.3 é a versão estável mais recente dentro da faixa compatível.

## Ferramentas-base

| Ferramenta | Versão validada | Escopo | Situação/origem | Verificação |
| --- | --- | --- | --- | --- |
| Windows | 11 Pro x64 25H2, build 26200.9168 | sistema | existente | Registro `CurrentVersion` |
| Git for Windows | 2.55.0.windows.3 | máquina | existente; não reinstalado | `git --version` |
| Node.js | 24.20.0 LTS x64 | máquina | instalado pelo MSI oficial | `node --version` |
| npm | 11.19.0 | máquina, fornecido pelo Node | instalado com Node; não atualizado separadamente | `npm --version` |
| Rustup | 1.29.0 | usuário | instalador oficial x64 | `rustup --version` |
| Rust | 1.98.0 stable MSVC | usuário | alias `stable` e toolchain exato `1.98.0-x86_64-pc-windows-msvc`, selecionado por `rust-toolchain.toml` | `rustc --version` e `rustup toolchain list -v` |
| Cargo | 1.98.0 | usuário | fornecido pelo toolchain Rust | `cargo --version` |
| Visual Studio Build Tools | 2026 Stable 18.9.2 (`18.9.12120.119`) | máquina | canal oficial Stable | `vswhere` |
| MSVC x64/x86 | toolset 14.51.36231; `cl` 19.51.36256.0 | máquina | workload `Microsoft.VisualStudio.Workload.VCTools` | `vswhere` e versão de `cl.exe` |
| Windows 11 SDK | 10.0.26100.0 | máquina | componente recomendado do workload C++ | `vswhere` e `Windows Kits` |
| WebView2 Runtime | 151.0.4129.107 | máquina | existente; não reinstalado | Registro `EdgeUpdate` |

O Build Tools foi instalado pelo canal Stable oficial, com o workload “Desktop development with C++” e componentes recomendados ([componentes oficiais](https://learn.microsoft.com/en-us/visualstudio/install/workload-component-id-vs-build-tools?view=visualstudio)). O WebView2 existente já atendia ao requisito e foi preservado.

VBSCRIPT é necessário somente para gerar MSI. A Fase 7 escolheu NSIS para a V1,
portanto o recurso não foi habilitado nem alterado.

## Dependências locais principais

| Pacote/componente | Versão resolvida | Licença | Uso |
| --- | --- | --- | --- |
| create-tauri-app | 4.6.2 | MIT/Apache-2.0 | scaffold temporário via npm; não instalado globalmente |
| @tauri-apps/cli | 2.11.4 | MIT/Apache-2.0 | CLI local |
| Tauri (crate) | 2.11.5 | MIT/Apache-2.0 | shell desktop |
| tauri-build | 2.6.3 | MIT/Apache-2.0 | build nativo |
| React / React DOM | 19.2.8 | MIT | apresentação |
| TypeScript | 6.0.3 | Apache-2.0 | linguagem e typecheck |
| Vite | 8.2.2 | MIT | servidor e build frontend |
| @vitejs/plugin-react | 6.1.0 | MIT | integração React/Vite |
| ESLint / typescript-eslint | 10.9.1 / 8.68.0 | MIT | lint estrito e type-aware |
| Vitest | 4.1.11 | MIT | testes TypeScript |
| Tauri SQL plugin | 2.4.0 | MIT/Apache-2.0 | SQLite e migrations |
| SQLx | 0.8.6 | MIT/Apache-2.0 | teste nativo da migration |
| SQLite runtime | 3.46.0 | domínio público | persistência embarcada |
| Tauri Log plugin | 2.9.0 | MIT/Apache-2.0 | logs locais |
| SVAR React Gantt | 2.7.1 | MIT | renderer local do Gantt, carregado sob demanda |
| date-holidays | 3.36.0 | ISC (código) / CC BY-SA 3.0 (dados) | catálogo offline de feriados brasileiros, carregado sob demanda |
| Tauri Dialog plugin | 2.7.2 | MIT/Apache-2.0 | seletores nativos de exportação/importação |
| zip (crate) | 8.6.0 | MIT | leitura e escrita estrita de `.projectflow` |
| sha2 (crate) | 0.11.0 | MIT/Apache-2.0 | integridade SHA-256 dos pacotes |
| uuid (crate) | 1.26.0 | MIT/Apache-2.0 | remapeamento na importação como cópia |
| chrono (crate) | 0.4.45 | MIT/Apache-2.0 | timestamps e nomes de backup |

Versões JavaScript ficam em `package.json`/`package-lock.json`; versões Rust ficam em `Cargo.toml`/`Cargo.lock`. `rust-toolchain.toml` fixa Rust 1.98.0. Não há Tauri CLI, React, TypeScript, Vite ou bibliotecas de teste instalados globalmente.

## Integridade dos instaladores

- Node MSI SHA-256: `28b69132c35ccc033bf8f2a67cd10c9d75ef5822593363309da448f2afff2d8a`, igual ao `SHASUMS256.txt` oficial.
- Rustup SHA-256: `86478e53f769379d7f0ebfa7c9aa97cb76ca92233f79aa2cc0dbee2efaac73c7`, igual ao `.sha256` oficial.
- Bootstrapper do Build Tools: assinatura Authenticode válida da Microsoft Corporation; versão de arquivo 18.9.12120.119.

## Comandos usados

Inspeção:

```powershell
git --version
node --version
npm --version
rustc --version
cargo --version
rustup --version
```

Scaffold e dependências locais:

```powershell
npm create tauri-app@latest . -- --manager npm --template react-ts --identifier com.projectflow.app --tauri-version 2 --force --yes
npm install
npm run tauri add sql
cargo add tauri-plugin-sql --features sqlite
npm run tauri add log
npm install @svar-ui/react-gantt@2.7.1 --save-exact
cd src-tauri
cargo add tauri-plugin-dialog@2.7.2
cargo add zip@8.6.0 --no-default-features
cargo add sha2@0.11.0
cargo add uuid@1.26.0 --features v4
cargo add chrono@0.4.45 --features clock,std
```

O Gantt foi instalado localmente após avaliação de licença, manutenção,
TypeScript, React, hierarquia, dependências, acessibilidade e bundle. A decisão
e as alternativas estão no [ADR 013](decisions/013-svar-react-gantt.md). A
instalação adicionou 35 pacotes ao lockfile e a auditoria npm não encontrou
vulnerabilidades conhecidas nessa resolução.

O identificador foi ajustado antes da validação final para `com.projectflow.desktop`, eliminando o sufixo `.app` desaconselhado pela CLI.

Instalação global:

- Node: MSI oficial x64, instalação por máquina.
- Rust: `rustup-init.exe -y --default-host x86_64-pc-windows-msvc --default-toolchain stable --profile default`.
- Build Tools: bootstrapper Stable com `--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended`.

## Observações operacionais

- O host do Codex foi aberto antes das instalações e manteve um `PATH` antigo em alguns subprocessos. O `PATH` persistente do usuário contém `C:\Users\jeanm\.cargo\bin`; abrir um novo terminal elimina essa particularidade.
- `winget` não estava disponível, por isso foram usados diretamente os instaladores oficiais.
- O runtime SQLite é incorporado à aplicação; não foi instalado um SQLite CLI global.
- `.gitattributes` força `LF` em `src-tauri/migrations/*.sql`. O SQLx calcula o
  checksum das migrations byte a byte; sem essa regra, um checkout Windows com
  `core.autocrlf=true` convertia os arquivos para `CRLF` e fazia o CI rejeitar
  uma migration canônica mesmo sem alteração semântica.
- O scaffold oficial removeu `AGENTS.md` ao usar `--force`; o arquivo foi restaurado imediatamente e seu hash voltou a coincidir exatamente com `HEAD`.

## Validação final

```powershell
npm ci
npm run check
npm audit --audit-level=high
npm run tauri:build -- --no-bundle
npm run tauri:build:test

cd src-tauri
cargo fmt --all -- --check
cargo check --locked --all-targets
cargo test --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
```

O build de distribuição sem feature mantém dados no perfil do usuário. O comando
`npm run tauri:build:test` ativa a feature Cargo `shared-dev-data` e gera, no
mesmo caminho, um executável estritamente local que compartilha
`.local/data/projectflow.sqlite` com `tauri dev`. Internamente ele usa
`tauri build --no-bundle --features shared-dev-data`, garantindo que o
`beforeBuildCommand` seja executado e que `frontendDist` seja incorporado ao
executável; executar apenas `cargo build` deixaria a janela dependente do
`devUrl` em `localhost`. Cargo features são mecanismo
estável [documentado pelo Rust](https://doc.rust-lang.org/stable/cargo/reference/features.html),
e o [plugin SQL oficial](https://v2.tauri.app/plugin/sql/) resolve por padrão
caminhos relativos contra `AppConfig`; por isso o modo local fornece uma URL
absoluta e deliberada. Os instaladores NSIS foram gerados na Fase 7; a validação
em uma máquina Windows limpa permanece reservada ao Checkpoint E.

Os modos de distribuição e teste escrevem no mesmo
`src-tauri/target/release/project-flow.exe`; o último build vence. Depois de
reproduzir localmente o passo de distribuição do CI, executar novamente
`npm run tauri:build:test` antes de entregar o executável para auditoria. Isso
troca apenas o destino compilado do banco; não copia, apaga ou mistura os dois
arquivos SQLite.

No fechamento da Fase 5, todos esses gates voltaram a ser executados: lint e
typecheck aprovados, 78 testes TypeScript/React e 23 testes Rust/SQLite
aprovados, build web concluído, Cargo fmt/check e Clippy sem erros, auditoria
npm sem vulnerabilidades conhecidas e release local de teste gerado com o
frontend incorporado. A abertura nativa aplicou a migration 4 ao banco
compartilhado e registrou `database schema 4` no log. Antes da migração foi
criado o backup verificado
`.local/backups/projectflow-before-schema4-20260829-1018.sqlite`, com o mesmo
SHA-256 da origem (`4ACF477596010BD7D0BA8E23AE2271194BC631609B5C99E782D0DB0BEA1CDDB7`).
Nenhuma ferramenta global, dependência npm ou crate foi instalada ou atualizada
na Fase 5.

Na Fase 6 nenhuma ferramenta global ou dependência npm foi adicionada. Os cinco
crates acima foram instalados somente no `src-tauri`. O plugin de diálogo usa a
API nativa do Windows; `zip` foi fixado na linha estável 8.6 e sem features de
compressão, pois o formato 1 aceita somente entradas `Stored`.

No fechamento da Fase 6, lint, typecheck, build web, Cargo fmt/check, Clippy,
auditoria npm, build Tauri de distribuição e release local de teste foram
aprovados. Passaram 80 testes TypeScript/React e 29 testes Rust/SQLite; seis dos
testes nativos cobrem especificamente portabilidade, integridade, rollback e
restauração. O release de teste foi gerado por último e o log confirmou schema
4 usando `.local/data/projectflow.sqlite`.

Depois da Fase 6, `date-holidays` 3.36.0 foi adicionada somente ao projeto, sem
instalação global. O chunk do catálogo é carregado quando a prévia de feriados é
solicitada; atribuição e licença estão em `THIRD_PARTY_NOTICES.md`. Foram
aprovados 84 testes TypeScript/React, 29 testes Rust/SQLite, lint, typecheck,
build web, Cargo fmt/check/test/Clippy e auditoria npm sem vulnerabilidades.

## Fase 7 — primeiro checkpoint de hardening e distribuição

Nenhuma ferramenta global foi instalada ou atualizada. O Tauri reutilizou o
toolchain já validado e baixou para seu cache de build o NSIS 3.11 e
`nsis_tauri_utils` 0.5.3 a partir dos repositórios oficiais do projeto Tauri.

Comandos adicionados e validados:

```powershell
npm run test:performance
npm run tauri:build:installer
npm run tauri:build:installer:offline
```

Artefatos locais de 30/08/2026, preservados fora do Git em
`.local/distribution/`:

| Variante | Tamanho | SHA-256 |
| --- | ---: | --- |
| NSIS padrão | 3.916.872 bytes | `C47E1C6233D64BD21C816F7C7D0D8286B69C7AFFF9EB8425479546A643FB1827` |
| NSIS offline | 265.739.077 bytes | `2652669E39C9FA60708895C23FA4E2777C01255473B58B8538426712063C1D6D` |

O pacote offline incorpora o WebView2 redistribuível obtido pela URL oficial da
Microsoft usada pelo Tauri. A diferença de tamanho observada é compatível com a
estratégia documentada no ADR 017.

A combinação E2E recomendada pelo Tauri foi avaliada com
`@wdio/tauri-service` 1.3.0 e WebdriverIO 9.31.x. Ela foi removida antes de
qualquer implementação porque a resolução disponível introduziu 15 alertas npm
de severidade alta em dependências de desenvolvimento. `npm audit` voltou a
reportar zero vulnerabilidades depois da remoção. O runner nativo permanece
pendente até existir uma resolução segura e compatível; nenhum plugin WDIO foi
incluído no binário de produção.

Gates deste checkpoint: 85 testes TypeScript/React, 2 testes de desempenho e
29 testes Rust/SQLite aprovados; lint, typecheck, build web, Cargo
fmt/check/test/Clippy, build dos dois instaladores, release local de teste e
auditoria npm sem vulnerabilidades também aprovados.
