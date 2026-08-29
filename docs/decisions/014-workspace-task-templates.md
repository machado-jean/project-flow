# ADR 014 — Templates globais de árvores de tarefas

- Estado: Aceita
- Data: 29 de agosto de 2026

## Contexto

A Fase 5 precisa reutilizar árvores sem transformar templates em projetos
ocultos nem compartilhar identidades com tarefas reais. A especificação exige
hierarquia, duração, prioridade, status inicial, dependências, lag e tags, mas
não define o escopo da biblioteca nem como converter durações em datas ao
aplicar uma estrutura.

## Decisão

Templates pertencem ao workspace e ficam em tabelas próprias do mesmo SQLite.
Eles não pertencem a um projeto e podem ser aplicados em qualquer projeto.

Um template é criado a partir de uma tarefa e de todos os seus descendentes.
Ele preserva:

- nome e descrição do template;
- título e descrição das tarefas;
- hierarquia e posição relativa;
- duração das tarefas-folha;
- prioridade e status inicial;
- tags;
- dependências FS internas e seus lags.

Código visual, responsável, observações, progresso, datas e calendário por
tarefa são dados da execução e não entram no template. Tarefas aplicadas usam
modo `AUTO`, progresso zero e o calendário do projeto de destino.

Ao aplicar, o usuário escolhe o projeto de destino e uma data inicial. Todas as
tarefas-folha sem predecessoras começam nessa âncora, ajustada ao próximo dia
útil. O scheduler calcula sucessoras, resumos, fins e lags. Cada projeto,
tarefa, relação e item de template recebe UUID próprio; nenhuma identidade é
compartilhada.

Templates são carregados com o workspace e incluídos por qualquer backup
completo do SQLite. Na Fase 6, a exportação de workspace incluirá a biblioteca;
uma exportação isolada de projeto não incluirá templates globais
silenciosamente.

## Alternativas rejeitadas

- **Template restrito ao projeto:** reduz a reutilização e conflita com a futura
  exportação de workspace prevista na especificação.
- **Projeto oculto usado como template:** mistura entidades, interfere em
  contagens e filtros e enfraquece as chaves estrangeiras do domínio.
- **Copiar datas absolutas da origem:** torna a estrutura pouco reutilizável e
  cria resultados antigos ao aplicar o template meses depois.
- **Persistir templates como JSON opaco:** reduz validação relacional e dificulta
  migrations, integridade e exportação semântica.

## Consequências

- a Fase 5 exige migration própria e testes de banco novo e upgrade;
- tags de templates participam da limpeza de tags órfãs;
- dependências de template possuem constraints equivalentes às relações FS de
  tarefas reais;
- criar, excluir e aplicar uma estrutura deve ser transacional;
- editar templates em detalhe pode ser acrescentado futuramente sem converter
  itens de template em `Task` persistida.
