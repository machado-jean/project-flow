# Scheduling

O scheduler ainda não foi implementado. A Fase 2 já persiste datas, duração,
modo de agendamento e os dias úteis do calendário; nenhum recálculo automático
é executado ainda. Este documento registra o contrato que orientará a Fase 3.

## Fronteira

As regras serão TypeScript puro em `src/domain/scheduling/`, sem React, DOM ou chamadas Tauri. Persistência acontecerá somente depois de um cálculo válido e dentro de transação.

## Semântica inicial

- datas são `date-only` em `YYYY-MM-DD`;
- duração `1` começa e termina no mesmo dia útil;
- calendário padrão: segunda a sexta;
- dias úteis são configuráveis de segunda (1) a domingo (7), permitindo
  atividades de fim de semana sem mudança de schema;
- a interface de configuração, feriados e exceções entram na Fase 3;
- MVP de dependências: somente Finish-to-Start (FS);
- múltiplos predecessores usam a restrição mais tardia;
- tarefas `AUTO` podem ser empurradas para frente;
- tarefas `MANUAL` não são deslocadas automaticamente;
- remover ou antecipar uma restrição não puxa tarefas para trás na V1;
- ciclos e auto-dependências são rejeitados antes de persistir.

Regra conceitual FS:

```text
início mínimo do sucessor = próximo dia útil(fim do predecessor + lag)
```

As APIs `validateGraph`, `detectCycle`, `topologicalSort`, `calculateEarliestStart` e `rescheduleAffectedTasks` só serão criadas junto com os casos obrigatórios de teste definidos em `AGENTS.md`.
