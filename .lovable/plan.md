# Estabilizar o scraper do Mercado Livre sem API oficial

## Objetivo
Manter a coleta pelo HTML atual, reduzir o padrão que provocou o CAPTCHA e deixar o fluxo preparado para sair por outro IP quando houver um proxy adequado.

## Alterações

### `supabase/functions/_shared/ml-scrapper-template.json`
- Alterar o nó `Extrair HTML1` de 5 consultas simultâneas para 1 consulta por vez, com intervalo maior entre páginas.
- Reconhecer explicitamente a página `abuse-captcha` / `captcha-wall` / “Segurança — Mercado Livre”.
- Ao encontrar CAPTCHA, parar aquela execução com um erro claro, sem marcar categorias como vazias e sem concluir falsamente com zero produtos.
- Manter o extrator, os filtros, a geração de `meli.la`, a tabela e o robô como já funcionam hoje.

### `supabase/functions/_shared/ml-scrapper-template.ts`
- Fixar o agendamento padrão do Mercado Livre em 8 horários distribuídos ao longo do dia.
- Aplicar as proteções de ritmo ao gerar/regravar qualquer workflow de Mercado Livre.
- Adicionar suporte opcional a proxy por job, sem obrigá-lo: sem proxy configurado, o fluxo continua usando o IP da VPS.

### `supabase/functions/n8n-sync/index.ts`
- Regravar somente os workflows ativos do Mercado Livre com o template corrigido.
- Preservar todas as configurações atuais de categorias, descontos, comissão, tabela e afiliado.

### `roadmap.md` e `AGENTS.md`
- Registrar a entrega e a decisão de manter coleta HTML com ritmo controlado e proxy opcional.

## Proxy
Proxy residencial não é o Wi‑Fi da sua casa. É um serviço que faz somente as requisições do Mercado Livre saírem por IPs de internet residencial brasileira. Proxy comum de datacenter pode continuar bloqueado; trocar para outra VPS também pode funcionar temporariamente, mas o novo IP pode ser bloqueado novamente.

O suporte será opcional. Para ativá-lo depois, será necessário um endereço de proxy HTTP/HTTPS brasileiro com usuário e senha. Esses dados serão guardados com segurança, não no código.

## Resultado esperado
O scraper rodará 8 vezes por dia, lentamente, encerrará de forma correta quando houver CAPTCHA e poderá usar um novo IP sem trocar toda a VPS. Se o IP atual já estiver bloqueado, reduzir a frequência evita piorar, mas pode não remover o bloqueio existente imediatamente; nesse caso será necessário trocar a saída por VPS/IP novo ou proxy residencial.
