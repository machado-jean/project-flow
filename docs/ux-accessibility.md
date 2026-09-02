# Auditoria de UX e acessibilidade

## Escopo

Esta auditoria fecha o incremento local de UX e acessibilidade da Fase 7. Ela
abrange a interface desktop em português, navegação por teclado, semântica
exposta pelo WebView2, foco, legibilidade e comportamento na largura mínima da
janela. Não altera regras de negócio, schema SQLite nem dados do usuário.

O resultado é uma verificação técnica orientada pelos requisitos do
`AGENTS.md`; não deve ser apresentado como certificação formal de conformidade
com WCAG.

## Correções incorporadas

- Um link **Ir para o conteúdo principal** permite ignorar a lista de projetos.
- O projeto selecionado expõe `aria-current="page"`.
- A Tabela possui legenda acessível e os botões de hierarquia e detalhes
  expõem o estado aberto por `aria-expanded`.
- A ajuda do código visual pode receber foco e está associada à sua explicação.
- A contagem dos filtros anuncia alterações de forma não interruptiva.
- As abas Tabela, Kanban e Gantt preservam navegação por setas, `Home` e `End`.
- Menus superiores fecham com `Esc` e devolvem o foco ao título do menu.
- O menu **Ajuda > Atalhos de teclado**, também acessível por `Ctrl+/`, reúne
  somente comandos realmente disponíveis na aplicação.
- Os detalhes de uma tarefa podem ser recolhidos com `Esc`; o foco retorna ao
  botão **Detalhes** da mesma linha.
- Diálogos modais movem o foco para uma ação segura, prendem `Tab`/`Shift+Tab`,
  fecham com `Esc` quando permitido e restauram o foco ao acionador.
- A confirmação destrutiva de restauração começa em **Cancelar**.
- O Kanban mantém o seletor **Status** como alternativa ao arrastar, anuncia a
  gravação e apresenta datas no formato `DD/MM/AAAA`. O destino do arraste é
  realçado; a alça dedicada usa Pointer Events, validados no WebView2 real.
- O Gantt mantém o inspetor nativo como alternativa aos gestos. Em tarefas
  automáticas, mover a barra ajusta o lag FS; a borda esquerda permanece
  protegida, a direita altera a duração e tarefas-resumo não têm edição direta.
- Feedback visível e região de status anunciam gravação, limites FS e quantidade
  de lags alterados. Botões **Desfazer**/**Refazer** complementam `Ctrl+Z` e
  `Ctrl+Y` fora de campos de formulário.
- O menu de contexto do Gantt é o fluxo principal para adicionar predecessora
  FS e excluir uma relação. A lista mostra somente tarefas executáveis que
  terminam antes da sucessora; `Esc` fecha esse menu.
- Textos operacionais e auxiliares deixaram de depender de tamanhos entre 7 e
  9 px; cores secundárias ganharam contraste e o modo de cores forçadas recebe
  contornos explícitos.
- A preferência de redução de movimento continua respeitada.

## Evidências

- 117 testes TypeScript/React regulares, incluindo foco preso e restaurado em
  diálogo, fechamento de menu com `Esc`, projeto atual, legenda da Tabela,
  menu de atalhos, fechamento dos detalhes, arraste no Kanban, edição temporal
  do Gantt, conclusão pelo marcador, ajuste automático de lag FS, normalização
  de dia não útil e menus de contexto de tarefa/dependência,
  recálculo interno de resumo e criação visual de FS.
- A árvore de acessibilidade da janela Tauri real expôs os landmarks
  **Projetos**, **Menu principal** e **principal**, a tablist das três views, os
  filtros nomeados e a Tabela com sua legenda.
- O executável local recompilado foi inspecionado maximizado sem recortes dos
  controles principais.
- No executável Tauri/WebView2 real, um cartão foi movido entre colunas do
  Kanban e restaurado; a borda final de uma tarefa com predecessora foi ampliada
  e o cronograma foi restaurado para confirmar persistência no SQLite.
- Em `1024 × 720` e na largura mínima de `960 px`, documento e `body` mantiveram
  a mesma largura do viewport, sem rolagem horizontal global. A Tabela conserva
  rolagem própria porque todas as colunas permanecem disponíveis.

Os gates completos e seus comandos ficam em [environment.md](environment.md).

## Alternativas acessíveis por visualização

| Interação visual | Alternativa disponível |
| --- | --- |
| Arrastar cartão no Kanban | Seletor **Status** no próprio cartão |
| Ler progresso por cor | Percentual textual no cartão e na Tabela |
| Seguir dependência no Gantt | Seletor de dependência e dados equivalentes na Tabela |
| Editar barra temporal | Inspetor com campos nativos de início e duração |
| Identificar conflito por destaque | Mensagem textual na linha e resumo de conflitos |

## Roteiro manual para o release

Na VM Windows limpa:

1. pressione `Tab` a partir da janela e confirme foco visível no link de salto e
   nos controles seguintes;
2. use o link de salto e confirme que o foco chega ao conteúdo principal;
3. abra **Arquivo**, navegue até uma ação e use `Esc`;
4. pressione `Ctrl+/`, percorra o menu de atalhos e feche-o com `Esc`;
5. abra os detalhes de uma tarefa, entre em um campo e use `Esc`; confirme que
   os detalhes fecham e o foco retorna ao botão **Detalhes**;
6. abra um diálogo de importação ou template, percorra-o com `Tab` e
   `Shift+Tab`, feche com `Esc` e confirme o retorno do foco;
7. percorra Tabela, Kanban e Gantt com setas, `Home` e `End`;
8. no Kanban, altere uma tarefa pelo seletor **Status**, sem arrastar;
9. confira a interface com escala do Windows em 125% e 150%, quando disponíveis.

## Limites conhecidos

- O renderer SVAR fornece a camada visual do Gantt. As informações essenciais
  e a edição permanecem disponíveis nos controles nativos do ProjectFlow e na
  Tabela, que é a interface acessível de referência.
- A validação com Narrador e diferentes escalas do Windows deve ser repetida no
  instalador da próxima release, na VM limpa. Essa pendência pertence ao teste
  de distribuição e não invalida os controles semânticos automatizados.
- O harness automatizado da janela Tauri permanece diagnóstico pela regressão
  WebView2 registrada no ADR 019; o gate obrigatório continua em camadas.
