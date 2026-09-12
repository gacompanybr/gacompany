# Otimização completa para celular e app instalável

## Objetivo
Adaptar o site, painel administrativo e áreas de clientes para telas de celular, mantendo o visual atual no computador e evitando textos, imagens, tabelas ou botões fora das bordas.

## O que será ajustado

### Estrutura geral
- Reduzir margens, espaçamentos e tamanhos de títulos em telas pequenas.
- Garantir largura mínima zero nos blocos flexíveis para textos longos quebrarem ou encurtarem corretamente.
- Respeitar as áreas seguras do iPhone no topo e na parte inferior do app instalado.
- Evitar rolagem horizontal da página; manter rolagem própria apenas onde ela é necessária, como tabelas e listas extensas.

### Cabeçalhos e navegação
- Compactar os cabeçalhos do painel e das áreas de clientes.
- Transformar ações secundárias em botões somente com ícone no celular, com descrição acessível.
- Garantir que nome do cliente, título da tela, notificações e saída nunca se sobreponham.
- Manter os menus laterais utilizáveis como gaveta no celular.

### Formulários, janelas e abas
- Fazer janelas ocuparem a largura útil do celular e terem rolagem interna quando o conteúdo for alto.
- Empilhar campos que hoje ficam lado a lado e ajustar botões para largura adequada.
- Permitir rolagem horizontal somente na barra de abas quando houver muitas opções.
- Reduzir espaçamentos de tabelas e apresentar rolagem contida sem alargar a página.

### Painel, financeiro, equipe e tarefas
- Redimensionar cards financeiros e valores para não cortarem números grandes.
- Adaptar a lista de equipe e ações para telas estreitas.
- No Kanban, exibir uma coluna por vez em faixa horizontal arrastável, mantendo a rolagem própria de tarefas.
- Organizar filtros de tarefas em linhas compactas e botões de largura total quando necessário.

### Módulos dos clientes
- Revisar CRM, WhatsApp, campanhas, social media, disparos, robôs, scraper, e-mail e métricas.
- Adaptar grades fixas, calendários, prévias, tabelas e seletores de imagem.
- Preservar ações e informações essenciais sem esconder funcionalidades no celular.

### Site público e acesso
- Ajustar textos, imagens, carrossel de logos, formulários e botões para celulares estreitos.
- Garantir boa leitura em iPhone e Android sem texto vazando ou elementos sobrepostos.

## Validação
- Conferir as principais telas em largura de celular e computador.
- Testar abertura de menus, abas e janelas, rolagens internas e Kanban.
- Verificar automaticamente estouro horizontal e elementos além da tela.
- Confirmar que o app continua compilando sem erros.

## Detalhes técnicos
- Usar os pontos de adaptação já existentes no projeto e os componentes visuais atuais.
- Concentrar regras globais de segurança de largura, área segura e tipografia no estilo principal; aplicar correções específicas somente onde necessário.
- Não alterar regras de negócio, permissões, dados ou funcionamento das integrações.
