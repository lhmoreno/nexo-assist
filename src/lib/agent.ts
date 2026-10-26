import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "./db";
import { articles } from "./schema";
import { ticketService } from "./tickets";
import { normalize, type Impact, type Urgency } from "./rules";
const intentSchema = z.object({
  intent: z.enum([
    "knowledge",
    "list",
    "create",
    "update",
    "reopen",
    "transfer",
    "outside",
    "unclear",
  ]),
  type: z.enum(["INC", "REQ"]).nullable(),
  category: z
    .enum(["Acesso", "Rede e VPN", "Hardware", "Software", "E-mail", "Outros"])
    .nullable(),
  impact: z.enum(["empresa", "equipe", "pessoa", "baixo"]).nullable(),
  urgency: z.enum(["imediata", "hoje", "normal", "baixa"]).nullable(),
  confidence: z.number().min(0).max(1),
  title: z.string(),
  description: z.string(),
  ticketId: z.string().nullable(),
  answer: z.string(),
  missing: z.array(z.string()),
});
export type Decision = z.infer<typeof intentSchema>;
export function searchKnowledge(query: string) {
  const q = new Set(normalize(query).split(" "));
  return db
    .select()
    .from(articles)
    .all()
    .map((a) => ({
      article: a,
      score: [...q].filter((x) =>
        normalize(a.title + " " + a.keywords).includes(x),
      ).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.article);
}
const makeAgent = (ownerId: string, used: string[]) =>
  new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    model: process.env.MASTRA_MODEL || "openai/gpt-4.1-mini",
    instructions: `Você é o agente de service desk de TI da Nexo. Responda em português. Identifique intenção e classifique fatos, sem inventar. Use ferramentas de consulta quando úteis. Nunca afirme que criou, atualizou ou reabriu: o backend fará isso somente após confirmação. Pedidos de RH/financeiro/facilities são fora de escopo. Se não souber, marque confiança baixa. Para impacto de equipe ou empresa, classifique crítico. Alta se uma pessoa está impedida de trabalhar ou há compromisso hoje; média se há alternativa; baixa para pedido sem urgência. Se faltarem detalhes do problema, impacto ou urgência, preencha missing. Não exponha dados pessoais. O usuário autenticado é ${ownerId}.`,
    tools: {
      searchKnowledge: createTool({
        id: "search-knowledge",
        description: "Busca artigos reais da central de ajuda de TI.",
        inputSchema: z.object({ query: z.string() }),
        outputSchema: z.array(
          z.object({ title: z.string(), body: z.string() }),
        ),
        execute: async ({ query }) => {
          used.push("searchKnowledge");
          return searchKnowledge(query).map((a) => ({
            title: a.title,
            body: a.body,
          }));
        },
      }),
      listTickets: createTool({
        id: "list-tickets",
        description:
          "Lista somente os chamados do funcionário autenticado, inclusive prazo e status.",
        inputSchema: z.object({}),
        outputSchema: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            status: z.string(),
            dueAt: z.number(),
          }),
        ),
        execute: async () => {
          used.push("listTickets");
          return (await ticketService.list(ownerId)).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            dueAt: t.dueAt,
          }));
        },
      }),
    },
  });
export async function decide(
  ownerId: string,
  input: string,
  history: string[],
): Promise<{ decision: Decision; tools: string[]; mode: "mastra" | "demo" }> {
  const used: string[] = [];
  if (process.env.DEMO_MODE === "true")
    return {
      decision: demoDecision(
        history.some((line) => line.includes("Para preparar o chamado"))
          ? `Abrir chamado: ${input}`
          : input,
      ),
      tools: used,
      mode: "demo",
    };
  if (!process.env.OPENAI_API_KEY)
    throw new Error("Configure OPENAI_API_KEY ou ative DEMO_MODE=true.");
  const result = await makeAgent(ownerId, used).generate(
    `Histórico recente:\n${history.slice(-8).join("\n")}\n\nMensagem atual: ${input}`,
    { structuredOutput: { schema: intentSchema } },
  );
  return {
    decision: intentSchema.parse(result.object),
    tools: used,
    mode: "mastra",
  };
}
function demoDecision(input: string): Decision {
  const t = normalize(input),
    id = input.match(/(?:INC|REQ)-\d+/i)?.[0]?.toUpperCase() || null;
  const category =
    t.includes("vpn") || t.includes("wifi") || t.includes("rede")
      ? "Rede e VPN"
      : t.includes("senha") || t.includes("acesso")
        ? "Acesso"
        : t.includes("notebook") || t.includes("monitor")
          ? "Hardware"
          : t.includes("email") || t.includes("outlook")
            ? "E-mail"
            : t.includes("software")
              ? "Software"
              : "Outros";
  const intent =
    t.includes("analista") || t.includes("humano")
      ? "transfer"
      : t.includes("rh") || t.includes("ferias") || t.includes("salario")
        ? "outside"
        : t.includes("reabr")
          ? "reopen"
          : t.split(" ").includes("atualizar") || t.includes("complementar")
            ? "update"
            : t.includes("chamado") &&
                (t.includes("status") ||
                  t.includes("consulta") ||
                  t.includes("meus"))
              ? "list"
              : t.includes("abrir") ||
                  t.includes("criar") ||
                  t.includes("problema")
                ? "create"
                : searchKnowledge(input).length
                  ? "knowledge"
                  : "unclear";
  const impact: Impact = t.includes("empresa")
    ? "empresa"
    : t.includes("equipe")
      ? "equipe"
      : "pessoa";
  const urgency: Urgency = t.includes("hoje")
    ? "hoje"
    : t.includes("parado")
      ? "imediata"
      : "normal";
  return {
    intent,
    type: intent === "create" ? "INC" : null,
    category,
    impact,
    urgency,
    confidence: intent === "unclear" ? 0.4 : 0.85,
    title: input.slice(0, 90),
    description: input,
    ticketId: id,
    answer: "",
    missing: /^(abrir|criar) chamado( de ti)?$/.test(t)
      ? ["descrição do problema", "pessoas afetadas", "urgência"]
      : [],
  };
}
