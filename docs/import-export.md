# Importação, exportação e backup

A Fase 6 implementa portabilidade local e offline em duas camadas distintas:

- pacotes `.projectflow` permitem transportar um projeto ou um workspace e escolher o conteúdo que será importado;
- backups `.sqlite` são snapshots integrais destinados à recuperação do mesmo workspace.

Nenhuma operação envia dados para a rede. Os seletores de arquivo são nativos do Windows e toda leitura, validação e escrita ocorre no processo Tauri.

## Pacote `.projectflow` versão 1

O arquivo é um ZIP sem compressão e contém exatamente:

```text
manifest.json
data.sqlite
README.txt
```

Entradas adicionais, duplicadas, comprimidas, simbólicas ou com caminho não confinado são rejeitadas. `attachments/` está reservado para uma evolução futura e não é aceito na versão 1.

O manifest registra `format`, `formatVersion`, `schemaVersion`, `appVersion`, `exportType`, instante RFC 3339, tamanho e SHA-256 do banco, além dos catálogos de projetos e templates. Esses catálogos incluem UUID, nome, atualização e quantidade de itens e são comparados ao conteúdo real de `data.sqlite` antes da prévia.

Limites da versão 1:

- pacote: 512 MiB;
- `data.sqlite`: 500 MiB;
- `manifest.json`: 256 KiB;
- `README.txt`: 64 KiB;
- somente schema SQLite 4 e formato 1.

## Exportação

**Exportar projeto** cria um snapshot consistente contendo apenas o projeto selecionado, suas tarefas, tags, dependências e calendários referenciados. Templates globais e outros projetos não são incluídos.

**Exportar workspace** inclui todos os projetos, calendários e templates. O SQLite é copiado com `VACUUM INTO`; o pacote é montado em staging e publicado no caminho escolhido somente depois de finalizado.

## Importação seletiva

Timestamps de auditoria aceitam as duas representações UTC RFC 3339 produzidas
pelas camadas do ProjectFlow: sufixo `Z` e offset `+00:00`. Valores com
`+00:00` são normalizados para `Z` ao entrarem no domínio. Novas exportações e
registros criados pela camada nativa usam diretamente o formato canônico com
`Z`; datas de cronograma continuam independentes, em `YYYY-MM-DD`.

O pacote inteiro é validado antes da tela de escolha. Cada projeto oferece:

- **Importar** quando o UUID ainda não existe: preserva os UUIDs originais;
- **Atualizar projeto** quando o UUID existe: substitui integralmente apenas aquele projeto, preservando sua posição local;
- **Importar como cópia**: gera novos UUIDs para projeto, tarefas e dependências, reconstrói pais e relações internas e acrescenta `— importado` ao nome;
- **Não importar**.

Templates podem ser selecionados individualmente. Um template com UUID já existente é substituído integralmente; um UUID novo é inserido.

Não existe merge tarefa a tarefa. Essa política evita inferir incorretamente se uma tarefa ausente no pacote foi excluída, ocultada ou ficou fora da seleção, e mantém hierarquia e dependências como uma unidade coerente.

Calendários necessários são importados automaticamente. UUID inexistente é preservado; conteúdo semanticamente igual reutiliza o calendário local; UUID igual com conteúdo diferente cria uma cópia e remapeia somente os projetos e tarefas importados. Outros projetos locais não são alterados.

Antes de qualquer importação com escrita, um snapshot verificado é criado na pasta de backups. Projetos e templates selecionados são gravados em uma única transação; qualquer erro desfaz todo o conjunto.

## Backup e restauração

**Criar backup** abre o seletor nativo do Windows para o usuário escolher pasta
e nome. O arquivo `.sqlite` é montado em um destino temporário, validado por
`quick_check`, chaves estrangeiras e versão do schema e só então publicado no
caminho escolhido.

**Restaurar backup** é separado da importação seletiva. Após validar o arquivo e mostrar seu conteúdo, substitui o workspace completo em uma transação. Imediatamente antes, cria outro backup de segurança.

Durante desenvolvimento os backups ficam em `.local/backups/`. Na distribuição ficam em `backups/` dentro do diretório de configuração do aplicativo.

Essa pasta interna é usada somente pelos backups automáticos de segurança. Para
facilitar o suporte sem expor uma ação técnica na barra principal, **Dados →
Mais opções → Abrir pasta de backups automáticos** abre o local correto no
Explorador de Arquivos.

## Segurança e integridade

Antes de escrever, o ProjectFlow verifica tamanho do pacote e entradas, caminhos confinados, conjunto exato de arquivos, manifest estrito, data, SHA-256, `PRAGMA quick_check`, `PRAGMA foreign_key_check`, schema, catálogo, hierarquia, referências, ciclos, seleção e colisões de UUID. O conteúdo importado nunca é executado e a extração usa leitura limitada.

## Auditoria manual

1. Exporte um projeto, altere uma tarefa e importe usando **Atualizar projeto**; confirme que somente ele voltou ao estado exportado.
2. Importe novamente como cópia; confirme um novo projeto independente, com hierarquia e predecessoras preservadas.
3. Exporte o workspace, modifique dois projetos e importe apenas um; confirme que o não selecionado não mudou.
4. Crie um backup, faça uma alteração e use **Restaurar backup**; confirme a restauração integral após reabrir o executável.

Os testes Rust reproduzem o round-trip `workspace A → exportação → workspace vazio → importação → comparação semântica`, substituição seletiva, cópia de identidades e relações, rejeição de ZIP inseguro e restauração integral.
