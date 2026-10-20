# Roadmap

- [x] Registrar mensagens antes das regras de resposta e exibir todo o histórico armazenado — teste de registro remoto e paginação aprovados
- [x] Agilizar busca genérica separando quantidade e evitando consultas redundantes — 77 resultados de tubo nos 5.974 produtos reais; 32 testes aprovados
- [ ] Verificar John Lennon e histórico ausente na Evolution — contato não encontrado nos registros; precisa do telefone do contato
- [ ] Validar histórico completo pela tela autenticada — acesso de teste indisponível; precisa entrar no painel

- [x] Liberar pausas e desativar atendimento humano automático somente na Casa do Eletricista 558781607727 — sete pausas liberadas, 12 testes aprovados e webhook implantado

- [x] Restringir o novo fluxo de pedidos ao leonardo - novo tio sem alterar regras odontológicas — 15 testes aprovados e webhook implantado
- [x] Corrigir envio automático de pedidos confirmados ao grupo de cada agente, registrar falhas e validar integração sem duplicações
- [ ] Confirmar recebimento do pedido de R$ 63,00 no grupo GA company equipe — envio real aceito e mensagem encontrada no histórico do grupo; aguardando recibo de entrega ou confirmação do usuário

- [x] Corrigir busca completa no catálogo e validar produtos do início, meio e fim da planilha

- [x] Adicionar data de follow-up no contato e executar envio agendado respeitando bloqueios

- [x] Criar cargos, permissões, auditoria e regras de acesso
- [x] Criar subtarefas, notificações, preferências e dispositivos
- [x] Implementar gestão completa da equipe e exclusão segura
- [x] Aplicar visibilidade do painel por permissão
- [x] Refazer Kanban com data, drag-and-drop e subtarefas
- [x] Adicionar central de notificações e som
- [x] Tornar o painel instalável e ativar push no celular
- [x] Testar segurança, desktop e celular
- [x] Adicionar áudio pontual por campanha no SDR com Google Cloud TTS
- [x] Instalar Pixel da Meta na página inicial e registrar conversões Lead com proteção regional
- [x] Criar landing page curta em /forms para restaurantes e delivery com WhatsApp e Pixel
- [x] Usar logos enviadas na faixa de parceiros e incluir os clientes abaixo do formulário
- [x] Disponibilizar o CRM consolidado diretamente no menu Operação
- [x] Disponibilizar Scrapper, Disparos e Agente IA diretamente no menu Operação
- [x] Permitir entrada de todo usuário cadastrado e restringir apenas as abas conforme o cargo
- [x] Permitir cadastrar leads no CRM sem selecionar um cliente
- [x] Permitir editar dados dos leads e limitar as colunas do CRM com rolagem própria
- [x] Adicionar catálogo do Google Sheets ao Agente IA sem alterar agentes sem planilha
- [x] Reconhecer singular e plural nas categorias do catálogo do Agente IA
- [x] Trocar a voz de áudio do SDR para uma voz feminina conversada em português brasileiro
- [x] Suavizar a fala do SDR com uma abertura em áudio mais fluida e voz feminina ajustada
- [x] Garantir resposta do Agente IA após várias mensagens rápidas do mesmo contato

- [x] Estabilizar o scraper do Mercado Livre com 8 execuções diárias, coleta sequencial, detecção de CAPTCHA e proxy opcional
- [ ] Restaurar a coleta do Mercado Livre na VPS — fluxo conservador publicado; bloqueado até renovar a sessão/cookie atualmente desafiada pelo CAPTCHA
- [x] Adicionar controle persistente de follow-up e comprador por contato
- [x] Proteger todos os envios de follow-up e invalidar pendências sem reenvio
- [x] Testar isolamento, persistência, retomada e compra confirmada
