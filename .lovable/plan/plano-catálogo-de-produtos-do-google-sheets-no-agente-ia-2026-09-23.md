# Plano — catálogo de produtos do Google Sheets no Agente IA

## Garantias de isolamento

- A funcionalidade será ativada **somente** quando `catalogo_url` estiver preenchido.
- Sem planilha configurada, a requisição ao modelo continuará com o mesmo prompt, mensagens, parâmetros e caminho atuais; nenhum campo de ferramenta será enviado.
- O recebimento e o envio do WhatsApp, o debounce, a proteção contra respostas obsoletas/duplicadas, a quebra por `|||`, os intervalos, a sanitização e o salvamento do histórico não serão alterados.
- Chamadas e resultados da ferramenta existirão apenas na memória daquela execução e nos logs; nunca serão enviados ao cliente nem gravados como mensagens.
- Não haverá cache: cada teste e cada busca do agente baixará a versão atual da planilha.

## Arquivos novos

### 1. Nova migração em `supabase/migrations/`
- Adicionar somente a coluna opcional `catalogo_url TEXT` em `public.whatsapp_agents`.
- Não alterar políticas, tabelas, colunas ou dados existentes.

### 2. `supabase/functions/_shared/product-catalog.ts`
- Concentrar a leitura segura do catálogo para ser reutilizada pelo teste e pelo agente.
- Validar link no formato Google Sheets e extrair `ID` e `gid` opcional.
- Baixar o CSV pelo endpoint `/export?format=csv`, com `gid` apenas quando presente e timeout de 10 segundos.
- Detectar HTML/login como planilha não compartilhada.
- Usar um parser CSV real via importação isolada no backend, com suporte a vírgulas, ponto e vírgula, aspas e linhas escapadas; nenhuma dependência será adicionada ao aplicativo.
- Localizar cabeçalhos por nome normalizado, ignorando maiúsculas e acentos, e exigir: `codigo`, `categoria`, `nome`, `marca`, `especificacoes`, `preco`, `unidade`, `estoque`.
- Preservar os valores das células como texto exatamente como vieram da planilha.
- Expor funções para resumo do catálogo e busca por categoria normalizada.

### 3. `supabase/functions/whatsapp-catalog-test/index.ts`
- Criar uma função autenticada para o botão **Testar planilha**.
- Confirmar que o usuário tem acesso ao cliente antes de baixar o link informado.
- Retornar quantidade de produtos e categorias encontradas.
- Retornar erros claros para link inválido, planilha não compartilhada, timeout e colunas faltando.

## Arquivos alterados

### 4. `src/modules/WhatsappAgent/types.ts`
- Adicionar `catalogo_url: string | null` ao tipo do agente.
- Definir `catalogo_url: null` somente no agente novo, mantendo os demais padrões intactos.

### 5. `src/modules/WhatsappAgent/ConfigTab.tsx`
- Adicionar o campo opcional **“Planilha de produtos (link do Google Sheets)”** e o texto de ajuda solicitado.
- Adicionar o botão **“Testar planilha”** ao lado do campo, com estado de carregamento.
- Mostrar na própria seção o total e as categorias, ou a mensagem de erro específica.
- O teste usará o link atualmente digitado, mesmo antes de salvar.

### 6. `supabase/functions/whatsapp-webhook/index.ts`
- Importar apenas o leitor compartilhado do catálogo.
- Manter o caminho atual sem alterações quando `catalogo_url` estiver vazio.
- Quando houver link, acrescentar condicionalmente a ferramenta `buscar_produtos` no formato de function calling já usado pelo endpoint atual, com `categoria` obrigatória.
- Executar a busca normalizando categoria em minúsculas, sem acento/apóstrofo e com espaços/hífens convertidos em `_`.
- Retornar no máximo 60 produtos com `codigo`, `nome`, `marca`, `especificacoes`, `preco`, `unidade` e `estoque`; sem converter valores.
- Quando não houver resultado, retornar `total: 0` e `categorias_disponiveis`; em falhas, retornar `{ "erro": "..." }` sem interromper o atendimento.
- Processar no máximo 3 rodadas de ferramenta por mensagem. Se o limite for atingido, fazer uma última chamada sem ferramentas para obter texto.
- Entregar somente o texto final ao fluxo já existente, que continuará responsável pela sanitização, `|||`, intervalos, envio e histórico.
- Preservar a repetição atual para resposta cortada; após uso da ferramenta, a repetição manterá o contexto temporário da busca.

## Validação antes de concluir

- Aplicar a migração e publicar apenas as duas funções afetadas: a nova função de teste e `whatsapp-webhook`.
- Testar: link inválido, link privado/HTML, timeout, cabeçalhos com acentos/maiúsculas, CSV com vírgula/ponto e vírgula/aspas, categoria encontrada, categoria inexistente e limite de 60 itens.
- Confirmar que a ferramenta pode fazer até 3 rodadas e que só o texto final chega ao fluxo de envio.
- Fazer uma verificação de regressão com um agente sem `catalogo_url`, confirmando que o corpo enviado ao modelo permanece no formato anterior e que o atendimento continua igual.
- Validar o campo e o botão na tela em computador e celular, sem alterar o restante do layout.
