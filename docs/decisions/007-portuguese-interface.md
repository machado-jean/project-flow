# ADR 007 — Interface em português

## Estado

Aceita em 27 de agosto de 2026.

## Contexto

A linguagem da interface precisava ser definida antes de expandir componentes,
mensagens e fluxos. Os códigos persistidos também precisam permanecer estáveis
para não acoplar dados à apresentação.

## Decisão

A interface da V1 será integralmente em português. Rótulos, ações, estados
vazios, confirmações e erros destinados ao usuário devem ser escritos em
português.

Códigos internos estáveis, como `ACTIVE`, `NOT_STARTED` e `AUTO`, permanecem
independentes do idioma. A camada de apresentação os converte usando mapas de
rótulos tipados. Nomes de APIs e identificadores técnicos não precisam ser
traduzidos.

## Consequências

- novas telas e mensagens devem manter o português como padrão;
- valores persistidos não mudam quando um rótulo é refinado;
- uma eventual localização futura poderá reutilizar a separação entre código e
  rótulo, mas internacionalização não entra no escopo da V1;
- testes de interface devem verificar os textos destinados ao usuário.
