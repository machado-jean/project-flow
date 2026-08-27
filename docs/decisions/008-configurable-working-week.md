# ADR 008 — Semana de trabalho configurável

## Estado

Aceita em 27 de agosto de 2026.

## Contexto

O calendário inicial trabalha de segunda a sexta, mas alguns projetos podem ter
atividades aos sábados ou domingos. Fixar “fim de semana” como período sempre
inativo criaria uma limitação de domínio e exigiria migration futura.

## Decisão

Cada calendário possui um conjunto normalizado de dias úteis, representados de
1 a 7, de segunda a domingo. O calendário padrão é criado com os dias 1 a 5.
Sábado e domingo podem ser incluídos no mesmo modelo.

A tela de configuração, feriados, exceções e as funções de cálculo pertencem à
Fase 3. O scheduler não deverá presumir que sábado e domingo são sempre dias não
úteis; deverá consultar o calendário associado ao projeto.

## Consequências

- atividades de fim de semana não exigirão alteração do schema;
- o comportamento inicial continua simples e previsível, de segunda a sexta;
- testes do scheduler deverão cobrir calendários com sábado e/ou domingo úteis;
- calendários precisam possuir pelo menos um dia útil válido.
