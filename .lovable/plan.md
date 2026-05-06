## Módulo Financeiro de Recebimentos

Criar um sistema de gestão de recebimentos por serviço, com **rateio percentual entre múltiplos usuários**, integrado ao painel Admin (gestão) e ao Workspace de cada cliente (visão pessoal de cada usuário).

---

## 1. Estrutura geral

```text
ADMIN (/admin)
└── Sidebar
    ├── Clientes
    ├── Equipe
    ├── Financeiro          ← NOVA aba
    │   ├── Tab "Serviços"      (cria/edita/duplica/exclui serviços financeiros)
    │   ├── Tab "Recebimentos"  (todas as parcelas, filtra por mês/cliente/status)
    │   └── Tab "Categorias"    (gerencia categorias com cor)
    └── Configurações

WORKSPACE (/workspace/:portfolioId)
└── Sidebar
    └── Financeiro          ← NOVO módulo (aparece se cliente tem serviço "financeiro")
        ├── KPIs do mês (a receber / recebido / atrasado)
        ├── Lista de recebimentos do usuário logado nesse cliente
        └── Marcar como recebido (valor cheio ou parcial)
```

---

## 2. Modelo de dados (novas tabelas)

**`financial_categories`** — categorias com cor (Mensalidade, Bônus, Setup, etc.)
- nome, cor (hex)

**`financial_services`** — o serviço pai
- portfolio_id (cliente), category_id, nome, descrição
- valor_total (R$), tipo_cobranca (`mensal` | `unico` | `trimestral`), dia_vencimento (1–31)
- data_inicio, status (`ativo` | `pausado` | `finalizado`), observações
- created_by (admin que criou)

**`financial_service_participants`** — quem recebe e quanto (rateio)
- service_id, user_id, percentual (0–100)
- Constraint: soma dos percentuais por service_id deve dar 100
- Unique (service_id, user_id)

**`financial_receivables`** — cada parcela individual de cada participante
- service_id, participant_user_id, portfolio_id (denormalizado p/ filtro rápido)
- valor_previsto (= valor_total × percentual / 100)
- valor_recebido (nullable), data_prevista, data_recebimento (nullable)
- status (`pendente` | `recebido` | `parcial` | `atrasado` | `cancelado`)
- forma_pagamento (`pix` | `boleto` | `transferencia` | `dinheiro` | `cartao`), observações

**RLS:**
- Admins: acesso total a tudo
- Usuários comuns:
  - Categorias e Services: apenas SELECT (e só dos services em que participam)
  - `financial_receivables`: SELECT/UPDATE somente onde `participant_user_id = auth.uid()` (para marcar como recebido)

**Service "financeiro"** no array `portfolios.servicos`: novo valor `"financeiro"` que ativa o módulo no Workspace (igual aos demais módulos como `meta_ads`, `crm`, etc.). Adicionar ao `EditarClienteDialog` e `NovoClienteDialog` como opção.

---

## 3. Geração de recebimentos (regra de negócio)

Ao **criar um serviço** OU **alterar valor/participantes** de um serviço ativo:

1. Calcula próximas 12 ocorrências baseado em `tipo_cobranca` + `data_inicio` + `dia_vencimento` (helper `generateOccurrences`, igual ao EasyFlow)
2. Para cada ocorrência **e** para cada participante: cria 1 linha em `financial_receivables` com `valor_previsto = valor_total × pct / 100`
3. Em edição: regenera apenas as parcelas ainda **pendentes/atrasadas** (preserva as já recebidas)

Job/edge function opcional fica fora do escopo agora — geração é síncrona ao salvar.

---

## 4. Telas — Admin → Financeiro

### Tab "Serviços" (grade de cards, igual EasyFlow)
Cada card mostra: cliente (portfolio), nome do serviço, valor total, tipo de cobrança, categoria (badge colorido), nº de participantes, status. Ações: Editar, Duplicar, Excluir.

**Dialog "Novo/Editar serviço"** com campos:
- Cliente (Select de portfolios)
- Categoria (Select), Nome, Descrição
- Valor total (R$), Tipo cobrança, Data início, Dia vencimento, Status
- **Seção "Participantes e Rateio"**: lista dinâmica
  - Linha = Select de usuário (de `profiles`) + Input % + botão remover
  - Botão "+ Adicionar participante"
  - Indicador em tempo real: "Total: 100% ✓" ou "Falta 15%" (vermelho se ≠ 100)
  - Salvar bloqueado se ≠ 100
- Observações

### Tab "Recebimentos"
Filtros: mês (input month, default mês atual), cliente, status, busca por nome.
Lista (Card com Table): cliente | serviço | participante | valor previsto | data prevista | status badge | ações.
Click na linha abre dialog para marcar como recebido (cheio/parcial), mudar status, registrar forma de pagamento.

### Tab "Categorias"
Lista simples + dialog para adicionar/remover (nome + color picker).

---

## 5. Tela — Workspace → Módulo Financeiro

Aparece na sidebar do Workspace quando o portfolio tem `"financeiro"` em `servicos`.
Mostra **apenas os recebimentos do usuário logado nesse cliente**:

- 3 KPI cards no topo: "A receber este mês", "Recebido este mês", "Atrasado"
- Filtro de mês
- Lista de recebimentos (mesma UX do EasyFlow `ReceivableItem`)
- Click abre dialog: botão "Marcar como recebido (valor cheio)" + edição manual (valor parcial, data, forma de pagamento, observação)
- Admin que estiver visualizando vê tudo daquele cliente; usuário comum vê só o dele (controlado por RLS)

---

## 6. Arquivos a criar/editar

**Migration SQL** (1 arquivo): cria as 4 tabelas, RLS, função `recalculate_receivables(service_id)` em PL/pgSQL para regerar parcelas pendentes.

**Novos componentes:**
- `src/components/admin/FinanceiroTab.tsx` — wrapper com sub-tabs (Serviços / Recebimentos / Categorias)
- `src/components/admin/financeiro/ServicosTab.tsx`
- `src/components/admin/financeiro/RecebimentosTab.tsx`
- `src/components/admin/financeiro/CategoriasTab.tsx`
- `src/components/admin/financeiro/ServicoFinanceiroDialog.tsx` (criar/editar com rateio)
- `src/components/admin/financeiro/RecebimentoDialog.tsx` (marcar recebido)
- `src/components/admin/financeiro/ParticipantesEditor.tsx` (sub-componente do rateio)
- `src/modules/Financeiro/index.tsx` — módulo do Workspace
- `src/modules/Financeiro/types.ts`
- `src/lib/recurrence.ts` — helper `generateOccurrences` (portado do EasyFlow)
- `src/lib/format.ts` — `BRL`, `formatDateBR`, labels (se ainda não existir)

**Arquivos a editar:**
- `src/components/admin/AdminSidebar.tsx` — adicionar item "Financeiro"
- `src/pages/Admin.tsx` — roteamento da nova tab
- `src/components/workspace/WorkspaceSidebar.tsx` — registrar módulo `financeiro`
- `src/pages/Workspace.tsx` — case `"financeiro"` renderiza `<FinanceiroModule />`
- `src/components/admin/NovoClienteDialog.tsx` e `EditarClienteDialog.tsx` — incluir `"financeiro"` na lista de serviços contratáveis
- `src/components/admin/ServiceBadge.tsx` — label e cor para o novo serviço

---

## 7. Detalhes técnicos importantes

- **Identidade visual**: manter preto + #FEA60F. Cards seguem o padrão atual (shadcn `Card` + `Badge`).
- **Validação do rateio**: feita no client (UX) **e** no banco via trigger AFTER INSERT/UPDATE/DELETE em `financial_service_participants` que checa SUM(percentual) = 100 e levanta exceção se não bater.
- **Status "atrasado"**: calculado on-the-fly no SELECT (CASE WHEN data_prevista < hoje AND status='pendente'). Não precisa job de cron por enquanto.
- **Soft constraints**: services `ativo` permitem edição livre; ao excluir um serviço, deletar em cascata todos os recebimentos via FK ON DELETE CASCADE.
- **Permissão de marcar recebido**: usuário comum só edita campos `valor_recebido`, `data_recebimento`, `forma_pagamento`, `status`, `observacoes` da própria linha (RLS UPDATE com `participant_user_id = auth.uid()`).

---

## 8. Fora do escopo (deixar para depois)
- Notificações por e-mail de vencimento
- Exportar CSV/PDF
- Relatórios financeiros agregados (DRE, gráficos comparativos)
- Repasse automático para gateway de pagamento