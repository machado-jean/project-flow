# ADR 009 — Política do scheduler FS

## Estado

Aceita em 27 de agosto de 2026 e revisada em 28 de agosto de 2026 após auditoria
manual da propagação regressiva.

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

Tarefas `AUTO` com predecessoras são alinhadas à restrição FS mais tardia,
preservando duração. Se uma predecessora termina mais tarde, a sucessora é
atrasada; se termina mais cedo, a sucessora é antecipada. O mesmo cálculo segue
em cascata pela ordem topológica.

Uma folga intencional deve ser expressa pelo lag. Uma data controlada diretamente
deve usar o modo `MANUAL`, que continua preservado e recebe conflito informativo
apenas quando uma predecessora declarada exige início posterior. Coincidência de
datas sem relação não é conflito.

Ao remover uma relação, predecessoras restantes continuam determinando a data.
Ao remover a última predecessora, a data atual é mantida: sem baseline, restrição
ou outra âncora, o domínio não possui uma data anterior correta para inferir.

## Consequências

- o resultado é determinístico e fácil de explicar;
- múltiplas predecessoras usam a restrição mais tardia;
- relações entre projetos e demais tipos de dependência ficam para trabalho futuro;
- tarefas-resumo derivam datas dos descendentes e não participam diretamente do grafo;
- toda propagação precisa ser persistida em uma transação única;
- tarefas automáticas com relação não preservam folgas implícitas; use lag ou
  modo manual conforme a intenção.

## Histórico da decisão

A versão inicial adotava propagação conservadora somente para frente. A
auditoria do usuário demonstrou que concluir uma predecessora antes do previsto
deve liberar e antecipar suas sucessoras automáticas. A política foi revisada
explicitamente, com testes de unidade, cadeia, múltiplas predecessoras,
interface e persistência transacional.
