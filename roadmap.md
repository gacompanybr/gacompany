# Roadmap

- [ ] Adicionar Vincular Meta no CRM geral com conta, campanha e formulário validados e seleção persistida
- [ ] Aplicar vínculos à recepção e verificar seleção e chegada de leads — recepção externa ainda depende do webhook Meta

- [x] Preparar recepção assinada dos formulários instantâneos Meta no CRM geral, com deduplicação e respostas personalizadas — implantada; 3 testes passaram; evento sem assinatura rejeitado com 401
- [x] Salvar credenciais dedicadas pelo formulário seguro, sem substituir a conexão Meta existente
- [ ] Configurar callback da função meta-leads-webhook e assinatura leadgen na Meta; verificar lead real e permissões — depende da configuração externa; rotação dos valores expostos ainda não confirmada

- [x] Auditar o arquivo de correção dos agentes e apresentar implantação conservadora por agente, preservando Lopes Saúde — 56 testes aprovados; nenhum comportamento de atendimento alterado
- [x] Implantar opções individuais, estados de resposta e painel de diagnóstico sem ativar melhorias em clientes existentes — todas desligadas; Lopes Saúde preservada
- [x] Implementar respostas seguras, busca multi-item e encaminhamentos opt-in preservando SDR e odontologia — funções implantadas e geração real verificada com e sem catálogo
- [x] Implementar recuperação idempotente e testes de regressão — 75 testes aprovados; entrega incerta não é reenviada; recuperação para ao esvaziar a fila
- [ ] Validar novas opções pela tela autenticada e entrega WhatsApp opt-in — conta de teste do solicitante indisponível; melhorias permanecem desligadas até validação individual

- [x] Nova busca em camadas com equivalências (cano/tubo, dagua, sold), exclusão de inativos, sem coluna de custo, log de auditoria e tela das últimas 100 buscas — 45 testes aprovados, validado na planilha real (esgoto 8, caixa dagua 15, cano de cobre 13), funções implantadas
- [x] Corrigir nomes populares/parciais na primeira busca — 5.974 registros consultados, cano/tubo de esgoto 8 resultados, esgoto 11, Esmeralda 4, fio 88, argamassa 10, torneira 106; 57 testes aprovados, funções implantadas e respostas verificadas na tela autenticada, inclusive ausência; dados comerciais intactos
- [ ] Confirmar entrega dessas buscas pelo WhatsApp — agente da Casa do Eletricista está desativado; preservado sem ativação automática

- [x] Encerrar buscas sem resultados, preservar capacidade de 2.000 litros e responder em falha/demora do modelo — 29 testes aprovados; webhook e preview implantados
- [ ] Confirmar entrega real pelo WhatsApp após consulta de produto ausente — correção implantada; entrega ainda não exercitada com contato real

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

- [x] Corrigir falhas de monitoramento que impedem os robôs de responder — CORS corrigido em 6 funções (401 em vez de 502), conflito de webhook n8n com desativação de concorrentes e erro visível, retry /api/v1 no n8n-sync, ruído de conversa não zera busca, modelos gemini trocados por gpt-6-astra; 6 falhas resolvidas
- [x] Aplicar na Casa do Eletricista todas as melhorias do leonardo - novo tio — fluxo de pedidos ativado (allowlist), validação de produto insensível à ordem das palavras, pedido do Bruno (R$ 179,69) enviado e aceito no grupo CASA DO ELETRICISTA - MKT GA COMPANY
- [x] Responder mensagens paradas da Casa do Eletricista — 6 conversas reenviadas e respondidas; causa raiz: modelo gemini descontinuado rejeitava temperatura (400), caindo no fallback
