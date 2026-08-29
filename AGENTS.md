# AGENTS.md — ProjectFlow

> Este arquivo é a especificação principal do projeto e a instrução operacional permanente para agentes Codex.
> Ele deve funcionar como o único arquivo inicial necessário para preparar o ambiente, criar a estrutura do repositório e desenvolver o ProjectFlow.

---

# 1. CONTEXTO INICIAL

## Plataforma primária

```text
Ambiente de desenvolvimento: Windows 11 x64
Target primário da V1:       Windows 11 x64
Raiz do workspace:           C:\Users\jeanm\Github\project-flow
```

A V1 não possui obrigação de suportar Linux ou macOS. Não gastar tempo de desenvolvimento, CI ou empacotamento nesses sistemas sem decisão explícita posterior.

O projeto começa em:

```text
C:\Users\jeanm\Github\project-flow
```

No início, essa pasta pode conter apenas:

```text
C:\Users\jeanm\Github\project-flow\
└── AGENTS.md
```

O agente Codex deve assumir que todo o restante do ambiente e da estrutura do projeto ainda precisa ser validado, instalado ou criado.

Não assumir que Node.js, Rust, Visual Studio Build Tools, WebView2, Git, Tauri CLI ou qualquer outra dependência já estejam corretamente configurados.

---

# 2. MISSÃO DO AGENTE

O agente deve preparar e desenvolver uma aplicação desktop chamada provisoriamente **ProjectFlow**, voltada a gestão de projetos e tarefas com foco em:

- tarefas e subtarefas;
- prioridade;
- status;
- início;
- fim;
- duração;
- progresso;
- predecessores;
- sucessores;
- atualização automática de datas;
- propagação de atrasos;
- dias úteis;
- feriados;
- lag;
- Tabela;
- Kanban;
- Gantt;
- duplicação de tarefas e árvores;
- templates reutilizáveis;
- operação totalmente offline;
- armazenamento local;
- exportação/importação para migração entre computadores.

A aplicação deve ser simples de manter, altamente testável e ter UX desktop de alta qualidade.

---

# 3. DECISÕES TECNOLÓGICAS DEFINITIVAS

A stack principal da V1 é:

```text
Tauri 2
React
TypeScript
Vite
SQLite
Rust somente na camada nativa necessária
npm
Git
```

## 3.1 TypeScript

TypeScript é a linguagem principal da aplicação.

Deve concentrar:

- regras de negócio;
- scheduler;
- calendário;
- duplicação;
- templates;
- estado da aplicação;
- interface;
- testes de domínio;
- testes de integração quando aplicável.

Usar TypeScript em modo estrito.

Evitar `any`.

---

## 3.2 React

React é usado somente na camada de apresentação e interação.

React NÃO deve conter regras centrais de scheduling.

Componentes não devem ser a fonte de verdade das tarefas.

---

## 3.3 Tauri

Tauri 2 é o shell desktop.

Rust deve ser usado apenas onde necessário para:

- integração nativa;
- filesystem;
- SQLite quando apropriado;
- exportação/importação;
- backup;
- recursos específicos do sistema operacional.

Não mover regras de domínio para Rust sem necessidade concreta.

---

## 3.4 SQLite

SQLite é a fonte local de verdade na V1.

Durante desenvolvimento, os dados locais podem residir em:

```text
project-flow\.local\data\
```

Esse diretório deve ser ignorado pelo Git.

Na versão instalada, usar diretório apropriado do Windows, por exemplo `LOCALAPPDATA` ou equivalente suportado pelo Tauri.

---

## 3.5 Python

Python NÃO faz parte da stack principal da V1.

Não introduzir:

- Python;
- PySide;
- FastAPI;
- Flask;
- backend Python;
- scripts Python permanentes;

sem necessidade explícita aprovada.

Se futuramente houver ferramenta auxiliar que justifique Python, ela deve ficar isolada e documentada.

---

## 3.6 Backend remoto

Não criar na V1:

- API remota;
- servidor web;
- backend em nuvem;
- PostgreSQL remoto;
- sincronização online;
- colaboração em tempo real.

A aplicação é local-first e offline.

---

# 4. PRINCÍPIO DE ISOLAMENTO DE DEPENDÊNCIAS

O conceito deve ser semelhante ao uso de `venv` em Python:

## Globais

Instalar globalmente apenas ferramentas-base realmente necessárias.

Exemplos:

- Git;
- Node.js LTS;
- npm fornecido pelo Node;
- Rust via rustup;
- Visual Studio Build Tools;
- Windows SDK;
- WebView2 quando necessário;
- pré-requisitos oficiais do Tauri.

## Locais ao projeto

Manter localmente:

- React;
- TypeScript;
- Vite;
- Tauri CLI;
- bibliotecas de UI;
- bibliotecas de teste;
- bibliotecas de Gantt;
- bibliotecas de grid;
- drag-and-drop;
- bibliotecas utilitárias;
- qualquer dependência JavaScript do projeto.

Essas dependências devem ficar registradas em:

```text
package.json
package-lock.json
```

e fisicamente instaladas em:

```text
node_modules\
```

`node_modules` nunca deve ser versionado.

---

# 5. REPRODUTIBILIDADE DO AMBIENTE

O repositório deve permitir reconstruir o ambiente em outro PC.

Versionar:

```text
package.json
package-lock.json
Cargo.toml
Cargo.lock
```

Também registrar:

- versão do Node;
- versão do npm;
- versão do Rust;
- versão do Cargo;
- versão do Tauri;
- versão do React;
- versão do TypeScript;
- versão do Vite;
- versão das ferramentas principais.

Criar documentação de ambiente em:

```text
docs/environment.md
```

---

# 6. REGRA CRÍTICA SOBRE VERSÕES

NÃO fixar versões por memória.

Antes de qualquer instalação inicial, o agente deve:

1. consultar a documentação oficial atual;
2. identificar as versões estáveis e compatíveis mais recentes;
3. verificar compatibilidade entre:
   - Tauri 2;
   - Node LTS;
   - Rust stable;
   - React;
   - TypeScript;
   - Vite;
   - Windows Build Tools;
   - WebView2;
4. preferir versões estáveis;
5. evitar releases experimentais, nightly, beta ou RC;
6. registrar as versões escolhidas;
7. documentar por que foram escolhidas quando houver mais de uma opção válida.

A prioridade é:

```text
compatibilidade
> estabilidade
> manutenção
> atualidade
```

Não instalar automaticamente “a versão mais nova” se ela não for a mais compatível.

---

# 7. ESCOPO DE TRABALHO DO CODEX

O Codex deve trabalhar dentro de:

```text
C:\Users\jeanm\Github\project-flow
```

como raiz do projeto.

Não criar arquivos permanentes fora dessa raiz, exceto:

- ferramentas globais explicitamente necessárias;
- instalações oficiais do Node;
- Rust;
- Visual Studio Build Tools;
- Windows SDK;
- WebView2;
- dependências globais inevitáveis do ambiente.

Antes de alterar algo globalmente, identificar:

- o que será instalado;
- por que precisa ser global;
- se já existe;
- se a versão instalada é compatível.

---

# 8. BOOTSTRAP DO AMBIENTE

Antes de desenvolver funcionalidades, executar a Fase 0 de preparação.

## Fase 0A — Inspeção

Verificar:

```text
git --version
node --version
npm --version
rustc --version
cargo --version
rustup --version
```

Também verificar requisitos Windows do Tauri.

Registrar os resultados.

Não reinstalar ferramenta que já esteja presente, atual e compatível.

---

## Fase 0B — Instalação de pré-requisitos globais

Se necessário, instalar:

1. Git;
2. Node.js LTS compatível;
3. Rust stable via rustup;
4. Visual Studio Build Tools;
5. Windows SDK;
6. WebView2 Runtime quando exigido;
7. demais pré-requisitos oficiais do Tauri para Windows.

Usar fontes oficiais.

Evitar instaladores de terceiros quando houver mecanismo oficial.

---

## Fase 0C — Validação

Depois das instalações, validar novamente.

Não iniciar scaffold do projeto se algum requisito obrigatório estiver quebrado.

Criar ou atualizar:

```text
docs/environment.md
```

com:

- ferramenta;
- versão;
- escopo global/local;
- origem oficial;
- comando de verificação.

---

# 9. BOOTSTRAP DO PROJETO

Somente depois da validação do ambiente.

Criar a aplicação usando o mecanismo oficial e atual do Tauri 2.

A configuração alvo é:

```text
Tauri 2
React
TypeScript
Vite
npm
```

Não utilizar template JavaScript.

Não utilizar Yarn ou pnpm sem decisão explícita.

Usar `npm`.

---

# 10. ESTRUTURA INICIAL DO REPOSITÓRIO

A estrutura desejada é aproximadamente:

```text
project-flow/
│
├── AGENTS.md
├── README.md
├── .gitignore
├── package.json
├── package-lock.json
│
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   │   ├── projects/
│   │   ├── tasks/
│   │   ├── table/
│   │   ├── kanban/
│   │   ├── gantt/
│   │   ├── templates/
│   │   └── import-export/
│   │
│   ├── domain/
│   │   ├── scheduling/
│   │   ├── calendar/
│   │   ├── duplication/
│   │   └── validation/
│   │
│   ├── repositories/
│   ├── state/
│   └── types/
│
├── src-tauri/
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── src/
│   └── migrations/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── docs/
│   ├── environment.md
│   ├── architecture.md
│   ├── data-model.md
│   ├── scheduling.md
│   ├── import-export.md
│   └── decisions/
│
├── .local/
│   ├── data/
│   ├── logs/
│   ├── backups/
│   ├── imports/
│   └── exports/
│
├── test-data/
│
└── temp/
```

A estrutura pode ser refinada com justificativa, mas a separação de responsabilidades deve permanecer.

---

# 11. GITIGNORE

Testes automatizados devem ser versionados.

NÃO ignorar:

```text
tests/**/*.ts
tests/**/*.tsx
tests/fixtures/
```

Ignorar somente artefatos e dados gerados.

Base esperada:

```gitignore
# Dependencies
node_modules/

# Builds
dist/
target/
src-tauri/target/

# Environment
.env
.env.*
!.env.example

# IDE
.vscode/
.idea/

# OS
Thumbs.db
.DS_Store

# Test artifacts
coverage/
test-results/
playwright-report/

# Local development data
.local/

# Generated test datasets
test-data/

# Temporary files
temp/
tmp/

# Local databases
*.sqlite
*.sqlite3
*.db
*.db-shm
*.db-wal

# ProjectFlow exports
*.projectflow

# Logs
*.log
logs/
```

Se uma fixture SQLite ou `.projectflow` precisar ser versionada, criar exceção explícita.

---

# 12. GIT E GITHUB

## 12.1 Estado inicial do repositório

Antes do primeiro trabalho do Codex, o fluxo recomendado é:

```text
1. criar C:\Users\jeanm\Github\project-flow
2. colocar somente AGENTS.md
3. inicializar Git
4. criar/conectar o repositório remoto GitHub
5. fazer o primeiro commit contendo somente AGENTS.md
6. fazer push desse commit para main
7. somente então abrir a raiz project-flow no Codex
```

Primeiro commit recomendado:

```text
docs: add initial ProjectFlow specification
```

Esse commit representa o estado zero recuperável do projeto.

## 12.2 Responsabilidade sobre operações remotas

O Codex NÃO deve, sem autorização explícita do usuário:

- criar repositório remoto;
- alterar configuração do remoto;
- executar `git push`;
- executar force-push;
- fazer merge em `main`;
- publicar release;
- criar tag de release;
- excluir branch remota;
- tornar repositório público;
- alterar configurações do GitHub.

O agente pode inspecionar o estado Git normalmente.

Só preparar/criar commits locais quando isso fizer parte da instrução recebida ou estiver explicitamente autorizado.

Antes de qualquer mudança significativa, verificar:

```text
git status
git branch --show-current
git log --oneline -n 10
```

Não sobrescrever trabalho local não relacionado.

## 12.3 Branches

`main` deve representar um estado estável e recuperável.

Usar branches temáticas quando a mudança justificar isolamento:

```text
feat/project-model
feat/task-model
feat/task-table
feat/scheduler
feat/kanban
feat/gantt
feat/templates
feat/import-export
fix/...
test/...
```

Evitar branches permanentes desnecessárias como `develop` na V1.

## 12.4 Commits

Commits devem ser pequenos, coerentes e semanticamente claros.

Exemplos:

```text
docs: document development environment
chore: bootstrap Tauri React application
chore: configure lint and typecheck
test: configure test infrastructure
feat: add SQLite persistence foundation
feat: add task hierarchy model
feat: implement FS dependencies
test: cover scheduling across weekends
fix: reject cyclic dependencies
```

Não misturar refactor amplo, feature e alteração de infraestrutura no mesmo commit sem necessidade.

Não levar para `main` código com testes, lint ou typecheck quebrados.

## 12.5 Checkpoints recomendados de versionamento

Solicitar/recomendar commit e push ao usuário ao concluir marcos estáveis, sem executar push automaticamente:

```text
Checkpoint Git 0 — AGENTS.md inicial
Checkpoint Git 1 — ambiente documentado + scaffold validado
Checkpoint Git 2 — SQLite + migrations + qualidade
Checkpoint Git 3 — Project/Task core
Checkpoint Git 4 — scheduler FS estável
Checkpoint Git 5 — Tabela/Kanban/Gantt
Checkpoint Git 6 — duplicação/templates
Checkpoint Git 7 — export/import/backup
Checkpoint Git 8 — empacotamento Windows
```

Dentro de cada checkpoint podem existir vários commits locais coerentes.

O GitHub versiona:

- código;
- testes automatizados;
- documentação;
- migrations;
- manifests e lockfiles.

Não versionar:

- bancos reais;
- dados pessoais;
- `.local`;
- builds;
- logs;
- backups;
- exports reais;
- segredos.

---

# 13. DOCUMENTAÇÃO OBRIGATÓRIA

Antes de features complexas, criar:

```text
docs/environment.md
docs/architecture.md
docs/data-model.md
docs/scheduling.md
docs/import-export.md
```

Também criar ADRs:

```text
docs/decisions/001-tauri.md
docs/decisions/002-sqlite.md
docs/decisions/003-typescript-domain.md
docs/decisions/004-date-only.md
docs/decisions/005-local-first.md
docs/decisions/006-no-sync-v1.md
```

Decisões futuras importantes também devem virar ADR.

---

# 13A. DISTRIBUIÇÃO WINDOWS E USUÁRIO FINAL

As ferramentas usadas para desenvolver não são requisitos do usuário final.

O produto final deve ser distribuído como aplicação Windows instalável/autocontida.

O usuário final NÃO deve precisar instalar separadamente:

```text
Node.js
npm
React
TypeScript
Vite
Rust
Cargo
Git
Visual Studio / Build Tools
Codex
SQLite
```

O build deve incorporar as dependências necessárias à aplicação conforme o modelo oficial do Tauri.

## WebView2

WebView2 é somente o runtime local usado pelo Tauri para renderizar a interface React/HTML/CSS/JavaScript.

Seu uso NÃO significa que a aplicação seja web-hosted ou que necessite internet.

O fluxo de execução deve ser local:

```text
ProjectFlow.exe
      │
      ├── Tauri local
      ├── WebView2 Runtime local
      ├── React/TypeScript compilado localmente
      ├── regras de domínio locais
      └── SQLite local
```

Nenhuma tela principal deve depender de servidor remoto.

## Instalação offline

A aplicação deve funcionar 100% offline após instalada.

Na fase de empacotamento, avaliar as opções oficiais atuais do Tauri para Windows e documentar pelo menos:

1. instalador padrão que utilize o WebView2 Runtime disponível no Windows quando apropriado;
2. estratégia/pacote capaz de instalação sem internet, incluindo o runtime necessário quando tecnicamente adequado.

A decisão final deve considerar compatibilidade, tamanho do instalador, manutenção e experiência do usuário.

Não congelar agora valores de tamanho do WebView2 ou opções de bundle; verificar a documentação oficial atual na fase de empacotamento.

## Dados de produção

Durante desenvolvimento:

```text
project-flow\.local\
```

Na aplicação instalada, dados persistentes devem ficar em diretório apropriado do perfil do usuário Windows, resolvido pelas APIs oficiais do Tauri/Windows, e nunca misturados ao diretório do código-fonte.

Atualização ou reinstalação do executável não deve apagar silenciosamente o banco do usuário.

---

# 14. PRODUTO — VISÃO GERAL

O ProjectFlow é uma aplicação desktop de planejamento operacional.

O foco é resolver muito bem:

```text
planejar
→ relacionar
→ recalcular
→ visualizar
→ reutilizar
→ transportar
```

Não é objetivo reproduzir integralmente Smartsheet ou Microsoft Project.

---

# 15. REQUISITOS FUNCIONAIS

## 15.1 Projetos

Cada projeto deve possuir:

- UUID;
- nome;
- descrição opcional;
- data de criação;
- data de atualização;
- status;
- calendário;
- ordenação;
- arquivado/não arquivado.

Permitir:

- criar;
- renomear;
- duplicar;
- arquivar;
- excluir;
- exportar.

---

# 16. TAREFAS

Campos mínimos:

- UUID imutável;
- código visual opcional;
- `project_id`;
- `parent_id`;
- título;
- descrição;
- status;
- prioridade;
- progresso;
- início;
- fim;
- duração;
- modo de agendamento;
- posição;
- responsável opcional;
- tags;
- observações;
- timestamps.

---

# 17. HIERARQUIA

Tarefas podem possuir subtarefas.

Permitir:

- expandir/recolher;
- reordenar;
- mover na hierarquia;
- duplicar árvore;
- excluir árvore com confirmação.

Impedir ciclos de parentesco.

Uma tarefa não pode ser descendente dela mesma.

---

# 18. TAREFAS-RESUMO

Regra inicial:

Se uma tarefa possuir filhos:

```text
início = menor início dos descendentes
fim = maior fim dos descendentes
```

A tarefa-pai funciona como resumo.

Enquanto possuir filhos, suas datas não devem ser editadas diretamente na V1.

---

# 19. STATUS

Valores iniciais:

```text
Não iniciada
Em andamento
Bloqueada
Concluída
Cancelada
```

Preparar arquitetura para status customizáveis futuramente.

---

# 20. PRIORIDADE

Valores iniciais:

```text
Baixa
Normal
Alta
Crítica
```

---

# 21. DEPENDÊNCIAS

Criar entidade própria.

Campos:

- UUID;
- predecessor;
- sucessor;
- tipo;
- lag;
- timestamps.

Preparar para:

```text
FS — Finish to Start
SS — Start to Start
FF — Finish to Finish
SF — Start to Finish
```

## MVP

Implementar primeiro:

```text
FS
```

Não implementar os demais tipos antes de estabilizar completamente FS.

---

# 22. REGRAS DE DEPENDÊNCIA

- múltiplos predecessores permitidos;
- múltiplos sucessores permitidos;
- auto-dependência proibida;
- ciclos proibidos;
- dependências devem sobreviver à persistência;
- exclusão deve limpar relações de forma segura;
- duplicação preserva relações internas;
- relações externas não são recriadas por padrão.

---

# 23. MODOS DE SCHEDULING

Cada tarefa deve suportar:

```text
AUTO
MANUAL
```

## AUTO

O scheduler pode deslocar a tarefa conforme dependências.

## MANUAL

A data é controlada pelo usuário.

O scheduler não deve deslocá-la automaticamente sem uma política explícita.

---

# 24. SCHEDULER

O scheduler deve ser escrito em TypeScript puro.

Local desejado:

```text
src/domain/scheduling/
```

Ele NÃO pode depender de:

- React;
- componentes;
- DOM;
- Tauri UI.

API conceitual:

```text
validateGraph()
detectCycle()
topologicalSort()
calculateEarliestStart()
rescheduleAffectedTasks()
```

---

# 25. REGRA FS

Para Finish-to-Start:

```text
inicio_minimo_sucessor =
proximo_dia_util(fim_predecessor + lag)
```

Com múltiplos predecessores, usar a restrição mais tardia.

---

# 26. PROPAGAÇÃO

Se uma tarefa `AUTO` for deslocada por uma restrição FS mais tardia ou mais
cedo:

1. preservar duração;
2. atualizar início e fim;
3. identificar sucessores;
4. recalcular sucessores `AUTO`;
5. continuar em cascata;
6. atualizar tarefas-resumo;
7. persistir em transação.

---

# 27. POLÍTICA REATIVA PARA TAREFAS AUTO

Na V1, uma tarefa `AUTO` que possui predecessoras deve começar na restrição FS
mais tardia calculada pelo scheduler. Mudanças nas predecessoras podem deslocar
a sucessora tanto para frente quanto para trás, sempre preservando duração,
calendário, lag e propagação em cascata.

Folgas intencionais entre tarefas devem ser representadas pelo lag. Tarefas
`MANUAL` nunca são antecipadas ou atrasadas automaticamente. Ao remover a última
predecessora, manter a data atual porque deixa de existir uma âncora para
inferir uma nova data anterior.

---

# 28. CALENDÁRIO

Implementar:

- dias úteis;
- finais de semana;
- feriados;
- exceções.

Padrão inicial:

```text
segunda a sexta
```

Funções de domínio:

```text
nextWorkingDay()
addWorkingDays()
workingDaysBetween()
isWorkingDay()
```

---

# 29. DATAS

Datas de cronograma são `date-only`.

Persistir:

```text
YYYY-MM-DD
```

Não representar datas de cronograma como timestamp quando não houver necessidade.

Evitar dependência de timezone.

Regra inicial:

```text
duração 1 = início e fim no mesmo dia útil
```

---

# 30. VIEW TABELA

A Tabela é a principal interface de edição.

Deve suportar:

- hierarquia;
- expandir/recolher;
- edição inline;
- ordenação;
- filtros;
- seleção múltipla;
- criação rápida;
- duplicação;
- status;
- prioridade;
- início;
- fim;
- duração;
- progresso;
- predecessor.

Objetivo:

```text
sensação de planilha
sem virar planilha genérica
```

---

# 31. VIEW KANBAN

Kanban trabalha sobre as mesmas tarefas.

Inicialmente:

```text
colunas = status
```

Drag-and-drop altera status.

Alterações devem aparecer imediatamente nas outras views.

---

# 32. VIEW GANTT

Deve mostrar:

- escala temporal;
- barras;
- progresso;
- hierarquia;
- dependências;
- tarefas-resumo;
- fins de semana;
- feriados;
- zoom;
- seleção;
- edição temporal quando segura.

Não desenvolver renderer completo de Gantt do zero sem justificativa.

Antes de escolher biblioteca, avaliar:

- licença;
- manutenção;
- TypeScript;
- React;
- desempenho;
- suporte a dependências;
- hierarquia;
- edição;
- acessibilidade;
- bundle;
- customização.

Registrar decisão em ADR.

---

# 33. UMA TAREFA, VÁRIAS VIEWS

Tabela, Kanban e Gantt são projeções da mesma entidade.

Nunca criar:

```text
TaskTable
TaskKanban
TaskGantt
```

como cópias persistidas separadas.

A fonte de verdade deve permanecer única.

---

# 34. DUPLICAÇÃO

Permitir:

1. duplicar tarefa;
2. duplicar tarefa + subtarefas;
3. duplicar projeto;
4. criar estrutura a partir de template.

---

# 35. ALGORITMO DE DUPLICAÇÃO RECURSIVA

1. carregar seleção;
2. carregar descendentes;
3. gerar novos UUIDs;
4. criar mapa `old_id -> new_id`;
5. copiar campos;
6. reconstruir `parent_id`;
7. localizar dependências internas;
8. mapear predecessor e sucessor;
9. não copiar dependências externas por padrão;
10. validar grafo;
11. persistir em transação.

---

# 36. TEMPLATES

Templates devem suportar:

- árvore;
- duração;
- prioridade;
- status inicial;
- dependências;
- lag;
- tags.

Ao aplicar template:

- gerar novos UUIDs;
- não compartilhar identidade com template original.

---

# 37. BUSCA E FILTROS

Mínimo:

- texto;
- status;
- prioridade;
- datas;
- concluída/não concluída;
- tags.

---

# 38. EXPORTAÇÃO E IMPORTAÇÃO

A aplicação deve permitir:

## Projeto

Exportar um projeto com:

- tarefas;
- subtarefas;
- dependências;
- calendário;
- configurações necessárias.

## Workspace

Exportar:

- todos os projetos;
- templates;
- calendários;
- configurações portáveis.

---

# 39. FORMATO DE EXPORTAÇÃO

Usar extensão própria, provisoriamente:

```text
.projectflow
```

Formato interno recomendado:

```text
ZIP
├── manifest.json
├── data.sqlite
├── attachments/
└── README.txt
```

O formato final deve ser documentado.

---

# 40. MANIFEST

Exemplo conceitual:

```json
{
  "format": "projectflow",
  "schemaVersion": 1,
  "appVersion": "0.1.0",
  "exportType": "workspace",
  "exportedAt": "ISO-8601"
}
```

---

# 41. IMPORTAÇÃO

Antes de escrever:

- validar pacote;
- validar schema;
- validar versão;
- validar integridade;
- validar tamanho;
- validar entradas.

Nunca sobrescrever silenciosamente.

Importar em transação/staging.

Falha relevante deve cancelar a operação inteira.

---

# 42. MIGRAÇÕES

Toda mudança de schema deve possuir migration.

Não alterar banco manualmente em produção.

Não editar migration publicada.

Testar:

- banco novo;
- upgrade;
- importação antiga;
- exportação nova.

---

# 43. BACKUP

Suportar backup local.

Durante desenvolvimento:

```text
.local/backups/
```

Produção deve usar diretório apropriado do usuário.

Nunca depender de nuvem.

---

# 44. DADOS LOCAIS DURANTE DESENVOLVIMENTO

Usar:

```text
.local/
├── data/
├── backups/
├── imports/
├── exports/
└── logs/
```

Tudo ignorado pelo Git.

---

# 45. UX

UX é requisito central.

A aplicação deve parecer uma aplicação desktop profissional, não apenas uma página web dentro de uma janela.

Priorizar:

- interface limpa;
- navegação rápida;
- edição inline;
- menus de contexto;
- atalhos;
- seleção múltipla;
- feedback imediato;
- estados vazios claros;
- mensagens de erro úteis;
- consistência entre views;
- tema claro/escuro futuramente;
- foco em produtividade.

---

# 46. ACESSIBILIDADE

- navegação por teclado;
- foco visível;
- labels;
- contraste;
- não depender somente de cor;
- drag-and-drop com alternativa;
- informações essenciais do Gantt também acessíveis pela Tabela.

---

# 47. LOGS

Logs locais devem registrar:

- inicialização;
- versão;
- schema;
- migrations;
- erros;
- scheduler;
- import/export;
- banco.

Evitar conteúdo sensível desnecessário.

---

# 48. SEGURANÇA

- dados não saem da máquina sem ação explícita;
- sem telemetria remota por padrão;
- SQL parametrizado;
- validar ZIP;
- impedir path traversal;
- limitar tamanho de importação;
- não executar conteúdo importado;
- tratar corrupção de banco de forma segura.

---

# 49. PERFORMANCE

Objetivos iniciais:

```text
1.000 tarefas por projeto
10.000 tarefas por workspace
```

sem degradação grave.

Virtualizar Tabela quando necessário.

O scheduler deve trabalhar sobre subgrafo afetado quando possível.

---

# 50. TESTES

Testes automatizados fazem parte do código e devem ser versionados.

## Unitários

Prioridade máxima:

- scheduler;
- calendário;
- ciclos;
- duração;
- duplicação;
- migrations;
- import/export.

## Integração

- SQLite;
- repositories;
- transações;
- templates;
- persistência do scheduler.

## UI

- criar;
- editar;
- trocar view;
- filtros;
- Kanban;
- Gantt;
- hierarquia.

## E2E

Fluxo mínimo:

1. criar projeto;
2. criar tarefas;
3. criar subtarefas;
4. criar A → B → C;
5. atrasar A;
6. verificar B;
7. verificar C;
8. alternar views;
9. duplicar árvore;
10. exportar;
11. importar em workspace limpo;
12. comparar resultado.

---

# 51. CASOS OBRIGATÓRIOS DO SCHEDULER

Testar:

1. A → B;
2. A → B → C;
3. A e B → C;
4. lag zero;
5. lag positivo;
6. sexta → segunda;
7. feriado;
8. alteração sem impacto;
9. propagação;
10. tarefa MANUAL;
11. ciclo;
12. auto-dependência;
13. duplicação;
14. resumo;
15. múltiplas alterações em transação.

---

# 52. DEFINITION OF DONE

Feature concluída somente quando:

- requisito atendido;
- arquitetura respeitada;
- testes passam;
- lint passa;
- typecheck passa;
- migration criada se necessário;
- erros considerados;
- documentação atualizada;
- critérios de aceite verificados;
- sem regressão aparente.

---

# 53. ROADMAP

## Fase 0 — Ambiente

- verificar ferramentas;
- instalar globais;
- documentar versões;
- validar Tauri.

## Fase 1 — Fundação

- scaffold;
- Tauri;
- React;
- TypeScript;
- Vite;
- SQLite;
- migrations;
- logging;
- testes;
- CI;
- Git.

## Fase 2 — Core

- Project;
- Task;
- subtarefas;
- status;
- prioridade;
- datas;
- duração;
- Tabela.

## Fase 3 — Scheduling

- calendário;
- FS;
- lag;
- ciclos;
- AUTO/MANUAL;
- propagação;
- tarefas-resumo.

## Fase 4 — Views

- Kanban;
- Gantt;
- sincronização entre views;
- filtros.

## Fase 5 — Reutilização

- duplicação;
- duplicação de projeto;
- templates.

## Fase 6 — Portabilidade

- export projeto;
- export workspace;
- import;
- backup;
- restore.

## Fase 7 — Hardening e distribuição Windows

- performance;
- UX;
- acessibilidade;
- E2E;
- build release Windows x64;
- instalador Windows;
- estratégia de instalação offline;
- validação de WebView2;
- teste em máquina Windows limpa sem toolchain de desenvolvimento;
- documentação de instalação, atualização, desinstalação e preservação de dados.

---

# 54. CRITÉRIOS DE ACEITE DO MVP

O MVP deve permitir:

1. instalar no Windows;
2. abrir sem internet;
3. criar vários projetos;
4. criar tarefas;
5. criar subtarefas;
6. editar datas;
7. editar duração;
8. editar prioridade;
9. editar status;
10. criar predecessor FS;
11. atrasar predecessor;
12. empurrar sucessor;
13. propagar A → B → C;
14. respeitar fim de semana;
15. respeitar feriado;
16. alternar Tabela/Kanban/Gantt;
17. manter a mesma tarefa entre views;
18. duplicar árvore;
19. preservar relações internas;
20. aplicar template;
21. exportar projeto;
22. importar em outro PC;
23. exportar workspace;
24. importar workspace;
25. operar tudo offline;
26. gerar instalador Windows;
27. instalar em uma máquina Windows sem Node/Rust/Git/Build Tools;
28. executar sem internet;
29. preservar dados após atualização/reinstalação conforme política definida.

---

# 55. INSTRUÇÕES OPERACIONAIS DO CODEX

Antes de cada mudança não trivial:

1. ler este arquivo;
2. inspecionar repositório;
3. inspecionar testes;
4. identificar módulos;
5. registrar plano curto;
6. implementar em passos pequenos.

---

# 56. REGRAS DE CÓDIGO

- TypeScript strict;
- evitar `any`;
- funções puras no domínio;
- UI separada de domínio;
- erros explícitos;
- sem exceptions ignoradas;
- sem regras críticas dentro de componentes;
- nomes claros;
- arquivos pequenos e coesos;
- evitar abstração prematura.

---

# 57. AO ALTERAR SCHEDULER

Obrigatório:

- testes unitários;
- cadeia;
- calendário;
- ciclos;
- MANUAL/AUTO;
- duração;
- transação.

Não alterar comportamento do scheduler incidentalmente em refactor.

---

# 58. AO ALTERAR BANCO

Obrigatório:

- migration;
- teste banco novo;
- teste upgrade;
- preservar dados;
- revisar import/export;
- atualizar schemaVersion quando necessário.

---

# 59. AO ALTERAR IMPORT/EXPORT

Obrigatório testar:

```text
workspace A
→ export
→ workspace vazio
→ import
→ comparação semântica
```

---

# 60. DEPENDÊNCIAS EXTERNAS

Antes de adicionar biblioteca:

1. justificar;
2. verificar licença;
3. verificar manutenção;
4. verificar compatibilidade;
5. verificar TypeScript;
6. verificar impacto no bundle;
7. preferir biblioteca madura.

---

# 61. PROIBIÇÕES DA V1

Não implementar sem aprovação:

- sync;
- backend remoto;
- colaboração online;
- contas;
- autenticação online;
- Python principal;
- PySide;
- FastAPI;
- Electron;
- PostgreSQL;
- mobile;
- chat;
- dashboards avançados;
- billing;
- telemetria;
- Gantt customizado do zero;
- SS/FF/SF antes de FS estabilizar;
- caminho crítico antes do scheduler básico estabilizar.

---

# 62. CHECKPOINTS OBRIGATÓRIOS

O Codex deve validar cada etapa antes de avançar.

## Checkpoint A — ambiente

Confirmar:

- Git;
- Node;
- npm;
- Rust;
- Cargo;
- Build Tools;
- Windows SDK;
- WebView2;
- Tauri prerequisites.

## Checkpoint B — scaffold

Confirmar:

- aplicação abre;
- frontend carrega;
- Tauri executa;
- build de desenvolvimento funciona.

## Checkpoint C — qualidade

Confirmar:

- lint;
- typecheck;
- testes;
- estrutura;
- Git.

## Checkpoint D — persistência

Confirmar:

- SQLite abre;
- migration inicial funciona;
- banco local fica fora do Git.

Só então iniciar regras de negócio.

## Checkpoint E — distribuição

Antes de considerar a V1 distribuível, confirmar em ambiente Windows limpo:

- instalador executa;
- ProjectFlow inicia;
- usuário não precisa do toolchain de desenvolvimento;
- SQLite funciona sem instalação separada;
- WebView2 está corretamente tratado pela estratégia escolhida;
- aplicação funciona sem internet;
- dados persistem no diretório correto;
- desinstalação/atualização não causam perda silenciosa de dados.

---

# 63. README

Criar `README.md` inicial contendo:

- objetivo;
- stack;
- requisitos;
- setup;
- desenvolvimento;
- testes;
- build;
- estrutura;
- status do projeto.

Não duplicar toda a especificação do `AGENTS.md`.

---

# 64. RESULTADO DO BOOTSTRAP

Ao finalizar a preparação inicial, o repositório deve estar aproximadamente assim:

```text
project-flow/
├── AGENTS.md
├── README.md
├── .gitignore
├── package.json
├── package-lock.json
├── src/
├── src-tauri/
├── tests/
├── docs/
│   ├── environment.md
│   ├── architecture.md
│   ├── data-model.md
│   ├── scheduling.md
│   ├── import-export.md
│   └── decisions/
└── .local/
```

e os comandos básicos devem funcionar.

---

# 65. PRIMEIRA ENTREGA DO CODEX

A primeira entrega não deve tentar implementar ProjectFlow completo.

Deve se limitar a:

1. preparar ambiente;
2. documentar ambiente;
3. criar scaffold;
4. configurar Git;
5. criar estrutura;
6. configurar qualidade;
7. configurar testes;
8. configurar SQLite e migrations;
9. criar documentação inicial;
10. validar aplicação vazia executando corretamente;
11. apresentar ao usuário o estado Git e os commits/checkpoint recomendados;
12. não executar push ou merge sem autorização explícita.

Somente depois começar a Fase 2.

---

# 66. FILOSOFIA FINAL

O projeto deve priorizar:

```text
correção
> integridade de dados
> manutenção
> UX
> desempenho
> quantidade de features
```

O Codex deve evitar implementar funcionalidades em excesso.

A meta é construir uma ferramenta pequena, confiável e excelente para o fluxo de planejamento definido neste documento.
