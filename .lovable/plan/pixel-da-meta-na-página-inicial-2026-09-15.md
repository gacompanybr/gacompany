# Pixel da Meta na página inicial

## Resultado
- Instalar o Pixel da Meta `913139828127240` somente na página inicial.
- Registrar a conversão padrão `Lead` quando o formulário válido for enviado.
- Não enviar nome, telefone, Instagram, faturamento ou outros dados pessoais ao Pixel.

## Privacidade
- Como a escolha de consentimento foi pulada, usar a opção segura sem banner: bloquear o Pixel no Brasil e nas demais regiões que exigem consentimento, inclusive quando a região não puder ser confirmada.
- Identificar a região pelo endereço de mesma origem `/cdn-cgi/trace`, com limite curto de espera.
- Adicionar uma política de privacidade acessível pelo formulário e pelo rodapé, informando a Meta como destinatária, a finalidade de mensuração e como exercer direitos.

## Validação
- Confirmar que o Pixel carrega uma única vez em região permitida.
- Confirmar que o evento `Lead` ocorre somente após envio do formulário.
- Confirmar que regiões bloqueadas não transmitem eventos e que o formulário continua funcionando normalmente.
