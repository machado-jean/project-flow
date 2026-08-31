# ADR 018 — Verificação manual de atualização pelo GitHub Releases

## Estado

Aceita em 30/08/2026 para a Fase 7.

## Contexto

O ProjectFlow precisa informar quando existe uma versão Windows mais recente,
mas a primeira política de distribuição não usará o updater automático do
Tauri nem suas chaves de assinatura. O aplicativo deve continuar plenamente
funcional offline e não deve fazer consultas remotas silenciosas.

O repositório público publica releases SemVer com instaladores de nomes fixos.
O GitHub fornece uma API para a release estável mais recente e links permanentes
no formato `/releases/latest/download/<asset>`.

## Decisão

Adicionar **Ajuda > Verificar atualizações** como ação exclusivamente manual.
Ao acioná-la, o frontend consulta somente:

```text
https://api.github.com/repos/machado-jean/project-flow/releases/latest
```

A resposta deve representar uma release publicada, não preliminar, com tag
SemVer e o asset `ProjectFlow-Windows-x64-Setup.exe`. A versão é comparada com a
versão do `package.json`. Se houver versão superior, o usuário pode abrir no
navegador padrão um dos links permanentes:

```text
https://github.com/machado-jean/project-flow/releases/latest/download/ProjectFlow-Windows-x64-Setup.exe
https://github.com/machado-jean/project-flow/releases/latest/download/ProjectFlow-Windows-x64-Offline-Setup.exe
```

O ProjectFlow não baixa, executa nem instala o arquivo. O usuário mantém o
controle do download e da instalação manual.

Usar o plugin oficial Tauri Opener com capability restrita aos dois endereços
acima. A CSP permite conexão somente a `api.github.com`, além dos canais locais
já existentes.

## Privacidade e operação offline

Nenhuma consulta ocorre na inicialização. O único tráfego é a requisição
solicitada pelo usuário ao GitHub; nenhum projeto, tarefa, banco, configuração
ou identificador interno é enviado pelo ProjectFlow. Falha de rede apenas gera
mensagem informativa e não afeta as demais funções.

## Consequências

- Não são necessárias chaves do updater Tauri.
- Não há atualização silenciosa ou automática.
- O GitHub e a conexão do usuário são necessários apenas para verificar ou
  baixar uma versão.
- O usuário deve executar manualmente o instalador e continua responsável por
  confirmar sua origem e integridade.
- Uma futura migração para instalação automática exigirá nova decisão,
  assinatura obrigatória do updater e política segura para a chave privada.

## Fontes oficiais

- [GitHub — Linking to releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)
- [GitHub — REST API for releases](https://docs.github.com/en/rest/releases/releases)
- [Tauri — Opener](https://v2.tauri.app/plugin/opener/)
