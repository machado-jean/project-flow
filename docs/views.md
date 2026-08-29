# Visualizações e filtros

Tabela, Kanban e Gantt são projeções do mesmo array de `Task` mantido por
`useWorkspace`. Trocar de view não carrega outra cópia do projeto nem cria
entidades persistidas específicas da interface.

## Filtros compartilhados

Os filtros ficam na composição `ProjectViews` e permanecem ativos ao alternar
entre as três views. O conjunto mínimo cobre:

- texto em título, código, descrição, responsável, tags e observações;
- status;
- prioridade;
- concluída ou não concluída;
- sobreposição com intervalo de datas;
- tag.

Quando uma subtarefa corresponde, seus ancestrais são incluídos como contexto
na Tabela e no Gantt. O contador mostra correspondências reais, sem contar os
ancestrais acrescentados somente para contexto.

## Numeração hierárquica

Tabela, Kanban e Gantt exibem uma numeração derivada da posição na árvore:

```text
1. Tarefa-pai
1.1. Subtarefa
1.1.1. Subtarefa de terceiro nível
2. Próxima tarefa-pai
```

Essa numeração não é gravada no título, no código visual nem no SQLite. Ela é
recalculada automaticamente ao reordenar ou mover uma tarefa na hierarquia. Se
um título antigo já começa com o mesmo número, a interface o exibe apenas uma
vez; o conteúdo persistido não é alterado silenciosamente.

## Kanban

As cinco colunas iniciais representam os status definidos no domínio. Um cartão
pode mudar de status por drag-and-drop nativo ou pelo campo **Status**.
Ambos chamam o mesmo `onSave` utilizado pela Tabela, portanto a alteração é
validada, persistida e refletida imediatamente em todas as views.

Cada cartão informa caminho hierárquico, prioridade, datas, progresso,
predecessoras, responsável e tags quando disponíveis. Tarefas-resumo aparecem
identificadas, mas continuam sendo a mesma `Task` derivada pelo scheduler.

## Gantt

O Gantt usa SVAR React Gantt 2.7.1 conforme o [ADR 013](decisions/013-svar-react-gantt.md).
A projeção transitória contém:

- hierarquia e tarefas-resumo abertas quando há filhos visíveis;
- intervalo civil inclusivo de início a fim, duração útil e progresso;
- relações FS com lag;
- escalas de dias, semanas e meses;
- realce de finais de semana e feriados do calendário do projeto;
- seleção no gráfico e por seletor acessível;
- foco de dependência por clique na linha ou por seletor acessível.

As datas do ProjectFlow são inclusivas. Na projeção, o fim é convertido para o
dia civil seguinte porque o renderer usa fim exclusivo. Assim, uma tarefa de
sexta a segunda ocupa corretamente sexta, sábado, domingo e segunda no eixo,
enquanto a coluna **Dias úteis** continua mostrando a duração calculada pelo
calendário do domínio.

Por padrão todas as relações aparecem. Ao clicar em uma linha, ou escolher uma
relação em **Dependência em foco**, somente aquela relação permanece visível,
com predecessor e sucessora realçados. Isso permite seguir dependências longas
sem confundi-las com as demais; **Todas as dependências** restaura o conjunto.

O renderer fica em modo somente leitura. O painel **Inspecionar tarefa** permite
alterar início e duração apenas quando isso é seguro; tarefas-resumo exibem a
explicação de que suas datas são derivadas. O salvamento usa o scheduler do
ProjectFlow e nunca o mecanismo de agendamento da biblioteca.

## Auditoria manual da Fase 4

Use o projeto **Auditoria do scheduler — Fase 3** e confira:

1. alternar Tabela, Kanban e Gantt sem recarregar o projeto;
2. mover uma tarefa no Kanban pelo seletor e confirmar o status na Tabela;
3. repetir por drag-and-drop e confirmar o mesmo resultado;
4. combinar texto, status, prioridade, conclusão, datas e tag, observando que os
   filtros permanecem ao trocar de view;
5. no Gantt, alternar Dias, Semanas e Meses;
6. conferir três tarefas-resumo, sete subtarefas, barras de progresso e oito
   relações FS;
7. conferir a numeração `1.`, `1.1.` e, quando houver, `1.1.1.` nas três views;
8. verificar que a tarefa-resumo de 28/08 a 31/08 ocupa também o dia 31;
9. clicar em uma dependência distante, conferir o isolamento e voltar para
   **Todas as dependências**;
10. verificar final de semana e o feriado de 07/09 na escala diária;
11. selecionar uma tarefa-folha predecessora no painel, atrasar seu início,
   salvar e confirmar a propagação para frente nas três views;
12. restaurar a data anterior e confirmar que as sucessoras `AUTO` também são
   antecipadas; uma sucessora `MANUAL` deve permanecer fixa e apenas receber aviso;
13. selecionar uma tarefa-resumo e confirmar que o prazo não é editável;
14. fechar e reabrir o executável, que deve iniciar maximizado, e confirmar
    persistência.

## Melhorias não bloqueantes

A Fase 4 está concluída sem depender dos itens abaixo. Eles permanecem como
candidatos para uma iteração futura de UX, depois do Checkpoint Git 5:

- ação **Hoje** e enquadramento automático do projeto no Gantt;
- navegação direta entre as duas pontas de uma dependência em foco;
- densidade compacta opcional no Kanban;
- marcos, baseline e caminho crítico somente após decisões próprias de domínio
  e scheduler — não como comportamento implícito da biblioteca de Gantt.
