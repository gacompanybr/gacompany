# Restaurar coleta conservadora do Mercado Livre na VPS

## Objetivo
Voltar a coletar pelo HTML usando o próprio IP da VPS, reproduzindo o padrão que já funcionou e reduzindo os sinais de automação.

## Alterações

### Coletor do Mercado Livre
- Simplificar as URLs de busca, removendo filtros embutidos como `CustoFrete`, `DiscountRange` e `NoIndex`; desconto e qualidade continuam filtrados depois da coleta.
- Enviar um conjunto coerente de cabeçalhos de navegador, incluindo idioma, navegação, origem e cookie da sessão atual.
- Buscar somente uma categoria por execução, alternando automaticamente entre as categorias nos oito horários diários.
- Buscar somente uma página por execução e limitar a entrada a poucos produtos válidos, encerrando cedo.
- Manter a execução sequencial, com pausa variável, e interromper imediatamente ao detectar CAPTCHA.

### Compatibilidade
- Preservar criação dos links `meli.la`, tabela, deduplicação, seleção final e envio ao WhatsApp.
- Manter proxy opcional, mas não necessário para este teste.
- Aplicar a mesma configuração aos dois coletores ativos do Mercado Livre.

### Validação
- Regravar os dois fluxos ativos.
- Executar primeiro uma coleta controlada e confirmar se retorna HTML de produtos ou CAPTCHA.
- Se ainda vier CAPTCHA com o cookie atual, informar claramente que a sessão precisa ser renovada; não recomendar compra de proxy antes desse teste.
