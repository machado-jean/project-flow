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
- Diálogos modais movem o foco para uma ação segura, prendem `Tab`/`Shift+Tab`,
  fecham com `Esc` quando permitido e restauram o foco ao acionador.
- A confirmação destrutiva de restauração começa em **Cancelar**.
- O Kanban mantém o seletor **Status** como alternativa ao arrastar, anuncia a
  gravação e apresenta datas no formato `DD/MM/AAAA`.
- Textos operacionais e auxiliares deixaram de depender de tamanhos entre 7 e
  9 px; cores secundárias ganharam contraste e o modo de cores forçadas recebe
  contornos explícitos.
- A preferência de redução de movimento continua respeitada.

## Evidências

- 94 testes TypeScript/React regulares, incluindo foco preso e restaurado em
  diálogo, fechamento de menu com `Esc`, projeto atual, legenda da Tabela,
  estado dos detalhes e data localizada no Kanban.
- A árvore de acessibilidade da janela Tauri real expôs os landmarks
  **Projetos**, **Menu principal** e **principal**, a tablist das três views, os
  filtros nomeados e a Tabela com sua legenda.
- O executável local recompilado foi inspecionado maximizado sem recortes dos
  controles principais.
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
4. abra um diálogo de importação ou template, percorra-o com `Tab` e
   `Shift+Tab`, feche com `Esc` e confirme o retorno do foco;
5. percorra Tabela, Kanban e Gantt com setas, `Home` e `End`;
6. no Kanban, altere uma tarefa pelo seletor **Status**, sem arrastar;
7. confira a interface com escala do Windows em 125% e 150%, quando disponíveis.

## Limites conhecidos

- O renderer SVAR fornece a camada visual do Gantt. As informações essenciais
  e a edição permanecem disponíveis nos controles nativos do ProjectFlow e na
  Tabela, que é a interface acessível de referência.
- A validação com Narrador e diferentes escalas do Windows deve ser repetida no
  instalador da próxima release, na VM limpa. Essa pendência pertence ao teste
  de distribuição e não invalida os controles semânticos automatizados.
- O harness automatizado da janela Tauri permanece diagnóstico pela regressão
  WebView2 registrada no ADR 019; o gate obrigatório continua em camadas.
