# ADR 009 — Política do scheduler FS

## Estado

Aceita em 27 de agosto de 2026.

## Contexto

A Fase 3 precisa tornar previsível a propagação entre tarefas sem antecipar os
tipos SS, FF e SF. Também é necessário distinguir conflito real de mera
coincidência: duas tarefas sem relação podem ocorrer no mesmo dia.

## Decisão

Implementar somente Finish-to-Start (`FS`), apresentado em português como
Término para Início (`TI`). O lag é um inteiro não negativo contado no
calendário efetivo da sucessora. Lag zero começa no primeiro dia útil posterior
ao fim da predecessora; lag positivo acrescenta dias úteis completos.

Dependências são aceitas apenas entre tarefas-folha do mesmo projeto. O domínio
rejeita auto-dependência, duplicidade e ciclo antes da persistência. O banco
repete as invariantes estruturais que podem ser expressas em constraints e
triggers.

Tarefas `AUTO` são empurradas somente para frente, preservando duração. Remover
ou antecipar uma restrição não puxa tarefas para trás. Tarefas `MANUAL` são
preservadas e recebem conflito informativo apenas quando uma predecessora
declarada exige início posterior. Coincidência de datas sem relação não é
conflito.

## Consequências

- o resultado é determinístico e fácil de explicar;
- múltiplas predecessoras usam a restrição mais tardia;
- relações entre projetos e demais tipos de dependência ficam para trabalho futuro;
- tarefas-resumo derivam datas dos descendentes e não participam diretamente do grafo;
- toda propagação precisa ser persistida em uma transação única;
- antecipação automática poderá ser adicionada no futuro apenas como política explícita.
