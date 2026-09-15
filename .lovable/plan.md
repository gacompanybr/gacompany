# Áudio pontual nas campanhas SDR

## Resultado
- Adicionar uma configuração por campanha para ativar ou desativar áudio.
- Permitir áudio somente na primeira abordagem e em mensagens longas; mensagens comuns e follow-ups permanecem em texto.
- Usar voz brasileira gerada pelo Google Cloud Text-to-Speech e enviar como áudio do WhatsApp pela conexão já existente.

## Alterações
- Incluir na criação da campanha os controles de áudio, com limite ajustável para considerar uma mensagem longa.
- Salvar essas preferências na própria campanha e mostrá-las no resumo da campanha ativa.
- No envio, gerar apenas um áudio quando a regra permitir, mantendo as demais partes em texto e respeitando os intervalos atuais.
- Se a geração ou o envio do áudio falhar, enviar o texto normalmente para não perder o contato.
- Registrar a mensagem na conversa da mesma forma que hoje, indicando internamente que ela foi enviada em áudio.

## Segurança e validação
- Guardar a credencial do Google Cloud de forma protegida, sem colocá-la no site ou no código.
- Validar o tamanho do texto, os formatos aceitos e a resposta do WhatsApp.
- Testar criação de campanha com áudio ligado/desligado, introdução, texto longo e fallback para texto.

## Detalhes técnicos
- Novos campos em `sdr_campaigns`: ativação, áudio na introdução, áudio para texto longo e limite de caracteres.
- Síntese via Google Cloud Text-to-Speech em português do Brasil, produzindo áudio compatível com o envio de voz pela Evolution API.
- Alterações concentradas no formulário da campanha, criação da campanha e worker do SDR.
