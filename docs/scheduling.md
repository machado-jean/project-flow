# Scheduling

Este documento descreve o comportamento implementado na Fase 3. As regras vivem em TypeScript puro em `src/domain/calendars/` e `src/domain/scheduling/`, sem React, DOM, Tauri ou SQLite.

## Datas, duração e edição

- datas de cronograma são strings `date-only` em `YYYY-MM-DD`;
- os cálculos usam UTC apenas como mecanismo interno para evitar deslocamento por timezone;
- duração é inclusiva: duração `1` significa início e fim na mesma data;
- ao informar início e duração, o fim é calculado;
- ao informar início e fim, a duração é calculada;
- ao alterar o início de uma tarefa já agendada, a duração é preservada e o fim é recalculado;
- ao alterar o fim, a duração é recalculada;
- uma data não útil digitada em tarefa `MANUAL` é preservada e recebe aviso informativo.

Tarefas sem cronograma mantêm início, fim e duração nulos. Ao persistir, os três campos devem estar todos preenchidos ou todos vazios.

## Calendário de trabalho

Cada calendário define:

- dias úteis de segunda (`1`) a domingo (`7`);
- feriados ou bloqueios por data;
- exceções positivas que liberam uma data normalmente inativa.

O calendário padrão usa segunda a sexta. A migration `0003_scheduling.sql` também cria o calendário integrado **Todos os dias**, com segunda a domingo, destinado a tarefas que devem participar automaticamente do fim de semana.

Uma tarefa usa o calendário do projeto por padrão e pode selecionar outro calendário por `calendar_id`. Nesta fase, a interface permite editar a semana e as exceções do calendário do projeto e escolher **Todos os dias** nos detalhes de uma tarefa.

Calendários são entidades compartilháveis. Alterar dias úteis ou exceções afeta
todos os projetos e tarefas que referenciam aquele calendário; a interface
informa esse alcance antes da edição.

Funções puras disponíveis:

```text
isWorkingDay()
onOrNextWorkingDay()
nextWorkingDay()
addWorkingDays()
workingDaysBetween()
endDateForDuration()
```

Salvar uma alteração de calendário recalcula as tarefas `AUTO` diretamente afetadas, propaga seus sucessores e persiste calendário e tarefas na mesma transação. Tarefas `MANUAL` não são deslocadas.

## Dependência Término para Início

O único tipo aceito na V1 atual é Finish-to-Start (`FS`), apresentado na interface como **Término para Início (TI)**.

Para cada predecessora:

```text
início mínimo da sucessora =
  adicionar_dias_úteis(
    calendário efetivo da sucessora,
    fim da predecessora,
    lag + 1
  )
```

Consequências práticas:

- predecessora termina sexta, calendário segunda–sexta e lag `0`: sucessora começa segunda;
- predecessora termina sexta, calendário **Todos os dias** e lag `0`: sucessora começa sábado;
- no mesmo calendário contínuo, lag `1`: sucessora começa domingo;
- com múltiplas predecessoras, vale a data mínima mais tardia;
- lag é inteiro não negativo e representa dias úteis completos entre as tarefas.

Dependências são permitidas somente:

- entre tarefas do mesmo projeto;
- entre tarefas-folha, sem subtarefas;
- sem auto-dependência;
- sem relação duplicada;
- quando o grafo permanece acíclico.

Ao criar uma subtarefa, uma tarefa passa a ser resumo e, portanto, não pode manter dependências. Domínio e SQLite aplicam a mesma restrição. Dependências entre projetos permanecem explicitamente fora do escopo desta fase.

## Propagação e modos

O cálculo usa validação do grafo, ordenação topológica e somente o subgrafo de sucessores afetados.

Para tarefa `AUTO`:

1. calcular a restrição mais tardia;
2. mover apenas quando o início atual é anterior à restrição;
3. preservar duração;
4. recalcular fim com o calendário efetivo da sucessora;
5. continuar em cascata.

A política é conservadora: remover uma relação ou antecipar uma predecessora não puxa tarefas para trás automaticamente.

Para tarefa `MANUAL`:

- datas nunca são deslocadas pelo scheduler;
- se uma predecessora declarada exigir início posterior, é apresentado um conflito informativo com a data mínima;
- tarefas distintas que apenas coincidem na mesma data não geram conflito;
- sem dependência declarada, não existe restrição a verificar.

Uma tarefa `AUTO` com predecessora, mas sem duração, também recebe aviso porque ainda não pode ser reposicionada com segurança.

## Tarefas-resumo

Uma tarefa com descendentes tem cronograma derivado:

```text
início = menor início dos descendentes agendados
fim    = maior fim dos descendentes agendados
```

A duração é a quantidade inclusiva de dias úteis no intervalo, conforme o calendário da tarefa-resumo. Início, fim, duração, modo, calendário e predecessoras ficam bloqueados na linha de resumo. As relações devem ser criadas entre as subtarefas.

## Transação

O domínio calcula primeiro um resultado completo e válido. O caso de uso envia um `ScheduleChangeSet` ao comando nativo `apply_schedule_changes`, que grava em uma única transação SQLite:

- alterações de calendário;
- exclusões de árvores e dependências;
- dependências criadas ou editadas;
- todas as tarefas recalculadas, inclusive resumos;
- tags afetadas.

Na Tabela, campos da tarefa e alterações de lag são rascunhos da mesma linha.
O único botão **Salvar** na coluna Ações envia ambos no mesmo `ScheduleChangeSet`;
nenhuma alteração de lag é persistida enquanto o usuário apenas digita.

Qualquer falha cancela o conjunto inteiro. Existe teste Rust que provoca uma segunda alteração inválida e comprova que a primeira também é revertida.

Na abertura do workspace, o mesmo cálculo reconcilia cadeias automáticas e
resumos de bancos anteriores à Fase 3. Apenas diferenças são persistidas;
tarefas `MANUAL` não são alteradas e seus avisos são reconstruídos.

## Matriz de auditoria

| Caso obrigatório | Evidência automatizada |
| --- | --- |
| A → B, lag zero e preservação da duração | `tests/unit/domain/scheduling.test.ts` |
| A → B → C e propagação | `tests/unit/domain/scheduling.test.ts` |
| A e B → C, restrição mais tardia | `tests/unit/domain/scheduling.test.ts` |
| lag positivo | `tests/unit/domain/scheduling.test.ts` |
| sexta → segunda | testes de calendário, scheduler e UI |
| feriado e exceção positiva | testes de calendário e UI |
| alteração sem impacto e política conservadora | `tests/unit/domain/scheduling.test.ts` |
| tarefa MANUAL e conflito informativo | testes de scheduler e UI |
| ciclo, auto-dependência, relação duplicada | testes de scheduler/domínio |
| mesma origem de projeto e tarefas-folha | testes de scheduler e constraints SQLite |
| resumo | testes de scheduler e UI |
| resultado múltiplo e rollback transacional | testes TypeScript e Rust |
| datas não úteis explícitas | testes de scheduler e UI |
| calendário contínuo no fim de semana | testes de calendário, scheduler e UI |
| grafo recriado com identidades independentes | teste de scheduler; duplicação funcional pertence à Fase 5 |

## Cenário manual de auditoria

O banco local de desenvolvimento contém o projeto **Auditoria do scheduler —
Fase 3**. Ele não é versionado; uma cópia consistente fica em
`.local/backups/`. O cenário possui três tarefas-resumo, sete subtarefas e oito
dependências FS.

| Tarefa | Relação principal | Resultado esperado |
| --- | --- | --- |
| Mapear requisitos | origem da cadeia | 28/08/2026, sexta-feira |
| Definir arquitetura | requisitos, lag 0 | 31/08/2026, segunda-feira |
| Desenvolver domínio | arquitetura, lag 1 | 02–03/09/2026 |
| Integrar persistência | arquitetura e domínio, lag 0 | 04/09/2026; vence a restrição de domínio |
| Executar testes integrados | domínio lag 0 e persistência lag 1 | 09–11/09/2026; respeita o feriado de 07/09 |
| Executar validação no fim de semana | testes, lag 0, calendário Todos os dias | 12–13/09/2026, sábado e domingo |
| Revisar marco manual | persistência, lag 1 | permanece em 04/09 e informa início mínimo em 09/09 |

As tarefas-resumo devem apresentar, respectivamente, 28–31/08, 02–04/09 e
04–13/09. Fechar e reabrir o release deve preservar as dez tarefas, as oito
relações, o feriado e o conflito manual.

## Fora do escopo da Fase 3

- dependências SS, FF e SF;
- dependências entre projetos;
- antecipação automática após remover restrições;
- caminho crítico e nivelamento de recursos;
- duplicação de tarefa/projeto, cuja implementação pertence à Fase 5;
- Kanban e Gantt, pertencentes à Fase 4.
