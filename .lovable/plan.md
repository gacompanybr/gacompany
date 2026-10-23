# CRM: respostas do formulário, layout novo e aviso de lead para CEO

## 1. Lead chega completo
- Nome, telefone e e-mail do formulário preenchem os campos do lead automaticamente (telefone normalizado com DDI 55).
- As 3 perguntas viram campos legíveis no lead:
  - Faturamento mensal
  - Disposição para investir
  - Prazo para começar
- Respostas aparecem em destaque no card e no detalhe; perguntas novas no formulário aparecem automaticamente, sem ajuste manual.
- Etiqueta de "lead quente" quando: fatura acima de R$ 30 mil + "Sim, quero crescer" + "Imediatamente/30 dias".

## 2. CRM redesenhado
- Funil em colunas (Novo, Contato, Qualificado, Proposta, Fechado, Perdido) com rolagem própria em cada coluna e na página, e alternância para visão em lista.
- Barra fixa: busca, filtro por data (hoje, 7 dias, 30 dias, período), origem, faturamento, status.
- Edição direto no lugar: clicar em qualquer campo (nome, telefone, e-mail, status, valor, observações, respostas) e salvar na hora.
- Atualização instantânea quando chega ou muda lead, sem recarregar; carregamento paginado para ficar rápido.
- Botão WhatsApp, tempo relativo ("há 3 min"), som ao chegar lead (mantido).
- Visual preto e laranja da marca.

## 3. Notificação instantânea para CEO
- Ao entrar um lead, todo usuário com cargo CEO recebe notificação "Novo LEAD: nome — faturamento" no sino do painel e no celular (app instalado com notificações ativadas).
- Clicar na notificação abre o lead no CRM.

## Detalhes técnicos
- `meta-leads-webhook`: mapear `full_name/phone_number/email` (já parcial) e gravar respostas em `meta_field_data`; após inserir, criar `notifications` para usuários em `user_job_roles` com cargo CEO (dedupe por leadgen_id) e chamar `push-notifications`.
- Migração: coluna `tags text[]` em `crm_leads` (lead quente) e índices em `created_at`/`status`; Realtime em `crm_leads`.
- Frontend: reescrever `src/modules/CRM/index.tsx`, `LeadDetailSheet.tsx` com edição inline e filtros por data; mapa de rótulos das perguntas.
- Testes: classificação de lead quente e seleção dos destinatários CEO.
