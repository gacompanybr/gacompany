# Melhorias graduais dos robôs, sem alterar atendimentos aprovados

## Proteção dos clientes atuais
- Lopes Saúde permanece no atendimento atual: sem mudança de prompt, horário, pausas, regras odontológicas, mensagens ou encaminhamentos.
- Não alterar `instrucoes_base` de nenhum cliente.
- Todas as novas mudanças de comportamento ficam desligadas por padrão e são ativadas individualmente. O padrão de responder fora do horário sugerido no arquivo será substituído pelo padrão atual de silêncio, para respeitar seu pedido mais recente.
- Preservar SDR, follow-ups, bloqueios por contato, pedidos confirmados e a exceção de pausa humana da Casa do Eletricista.

## Auditoria realizada
Confirmado no código:
- Erro da IA sem planilha, resposta vazia e descarte de todos os blocos repetidos podem terminar sem resposta.
- Mensagens longas perdem conteúdo após três blocos no WhatsApp; o teste do painel tem limite diferente.
- A busca automática trata pedidos de vários produtos como uma consulta e pode impedir o uso da ferramenta de produtos.
- Encaminhamentos atuais têm exigências odontológicas e não atendem corretamente todos os negócios.
- Fora do horário existe silêncio intencional. Alterar isso não é uma correção universal: depende da opção do cliente.
- Não existe recuperação automática das mensagens interrompidas nem fila durável dos novos encaminhamentos propostos.

Correção de uma afirmação do arquivo: a análise de pedido já possui timeout de 20 segundos. Não alterar esse limite ou a lógica do pedido apenas com base na alegação de que não há timeout.

Configuração atual verificada:
- Lopes Saúde está ativa, sem planilha e com número de encaminhamento configurado.
- Leonardo - novo tio está ativo, mas atualmente sem planilha e sem grupo/número de encaminhamento configurados. Não restaurar vínculos antigos por suposição; sem destino não é possível confirmar encaminhamento.
- Casa do Eletricista está inativa, com planilha e grupo configurados. Não ativá-la automaticamente.

## Implantação em etapas
### 1. Segurança e diagnóstico
Criar opções individuais para as melhorias, mantendo os caminhos antigos quando desligadas. Registrar estados e duração do atendimento sem mudar o que o cliente recebe. Mostrar mensagens sem resposta e motivo na aba Conversas.

### 2. Respostas interrompidas
Nos agentes habilitados, tratar erros e respostas vazias com tentativa limitada e mensagem de segurança configurável. Evitar silêncio causado apenas por repetição. Preservar pausas, pedidos para parar, agente inativo e descarte de execuções antigas. Enviar somente quando ainda não houver resposta mais recente.

### 3. Produtos e mensagens completas
Nos agentes habilitados e com planilha, separar pedidos em até oito itens, preservar o contexto de continuações como “o de 25” e reutilizar a leitura completa apenas durante a resposta. Manter uma rodada de ferramentas, medidas, preços, estoque e exclusão de inativos. Não transformar falha de leitura em ausência de produto. Enviar todos os grupos do orçamento sem descartar o restante.

### 4. Encaminhamentos reais
Criar fila e aba Encaminhamentos para os agentes habilitados, com destino do próprio agente, assunto, status, controle de duplicatas e reenvio seguro. Remover marcadores internos antes do envio ao cliente. Nunca afirmar que a equipe foi avisada sem confirmação de envio. O fluxo odontológico antigo permanece isolado; pedidos comerciais continuam exclusivamente no fluxo existente.

### 5. Horário e instruções
Somente nos agentes habilitados, oferecer atendimento fora do horário e informar a próxima abertura quando depender de uma pessoa. Manter tom e instruções do negócio, configurar quando pedir nome e alinhar o teste do painel com o atendimento real. Não trocar o modelo dos agentes.

### 6. Recuperação e alertas
Criar recuperação agendada apenas para agentes habilitados, com reserva atômica, checagem de mensagem posterior e estados de envio incerto para evitar duplicatas. Não reenviar automaticamente uma entrega ambígua. Exibir falhas e alertas; notificações ao administrador exigem destino configurado. Verificar os limites reais do ambiente antes de prometer recuperação em prazo fixo.

## Validação e reversão
- Já executados: 56 testes aprovados, incluindo duas verificações novas específicas de preservação da Lopes Saúde.
- Adicionar testes para cada regra implementada: ausência de resposta, repetição, vários itens, continuação por medida, orçamento completo, encaminhamento, horário e duplicatas.
- Testar também agente sem planilha, regras odontológicas e os fluxos comerciais dos dois clientes permitidos.
- Validar cada etapa na tela e em testes de integração; envio real pelo WhatsApp somente com agente ativo e destino configurado, sem alterar os clientes protegidos.
- Reversão por agente: desligar a opção da melhoria correspondente e retornar ao caminho antigo; manter histórico e registros de auditoria.
- Implantar apenas funções alteradas e entregar resumo das mudanças, testes, opções de reversão e itens não confirmados.

## Detalhes técnicos
- Usar opções persistidas por agente, com defaults de compatibilidade; `fora_horario_modo='silencio'` e `pedir_nome='sempre'` preservam o padrão atual. Perfil genérico será opt-in, sem converter a Lopes Saúde por padrão.
- Estados inbound e claims devem ser persistidos; fila de encaminhamento com RLS e acesso por portfólio, sem permitir alteração de flags internas por contatos externos.
- Preservar endpoints, modelos, limites de saída, CORS local, ausência de cache persistente e módulos compartilhados de escopo comercial/pausa.
- Implementar recursos em módulos pequenos e testar isolamento antes de habilitar qualquer agente. Registrar as decisões no `AGENTS.md`.

Nesta rodada foram feitas a auditoria e as verificações de proteção; nenhum comportamento dos robôs foi alterado e nenhuma função foi implantada.