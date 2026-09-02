# Diretrizes de validação do WebView2 no Windows

Este documento define como validar o WebView2 usado pelo ProjectFlow e como
evoluir o teste E2E da janela Tauri sem colocar dados reais, o ambiente do
usuário ou o gate de release em risco.

O objetivo não é testar o navegador Microsoft Edge. O objetivo é comprovar que
o aplicativo Tauri inicia, renderiza sua interface local, comunica-se com a
camada nativa e encerra sem deixar recursos que impeçam a execução seguinte.

## Decisão vigente

O ProjectFlow continuará usando o **WebView2 Evergreen**:

- é a opção recomendada pela Microsoft para a maioria dos aplicativos;
- no Windows 11 normalmente já está presente e é mantido pelo Windows;
- recebe correções de segurança, compatibilidade e desempenho automaticamente;
- evita incorporar e manter uma cópia fixa do navegador em cada instalação.

O instalador padrão usa o bootstrapper e a variante offline incorpora o
instalador offline do runtime. O WebView2 Fixed Version não deve ser adotado
como solução para falhas de automação: ele aumentaria o pacote e transferiria
ao ProjectFlow a responsabilidade por atualizações do runtime.

## Princípios obrigatórios para o E2E desktop

Antes de promover `npm run test:e2e:desktop` a gate obrigatório, o harness deve:

1. criar um diretório de dados WebView2 exclusivo para cada execução, sob
   `.local/e2e/webview/<run-id>/`;
2. usar banco, logs, backups, importações e exportações exclusivos da execução;
3. escolher uma porta CDP livre de forma dinâmica, sem assumir a porta `9222`;
4. nunca abrir ou modificar o banco e o diretório WebView2 da instalação real;
5. registrar PID, versão do runtime, diretório isolado, porta e tempos de cada
   etapa, sem registrar dados pessoais;
6. encerrar o processo Tauri e aguardar o término dos processos WebView2 filhos;
7. somente depois do encerramento confirmado remover os artefatos temporários;
8. preservar logs e evidências quando houver falha;
9. executar sequencialmente no mesmo host até que o isolamento concorrente seja
   comprovado;
10. falhar com diagnóstico explícito e não tentar downgrade ou alteração global
    do WebView2.

Cada tentativa deve ter um identificador imprevisível e próprio. Reutilizar o
mesmo User Data Folder entre execuções pode produzir contenção, interferência
entre processos e resultados dependentes da execução anterior.

## Matriz de testes

### 1. Pré-condições do host

- Registrar edição e build do Windows.
- Registrar a versão instalada do WebView2 Runtime.
- Confirmar que nenhum `project-flow.exe` de teste está em execução.
- Confirmar que a porta selecionada está livre.
- Confirmar que os caminhos E2E estão dentro de `.local/e2e/`.
- Confirmar que o banco de produção e `.local/data/projectflow.sqlite` não serão
  usados pelo cenário isolado.

Resultado esperado: o teste inicia somente após comprovar isolamento e não
altera ferramentas globais.

### 2. Inicialização repetida da janela

Executar a abertura e o encerramento controlado pelo menos cinco vezes no mesmo
host. Em cada repetição:

- a janela deve ser criada e ficar responsiva;
- a interface deve vir do bundle local, sem `localhost`;
- o endpoint CDP deve ficar disponível dentro do tempo limite;
- a janela deve fechar normalmente;
- os processos WebView2 associados devem terminar;
- a próxima repetição deve usar novo run ID, pasta e porta.

Resultado esperado: cinco aprovações consecutivas, sem `0x800700AA`, arquivos
bloqueados ou processos órfãos.

### 3. Jornada E2E real

Na janela Tauri, validar o fluxo mínimo do `AGENTS.md`:

1. criar projeto, tarefas e subtarefa;
2. criar a cadeia FS A → B → C;
3. alterar A e confirmar propagação em B e C;
4. alternar Tabela, Kanban e Gantt;
5. duplicar uma árvore e conferir novos UUIDs e relações internas;
6. exportar o workspace;
7. iniciar outro workspace isolado;
8. importar o pacote;
9. comparar semanticamente o resultado;
10. fechar e reabrir para confirmar persistência.

Resultado esperado: UI, IPC, SQLite e filesystem participam da mesma jornada,
sem mocks da camada nativa.

### 4. Concorrência e recuperação

- Tentar iniciar uma segunda execução apontando para o mesmo diretório E2E deve
  ser impedido ou produzir mensagem controlada, nunca corrupção.
- Duas execuções com diretórios e portas diferentes não devem interferir entre
  si, quando o suporte paralelo for habilitado.
- Após interrupção forçada do teste, a execução seguinte deve usar um novo
  diretório e iniciar normalmente.
- A limpeza deve tolerar processos demorando para encerrar, usando espera
  limitada e diagnóstico; não deve apagar arquivos ainda em uso à força.

### 5. Distribuição e operação do usuário

Validar separadamente, em uma VM Windows 11 limpa:

| Cenário | Instalador | Rede | Resultado obrigatório |
| --- | --- | --- | --- |
| Instalação padrão | Setup | Disponível | Runtime detectado ou instalado e aplicativo inicia |
| Instalação offline | Offline Setup | Desconectada | Instalação e primeira abertura funcionam |
| Runtime já instalado | Ambos | Qualquer | Não exige reinstalação desnecessária |
| Atualização | Setup/updater | Conforme o pacote | Banco e preferências são preservados |
| Reinício | Aplicativo instalado | Desconectada | Interface e SQLite funcionam sem servidor remoto |
| Desinstalação/reinstalação | Setup | Qualquer | Política de preservação é informada e comprovada |

Registrar versão do instalador, versão do WebView2 antes/depois, hash do
artefato, resultado e localização dos dados. Não incluir o banco pessoal nas
evidências.

## Diagnóstico de falhas

Se a criação da janela falhar:

1. guardar stdout, stderr e logs do run ID;
2. registrar o HRESULT e a etapa exata;
3. verificar se pasta, porta ou executável foram reutilizados;
4. verificar processos `project-flow` e WebView2 associados ainda ativos;
5. repetir com novo diretório e nova porta, sem alterar o runtime global;
6. comparar com o E2E em camadas (`npm run test:e2e`) para separar falha do
   produto de falha do mecanismo de automação;
7. consultar problemas oficiais/upstream antes de atualizar dependências;
8. não promover o teste a gate enquanto houver falha intermitente não explicada.

`HRESULT 0x800700AA` significa que um recurso solicitado estava em uso. Ele não
prova sozinho defeito funcional do ProjectFlow nem inadequação do WebView2. O
diagnóstico deve demonstrar qual recurso foi reutilizado ou registrar a
regressão upstream correspondente.

## Critérios para promover o E2E desktop ao CI

Todos os itens abaixo são necessários:

- cinco execuções locais consecutivas aprovadas;
- execução aprovada em VM Windows 11 limpa;
- duas execuções consecutivas aprovadas no GitHub Actions Windows;
- jornada real completa com UI, IPC e SQLite;
- zero acesso aos dados do usuário;
- encerramento sem processos órfãos;
- logs úteis em caso de timeout ou HRESULT;
- dependências sem vulnerabilidades conhecidas no nível bloqueante;
- tempo de execução compatível com o gate do projeto;
- documentação e ADR 019 atualizados com a implementação final.

Até isso ocorrer, `npm run test:e2e` continua sendo o gate obrigatório em duas
camadas e `npm run test:e2e:desktop` continua diagnóstico.

## Roteiro para retomar a implementação

1. Auditar `tests/e2e/build.mjs` e o launcher do teste desktop.
2. Implementar run ID, User Data Folder e porta CDP exclusivos.
3. Implementar encerramento e espera pelos processos filhos.
4. Adicionar teste de cinco repetições e preservação de evidências.
5. Executar a matriz deste documento no host de desenvolvimento.
6. Repetir na VM limpa e no CI.
7. Somente então decidir se o E2E desktop volta a bloquear releases.

## Referências oficiais

- [Microsoft — Distribuir aplicativos que usam o WebView2](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution)
- [Microsoft — Evergreen versus Fixed Version](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version)
- [Microsoft — User Data Folder](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder)
- [Microsoft — práticas recomendadas de desempenho](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance)
- [Tauri — instalador Windows e modos do WebView2](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri — WebDriver](https://v2.tauri.app/develop/tests/webdriver/)
- [Regressão upstream WebView2 150+](https://github.com/webdriverio/desktop-mobile/issues/542)

