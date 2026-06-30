// Builder do workflow Robô (disparador WhatsApp).
//
// IMPORTANTE: NÃO reescrever a lógica do nó "Disparar Promo".
// O JSON em robo-template.json é a versão "[ROBO] Lar em Ofertas BOT — CORRIGIDO"
// (depurada em produção). Aqui só substituímos os const do topo
// (credenciais, instância, grupo, tabela, robô id, horários, template).

import templateRaw from "./robo-template.json" with { type: "json" };

type AnyNode = Record<string, any>;
type AnyWorkflow = Record<string, any>;

function clone(): AnyWorkflow {
  return JSON.parse(JSON.stringify(templateRaw));
}

function findNode(wf: AnyWorkflow, name: string): AnyNode | undefined {
  return wf.nodes.find((n: AnyNode) => n.name === name);
}

/**
 * Substitui o valor de `const NAME = ...;` (uma única linha) preservando o resto.
 * Se o const não existir, é inserido no topo (depois das outras consts).
 */
function replaceConst(code: string, name: string, jsLiteral: string): string {
  const re = new RegExp(`^(const\\s+${name}\\s*=\\s*)[^;]*;`, "m");
  if (re.test(code)) {
    return code.replace(re, `$1${jsLiteral};`);
  }
  // injeta após o cabeçalho de comentários (linha 18 do template original)
  const lines = code.split("\n");
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^const\s+/.test(lines[i])) { insertAt = i; break; }
  }
  lines.splice(insertAt, 0, `const ${name} = ${jsLiteral};`);
  return lines.join("\n");
}

const DEFAULT_TEMPLATE =
  "*{frase}*\n\n{productname}\n\nDe ~R$ {priceoriginal}~ ❌\nPor *R$ {price}* ✅ ({pricediscountrate}% OFF)\n\nLoja Oficial {shopname}\n🔗{offerlink}";

export interface RoboBuildEnv {
  N8N_BASE: string;
  N8N_KEY: string;
  EVO_URL: string;
  EVO_KEY: string;
  SUPABASE_URL: string;
  SCRAPPER_SECRET: string;
  LOVABLE_API_KEY: string;
}

export function buildRoboWorkflow(robo: any, workflowName: string, env: RoboBuildEnv): AnyWorkflow {
  const wf = clone();
  wf.name = workflowName;

  const destinos: string[] = Array.isArray(robo.destinos) ? robo.destinos : [];
  const template: string = robo.message_template || DEFAULT_TEMPLATE;
  const instance: string = robo.instancia_id || "";
  const horariosPorDia = robo.horarios_por_dia ?? {};
  const tableId: string = robo.n8n_datatable_id || "";
  const plataforma: string = robo.plataforma ?? robo.marketplace ?? "mercadolivre";
  const scrapperApi = `${env.SUPABASE_URL}/functions/v1/scrapper-api`;

  const node = findNode(wf, "Disparar Promo");
  if (!node) throw new Error("Template Robô inválido: nó 'Disparar Promo' não encontrado");

  let code: string = node.parameters?.jsCode ?? "";
  const J = (v: unknown) => JSON.stringify(v);

  code = replaceConst(code, "N8N_BASE", J(env.N8N_BASE));
  code = replaceConst(code, "N8N_KEY", J(env.N8N_KEY));
  code = replaceConst(code, "TABLE_ID", J(tableId));
  code = replaceConst(code, "PLATAFORMA", J(plataforma));
  code = replaceConst(code, "EVO_URL", J(env.EVO_URL));
  code = replaceConst(code, "EVO_KEY", J(env.EVO_KEY));
  code = replaceConst(code, "INSTANCE", J(instance));
  code = replaceConst(code, "DESTINOS", J(destinos));
  code = replaceConst(code, "TEMPLATE", J(template));
  code = replaceConst(code, "ROBO_ID", J(robo.id));
  code = replaceConst(code, "SCRAPPER_API", J(scrapperApi));
  code = replaceConst(code, "SCRAPPER_SECRET", J(env.SCRAPPER_SECRET));
  code = replaceConst(code, "LOVABLE_API_KEY", J(env.LOVABLE_API_KEY));
  code = replaceConst(code, "HORARIOS_PADRAO", J(horariosPorDia));

  node.parameters = { ...(node.parameters ?? {}), jsCode: code };

  wf.settings = wf.settings || { executionOrder: "v1" };
  delete (wf as any).id;
  delete (wf as any).versionId;
  delete (wf as any).meta;
  delete (wf as any).pinData;
  delete (wf as any).staticData;
  delete (wf as any).tags;
  delete (wf as any).active;

  return wf;
}
