# ADR 011 — Compatibilidade controlada do checksum da migration 3

- Status: aceito
- Data: 28 de agosto de 2026

## Contexto

A migration 3 existiu em builds locais com duas representações de bytes. A
diferença conhecida está somente na tradução para português das mensagens
internas de quatro triggers; tabelas, colunas, índices, constraints e
comportamento dos triggers são equivalentes. Um release antigo incorporou a
variante traduzida e recusou abrir o banco canônico já existente.

O SQLx registra um checksum SHA-384 do texto integral de cada migration. Um
banco criado inicialmente por qualquer build que contenha a outra representação
pode, portanto, registrar o hash alternativo. Excluir ou recriar um banco para
resolver essa divergência poderia apagar projetos e tarefas usados em auditoria.

## Decisão

`0003_scheduling.sql` permanece imutável na representação canônica, cujo
checksum é:

```text
1617ADF38E69528743AE170C2D96C1544E5FE4E1C43784C104DAA8F1089FAB098DFF734928DBD6A76663CCB5D3926AA2
```

A camada nativa executa uma verificação de compatibilidade antes da
inicialização do plugin SQL. Ela reconhece somente a variante legada conhecida:

```text
B0235D131954F693E45862FBDCFE8CB773D61E059058DB8CC3D8985D0786F8BB53C9B2EBB1A5E8162B1D95ED0553EA35
```

Quando e somente quando esse checksum é encontrado, o processo:

1. executa `PRAGMA quick_check`;
2. valida as três migrations aplicadas e seus checksums esperados;
3. compara todo o schema com uma referência criada pelas migrations canônicas,
   normalizando apenas as duas mensagens conhecidas presentes nos quatro
   triggers;
4. valida a versão lógica e os dados estruturais semeados pela migration 3;
5. cria um backup SQLite consistente com `VACUUM INTO` em
   `%APPDATA%\com.projectflow.desktop\backups\`;
6. abre uma transação e atualiza exclusivamente o checksum da linha 3 em
   `_sqlx_migrations`, condicionado ao valor legado ainda estar presente;
7. confirma o novo checksum e executa novamente `PRAGMA quick_check`.

Projetos, tarefas, dependências, calendários e demais dados de negócio não são
alterados. Um checksum, histórico ou schema desconhecido interrompe a
inicialização sem escrever no banco.

## Alternativas rejeitadas

- Apagar ou recriar o banco: perderia os dados reais de teste.
- Manter a variante traduzida como migration oficial: apenas inverteria quais
  bancos deixam de abrir.
- Atualizar qualquer checksum encontrado: mascararia alterações de schema e
  violaria a integridade das migrations.
- Editar manualmente o banco: não seria reproduzível, testável nem seguro para
  outros perfis.

## Consequências

- A correção é automática e idempotente para a única divergência conhecida.
- A cópia anterior ao reparo permanece disponível para recuperação.
- `0003_scheduling.sql` não pode receber novas edições; mudanças futuras exigem
  uma migration com novo número.
- Testes Rust cobrem banco já canônico, variante conhecida com preservação dos
  dados e do backup, checksum desconhecido e schema divergente.
