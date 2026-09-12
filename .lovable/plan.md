# Equipe, permissões, Kanban e notificações

## Resultado esperado

Transformar o painel em uma área de trabalho por cargos, com controle real de acesso, Kanban mais rápido e notificações no navegador, iPhone e Android.

## 1. Equipe, cargos e permissões

- Manter **Administrador** como permissão especial, separada do cargo. Administradores sempre terão acesso total.
- Adicionar os cargos iniciais: **CEO, CFO, CMO, Gestor, SDR, Closer e Social Media**.
- Criar uma matriz de permissões por cargo, com configurações recomendadas inicialmente e possibilidade de ligar/desligar cada acesso depois.
- Organizar permissões por área e ação, por exemplo: visualizar, criar, editar e excluir em Clientes, Equipe, Tarefas, Calendário, Financeiro, Dashboard e Integrações.
- Por padrão, **Financeiro e Dashboard financeiro** ficarão disponíveis para CEO, CFO e administradores; a matriz permitirá alterar isso depois.
- Melhorar a edição de cada pessoa: nome, cargo, administrador sim/não, clientes vinculados e permissões efetivas.
- Adicionar exclusão definitiva de usuário com confirmação reforçada, impedindo autoexclusão e protegendo o último administrador.
- Ao excluir, remover login e acessos, preservando registros históricos de tarefas com uma identificação segura de quem realizou ações anteriores.
- Registrar alterações sensíveis: convite, troca de cargo, concessão/remoção de administrador, redefinição de senha e exclusão.

## 2. Segurança de acesso

- Aplicar permissões tanto na interface quanto no banco de dados; esconder uma aba não será considerado proteção suficiente.
- Substituir o bloqueio atual de “admin ou viewer” por verificação granular de permissões.
- Permitir que pessoas da equipe entrem no painel administrativo somente nas áreas liberadas ao seu cargo.
- Restringir consultas financeiras e do Dashboard no banco para CEO, CFO, administradores ou cargos posteriormente autorizados.
- Manter o acesso por cliente separado das permissões de cargo.

## 3. Kanban de tarefas

- Redesenhar as três colunas em um formato mais limpo, compacto e estável.
- Mostrar aproximadamente quatro cartões por coluna; tarefas adicionais terão rolagem independente dentro da própria coluna.
- Adicionar arrastar e soltar entre **A fazer**, **Em andamento** e **Feitas**, com animação, destaque do destino e atualização imediata com reversão se houver erro.
- Manter ações acessíveis por toque/clique como alternativa ao arrastar, especialmente no celular.
- Adicionar filtro por data, aberto por padrão no dia atual, com atalhos para hoje, atrasadas, sem data, todas e período personalizado.
- Melhorar filtros de responsável: minhas tarefas, todas e uma pessoa específica.
- Exibir claramente os responsáveis e garantir que cada usuário veja suas tarefas ao entrar na conta.
- Abrir o cartão em detalhes para visualizar descrição, cliente, prazo, responsáveis, histórico e subtarefas.

## 4. Subtarefas e bloqueio de progresso

- Criar subtarefas/checklist com título, ordem, concluída por e data de conclusão.
- Permitir adicionar, editar, remover, marcar e reordenar itens dentro da tarefa.
- Mostrar no cartão o progresso, como `3 de 5`.
- Impedir no banco e na interface que uma tarefa avance de coluna enquanto houver subtarefas pendentes.
- Exibir uma mensagem objetiva indicando quais itens da tarefa ainda precisam ser concluídos.
- Tarefas sem subtarefas continuarão funcionando normalmente.

## 5. Central de notificações

- Criar um sino no painel com contador, lista, lidas/não lidas e acesso ao item relacionado.
- Gerar notificações para:
  - tarefa atribuída ao usuário;
  - tarefa concluída, avisando criador e demais responsáveis com o nome de quem concluiu;
  - novo cliente cadastrado, para usuários com acesso à gestão de clientes;
  - tarefa próxima do prazo e tarefa atrasada.
- Evitar notificações duplicadas e não avisar a própria pessoa sobre uma ação que ela acabou de executar quando isso não agregar valor.
- Tocar um aviso sonoro suave quando o sistema estiver aberto, com opção individual para silenciar.
- Permitir preferências por tipo de notificação e por canal.

## 6. App instalável e notificações no celular

- Transformar o painel em app instalável pelo navegador, com nome, ícone da GA Company, tela inicial e comportamento adequado em modo aplicativo.
- Configurar notificações push via Firebase Cloud Messaging, usando conexão protegida no backend.
- Android: permitir instalação e notificações pelo navegador compatível.
- iPhone: orientar instalação por **Adicionar à Tela de Início**; notificações exigem iOS 16.4 ou superior e permissão concedida dentro do app instalado.
- Tratar abertura da notificação para levar diretamente à tarefa ou área correspondente.
- Criar uma tela de preferências e estados claros para: ativada, bloqueada, aparelho incompatível ou app ainda não instalado.

## 7. Estrutura técnica

- Novas estruturas: cargos, permissões por cargo, cargo do usuário, auditoria, subtarefas, notificações, preferências e dispositivos registrados.
- Todas as novas tabelas terão permissões explícitas, proteção por usuário/cargo e índices para consultas frequentes.
- A validação de subtarefas concluídas e das permissões financeiras será feita no banco, evitando contorno pelo navegador.
- A exclusão definitiva e o envio de push serão executados por funções protegidas, nunca diretamente pelo navegador.
- Os avisos de prazo serão processados por rotina agendada e terão chave de deduplicação.

## 8. Validação

- Testar concessão e remoção de administrador, cada cargo padrão e personalização de permissões.
- Confirmar que usuários sem autorização não veem nem conseguem consultar Financeiro/Dashboard.
- Testar exclusão definitiva, inclusive proteção do próprio usuário e do último administrador.
- Testar Kanban por mouse e toque, rolagem das colunas, filtro de hoje e bloqueio por subtarefas.
- Testar notificações abertas, em segundo plano e com app fechado em Android e iPhone instalado.
- Validar telas em desktop e celular, além das regras de segurança do banco.

## Premissas definidas

- Administrador sempre possui acesso total, independentemente do cargo.
- CEO e CFO começam com Financeiro e Dashboard liberados.
- Os demais cargos recebem modelos iniciais coerentes, mas todas as permissões podem ser personalizadas por um administrador.
- A exclusão solicitada é definitiva, com salvaguardas para não deixar o sistema sem administrador.
