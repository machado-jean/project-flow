# Instalação e manutenção no Windows

## Escopo

O alvo da V1 é Windows 11 x64. O usuário final não precisa instalar Node.js,
npm, Rust, Cargo, Git, Visual Studio Build Tools nem SQLite. O aplicativo e o
banco são locais e continuam funcionando sem conexão após a instalação.

## Artefatos

### Instalador padrão

```powershell
npm run tauri:build:installer
```

Gera um instalador NSIS em:

```text
src-tauri\target\release\bundle\nsis\
```

Essa é a opção principal para Windows 11. Se o WebView2 necessário não estiver
presente, o instalador baixa silenciosamente o bootstrapper oficial da
Microsoft; portanto, essa contingência requer internet.

### Instalador offline

```powershell
npm run tauri:build:installer:offline
```

Gera um NSIS no mesmo diretório, mas incorpora o instalador completo do
WebView2. Ele é significativamente maior e deve ser usado para preparar uma
máquina sem internet. Como os dois builds usam o mesmo nome, copie o primeiro
artefato para um diretório separado antes de gerar o segundo quando quiser
conservar ambos.

## Instalação

1. Feche o ProjectFlow se ele estiver aberto.
2. Execute o arquivo `ProjectFlow_*_x64-setup.exe`.
3. Conclua o assistente no idioma sugerido pelo Windows.
4. Abra o ProjectFlow pelo Menu Iniciar.

A instalação é feita somente para o usuário atual e não deve pedir privilégios
de administrador no fluxo normal.

## Atualização e preservação de dados

Quando o instalador gráfico encontra uma versão anterior, a interface em
português identifica explicitamente **Atualizar sem desinstalar (recomendado)**
como a opção que preserva a instalação. Quando encontra a mesma versão, oferece
**Reparar instalação**. Downgrades continuam bloqueados.

Use **Ajuda > Verificar atualizações**. A consulta ocorre somente nesse momento
e compara a versão instalada com o `latest.json` da última release estável.
Quando houver uma versão superior, **Baixar e instalar atualização** baixa o
NSIS, verifica sua assinatura criptográfica e inicia a instalação em modo
passivo. O ProjectFlow fecha durante a troca dos binários e reinicia ao final.

A alternativa offline continua abrindo o download manual no navegador, pois o
updater usa o pacote padrão menor. O uso normal do aplicativo não depende de
internet nem de nenhum runtime de desenvolvimento.

Feche o aplicativo e execute o instalador de versão mais recente. O instalador
atualiza os binários; o banco, backups e logs permanecem no perfil do usuário e
não são armazenados junto ao executável. Downgrade é bloqueado por segurança.

No ambiente atual, o banco de produção é resolvido pelo Tauri sob:

```text
%APPDATA%\com.projectflow.desktop\projectflow.sqlite
```

Antes de uma atualização importante, use **Arquivo > Backup e portabilidade**
para criar um backup manual em um local conhecido.

O arquivo privado que assina atualizações não integra o aplicativo, o
instalador ou o Git. Apenas a chave pública de validação é distribuída. A chave
privada permanente deve ser mantida fora do repositório e configurada como
segredo no ambiente que gera releases.

## Desinstalação

Use **Configurações > Aplicativos > Aplicativos instalados > ProjectFlow >
Desinstalar**. A validação final da Fase 7 deve confirmar separadamente o que o
NSIS mantém ou remove no perfil. Até essa auditoria, não se deve prometer que a
desinstalação apaga os dados pessoais; faça backup e, se desejar remoção total,
revise manualmente o diretório acima depois de desinstalar.

## Checklist de validação em máquina limpa

- Windows 11 x64 sem Node, Rust, Git ou Build Tools;
- instalar o pacote padrão conectado à internet;
- criar projeto, tarefas e backup; fechar e reabrir;
- instalar uma versão mais nova e confirmar preservação do banco;
- desinstalar e registrar o comportamento dos dados;
- repetir em uma máquina sem internet com o pacote offline;
- confirmar abertura, persistência, backup/restauração e ausência de chamadas
  remotas necessárias à interface principal;
- confirmar que nenhuma consulta ao GitHub ocorre ao iniciar e que a ação
  manual informa versão atual ou atualização disponível;
- registrar versão do Windows e do WebView2, tamanho dos pacotes e evidências.

Essa prova em máquina limpa não pode ser substituída por teste no computador de
desenvolvimento.
