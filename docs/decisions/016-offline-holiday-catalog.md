# ADR 016 — Catálogo offline de feriados

## Status

Aceito em 29 de agosto de 2026.

## Contexto

O scheduler precisa considerar feriados nacionais, estaduais e móveis sem exigir
que o usuário cadastre cada data e sem introduzir um serviço remoto na V1.
Cobertura municipal uniforme não está disponível na fonte avaliada.

## Decisão

Usar `date-holidays` 3.36.0 como dependência npm local, carregada sob demanda.
A interface consulta Brasil e, opcionalmente, uma UF apenas para os anos usados
nas tarefas. Feriados `public` são pré-selecionados; `bank` e `optional` exigem
seleção explícita. Colisões com exceções existentes são bloqueadas.

Feriados municipais permanecem como exceções manuais. As datas escolhidas são
gravadas na entidade existente `calendar_exceptions`, sem migration ou vínculo
vivo com a biblioteca. Assim, cronogramas continuam reproduzíveis mesmo após
uma atualização futura do catálogo.

## Consequências

- funcionamento integralmente offline e sem API, chave ou telemetria;
- o chunk sob demanda adiciona aproximadamente 1,42 MB ao build (cerca de 237 KB
  comprimido) sem aumentar o chunk inicial principal;
- código da biblioteca sob ISC e dados sob CC BY-SA 3.0 exigem atribuição, mantida
  na interface e em `THIRD_PARTY_NOTICES.md`;
- atualizações da biblioteca não alteram silenciosamente exceções já importadas;
- municípios exigem manutenção manual pelo usuário nesta versão.
