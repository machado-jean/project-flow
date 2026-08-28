# ADR 012 — Banco compartilhado para desenvolvimento e release local de teste

- Status: aceito
- Data: 28 de agosto de 2026

## Contexto

O executável iniciado manualmente pelo Explorer e o executável iniciado pelo
Codex chegaram a mostrar workspaces diferentes apesar de possuírem o mesmo
caminho aparente em `%APPDATA%`. O Codex desktop é distribuído como aplicativo
empacotado do Windows e seu processo recebeu uma camada virtualizada de
`AppData`. A base criada nesse contexto físico ficou em
`%LOCALAPPDATA%\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Roaming\...`,
enquanto o duplo clique normal continuou vendo o banco real do usuário.

Essa separação é inadequada para a auditoria: `tauri dev`, os builds executados
pelo agente e o release local aberto pelo usuário precisam observar exatamente
os mesmos dados de teste. Ao mesmo tempo, um instalador de produção não deve
depender do checkout do código-fonte.

O [plugin SQL oficial](https://v2.tauri.app/plugin/sql/) resolve caminhos SQLite
relativos contra `AppConfig`. O
[Cargo](https://doc.rust-lang.org/stable/cargo/reference/features.html) permite
ativar comportamento de compilação explícito por `--features`.

## Decisão

Existem dois modos deliberados:

1. **Desenvolvimento compartilhado** — builds debug e builds com a feature
   `shared-dev-data` usam o caminho absoluto
   `project-flow\.local\data\projectflow.sqlite`.
2. **Distribuição** — builds release sem essa feature continuam usando
   `sqlite:projectflow.sqlite`, resolvido pelo Tauri em `AppConfig`.

O preload fixo do plugin foi removido. A aplicação nativa expõe a URL calculada
e o adapter Tauri carrega explicitamente essa mesma URL antes de invocar o
primeiro comando de workspace. A lista de migrations é registrada sob a URL
idêntica, mantendo uma única instância SQLite por processo.

Na primeira abertura do modo compartilhado, se `.local\data` ainda estiver
vazio e houver um banco no `AppConfig`, a inicialização:

1. abre o banco de origem sem criá-lo;
2. executa `PRAGMA quick_check`;
3. cria uma cópia consistente com `VACUUM INTO` em `.local\backups`;
4. verifica o backup;
5. prepara e verifica uma cópia temporária dentro de `.local\data`;
6. ativa essa cópia por renomeação somente se o destino ainda não existir;
7. nunca sobrescreve uma base compartilhada já existente.

O comando `npm run tauri:build:test` executa o pipeline do Tauri com
`--no-bundle --features shared-dev-data`. Assim, além de ativar a feature, o
build executa `beforeBuildCommand` e incorpora `frontendDist`; o executável de
auditoria não depende do servidor Vite em `localhost`. `npm run tauri:build`
permanece reservado ao comportamento de distribuição.

## Alternativas rejeitadas

- Continuar usando `%APPDATA%` durante o desenvolvimento: mantém a divergência
  causada pela virtualização do Windows.
- Copiar manualmente o arquivo principal sem considerar WAL: poderia produzir
  uma cópia inconsistente.
- Fazer todo release usar `.local`: quebraria instalação em outra máquina e
  misturaria dados de produção ao código-fonte.
- Selecionar o banco por variável de ambiente: o duplo clique não carregaria a
  variável de forma reproduzível.

## Consequências

- Usuário e agente passam a auditar o mesmo workspace local.
- O banco recuperado é preservado antes de se tornar a base compartilhada.
- Bancos reais e backups continuam ignorados pelo Git.
- O executável local de teste é intencionalmente vinculado ao checkout onde foi
  compilado e não deve ser distribuído.
- O build instalável futuro continua usando diretório de dados apropriado do
  perfil do usuário.
