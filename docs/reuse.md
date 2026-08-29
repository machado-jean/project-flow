# Reutilização: duplicação e templates

## Comportamento entregue

- **Duplicar tarefa** copia somente a tarefa escolhida.
- **Duplicar árvore** copia a tarefa, todos os descendentes e somente as
  dependências cujas duas pontas pertencem à árvore copiada.
- **Duplicar projeto** cria outro projeto, copia toda a árvore e todas as
  dependências internas, selecionando a nova cópia ao concluir.
- **Salvar árvore como template** captura uma estrutura reutilizável na
  biblioteca global do workspace.
- **Aplicar template** cria uma árvore independente no projeto selecionado,
  ancorada na data informada e recalculada pelo scheduler.

Toda cópia recebe novos UUIDs. Relações externas não são recriadas. Excluir um
template não exclui nem altera tarefas anteriormente criadas com ele.

## Conteúdo de um template

São preservados título, descrição, hierarquia, duração das folhas, prioridade,
status inicial, tags e dependências FS internas com lag. Não são preservados
código visual, responsável, observações, progresso, datas absolutas nem o
calendário específico da tarefa. As tarefas aplicadas iniciam em modo `AUTO`,
com progresso zero, e usam o calendário do projeto de destino.

Templates ficam no mesmo SQLite do workspace. Portanto, uma cópia integral do
banco os contém. O backup/restore e o pacote portátil `.projectflow` serão
implementados na Fase 6 conforme [import-export.md](import-export.md).

## Auditoria manual da Fase 5

Use o projeto de testes existente ou crie uma pequena cadeia com subtarefas.

1. Em **Tabela**, abra **Detalhes** de uma tarefa-folha e use **Duplicar tarefa**.
   Confira novo número/UUID implícito, campos copiados e ausência de relações
   externas.
2. Abra a tarefa-pai e use **Duplicar árvore**. Confira descendentes, numeração,
   datas-resumo e predecessoras internas.
3. Use **Duplicar projeto** no cabeçalho. Confira que a cópia foi selecionada e
   que editar a cópia não altera o original.
4. Na árvore original, use **Salvar árvore como template**, informe nome e
   descrição e confira a entrada na seção **Templates**.
5. Selecione outro projeto, informe uma data na biblioteca e use **Aplicar**.
   Confira hierarquia, duração, lag e recalculação a partir da nova data.
6. Exclua o template e confirme que a árvore aplicada continua existindo.
7. Feche e reabra o executável para confirmar persistência do projeto duplicado,
   do template ainda não excluído e das tarefas aplicadas.

Erros de integridade devem aparecer na faixa de mensagem e não podem deixar
projetos, árvores ou templates parcialmente gravados.

Decisão arquitetural: [ADR 014](decisions/014-workspace-task-templates.md).
