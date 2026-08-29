# Importação e exportação

Importação, exportação e backup ainda não foram implementados.

O schema local atual é a versão 3. Quando a Fase 6 começar, o pacote deverá
preservar semanticamente calendários, dias úteis, feriados/exceções, projetos,
tarefas, calendário opcional por tarefa, hierarquia, tags e dependências FS com
lag, além das entidades introduzidas até lá.

Numeração hierárquica, seleção, filtros, zoom e dependência em foco são
projeções derivadas ou estado efêmero das views. Eles não devem ser serializados
como entidades de negócio. Ao importar, a numeração será reconstruída de
`parent_id` e `position`.

## Formato planejado

A extensão provisória é `.projectflow`, com conteúdo ZIP:

```text
manifest.json
data.sqlite
attachments/
README.txt
```

O manifest deverá identificar formato, `schemaVersion`, versão da aplicação, tipo de exportação e instante de geração.

## Regras de segurança

- validar assinatura de formato, schema, versão e limites antes de escrever;
- impedir path traversal e entradas ZIP inesperadas;
- não executar conteúdo importado;
- importar em staging/transação;
- cancelar toda a operação em falha relevante;
- nunca sobrescrever silenciosamente o workspace atual;
- testar round trip semântico em workspace vazio.

Diretórios `.local/imports`, `.local/exports` e `.local/backups` estão reservados e ignorados durante desenvolvimento. A implementação e a especificação final do pacote pertencem à Fase 6.
