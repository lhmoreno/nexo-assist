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
  tried: z.array(z.string()),
  os: z.string().nullable(),
  deadline: z.string().nullable(),
  aboutOtherPerson: z.boolean(),
  question: z
    .object({
      text: z.string(),
      options: z.array(z.string()).min(2).max(4),
    })
    .nullable(),
});
export type DecideContext = {
  /** A última resposta do agente foi uma pergunta de esclarecimento ou pedido de dados. */
  continuing: boolean;
  /** A última resposta do agente foi um artigo da central de ajuda. */
  knowledgeBefore: boolean;
  /** Mensagens do funcionário que compõem o relato em andamento. */
  thread: string[];
  /** Primeiros nomes de outros funcionários, para detectar consulta de terceiros. */
  otherNames: string[];
};
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
export const DEFAULT_MODEL = "openai/gpt-6-luna";
const makeAgent = (ownerId: string, used: string[]) =>
  new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    model: process.env.MASTRA_MODEL || DEFAULT_MODEL,
    instructions: `Você é o agente de service desk de TI da Nexo. Responda em português. Identifique intenção e classifique fatos, sem inventar. Use ferramentas de consulta quando úteis. Nunca afirme que criou, atualizou ou reabriu: o backend fará isso somente após confirmação. Pedidos de RH/financeiro/facilities são fora de escopo. Se não souber, marque confiança baixa. Não exponha dados pessoais. O usuário autenticado é ${ownerId}.

Intenção:
- Saudações, agradecimentos e conversa social ("oi", "tudo bem?", "obrigado") NÃO são ambíguas: use intent "unclear" com confiança alta (0,9), sem transferir, e em answer cumprimente de volta e convide a descrever o problema de TI. Reserve confiança baixa para mensagens realmente incompreensíveis ou contraditórias.
- Use "knowledge" para dúvida simples respondida por um artigo. Se a mensagem anterior do agente foi um artigo e o usuário diz que não resolveu, informa o sistema operacional, cita compromisso/prazo ("entrega hoje") ou impedimento de trabalho, a intenção agora é "create" (oferecer abrir chamado), nunca repetir o artigo.
- Para um problema ou dúvida comum que ainda não foi tentado resolver (primeira mensagem, sem pedido de chamado), consulte searchKnowledge e use "knowledge" se houver artigo útil.
- Use "create" quando a pessoa quer abrir chamado ou relata problema que ela não consegue resolver sozinha. Em "create", reúna o relato de TODO o histórico recente, não só da última mensagem.
- Se perguntam por chamado de outra pessoa (nome ou número que não é do usuário), marque aboutOtherPerson=true.

Campos para "create": type INC para falha/incidente, REQ para pedido de algo novo. title: título curto (até 60 caracteres), com inicial maiúscula, sem prefixos como "Quero abrir um chamado" e sem copiar a frase do usuário. description: o problema em 1 ou 2 frases objetivas, reescritas. tried: ações que o usuário já tentou (vazio se não disse). os: sistema operacional se citado, senão null. deadline: compromisso ou prazo citado (ex.: "entrega hoje"), senão null. Alta se uma pessoa está impedida de trabalhar ou há compromisso hoje; média se há alternativa; baixa para pedido sem urgência. Para impacto de equipe ou empresa, classifique crítico.

Perguntas: se ainda faltar algo que ajude o analista e que o usuário não disse, preencha question com UMA pergunta curta e 2 a 4 opções de resposta rápida (ex.: "Você já reinstalou o cliente de VPN?" com "Sim, já reinstalei", "Ainda não", "Não sei como fazer"). Pergunte primeiro o que já foi tentado, depois o sistema operacional, se for problema técnico. Não repita pergunta já respondida; quando nada essencial faltar, deixe question null. Use missing só quando for impossível classificar (ex.: a pessoa só disse "abrir chamado"); detalhes técnicos que o analista pode pedir depois NÃO são missing. Nesse caso, impacto e urgência assumidos (pessoa, normal) são melhores do que travar.`,
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
  ctx: DecideContext = {
    continuing: false,
    knowledgeBefore: false,
    thread: [],
    otherNames: [],
  },
): Promise<{ decision: Decision; tools: string[]; mode: "mastra" | "demo" }> {
  const used: string[] = [];
  if (process.env.DEMO_MODE === "true")
    return { decision: demoDecision(input, ctx), tools: used, mode: "demo" };
  if (!process.env.OPENAI_API_KEY)
    throw new Error("Configure OPENAI_API_KEY ou ative DEMO_MODE=true.");
  const result = await makeAgent(ownerId, used).generate(
    `Histórico recente:\n${history.slice(-8).join("\n")}\n\n${ctx.knowledgeBefore ? "A última resposta do agente foi um artigo da central de ajuda.\n" : ""}${ctx.continuing ? "A última resposta do agente foi uma pergunta de esclarecimento sobre um chamado em preparo.\n" : ""}Mensagem atual: ${input}`,
    { structuredOutput: { schema: intentSchema } },
  );
  return {
    decision: intentSchema.parse(result.object),
    tools: used,
    mode: "mastra",
  };
}
const followUp =
  /\b(hoje|entrega|urgente|prazo|parado|nao resolv|continua|ainda nao|preciso|reuniao|apresentacao)\b/;
function tidy(x: string) {
  return normalize(x) ? x : "";
}
export function demoDecision(
  rawInput: string,
  ctx: DecideContext = {
    continuing: false,
    knowledgeBefore: false,
    thread: [],
    otherNames: [],
  },
): Decision {
  const input = rawInput,
    t = normalize(input),
    raw = ` ${input
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()} `,
    id = input.match(/(?:INC|REQ)-\d+/i)?.[0]?.toUpperCase() || null;
  const other = ctx.otherNames.some((n) =>
    raw.includes(
      ` ${n
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()} `,
    ),
  );
  const baseIntent =
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
                  t.includes("meus") ||
                  other)
              ? "list"
              : t.includes("abrir") ||
                  t.includes("criar") ||
                  t.includes("problema")
                ? "create"
                : searchKnowledge(input).length
                  ? "knowledge"
                  : "unclear";
  const greeting =
    baseIntent === "unclear" &&
    /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|obrigad[oa]|valeu|hey|e ai)\b/.test(
      raw.trim(),
    );
  const sticky = ["knowledge", "unclear", "create"].includes(baseIntent);
  const intent: Decision["intent"] =
    sticky && (ctx.continuing || (ctx.knowledgeBefore && followUp.test(raw)))
      ? "create"
      : baseIntent;
  // O relato inclui as mensagens anteriores do mesmo atendimento.
  const story = (
    intent === "create"
      ? [...ctx.thread.filter((m) => m !== input), input]
      : [input]
  ).join(". ");
  const s = ` ${story
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()} `;
  const category = /vpn|wifi|rede/.test(s)
    ? "Rede e VPN"
    : /senha|acesso/.test(s)
      ? "Acesso"
      : /notebook|monitor/.test(s)
        ? "Hardware"
        : /email|outlook/.test(s)
          ? "E-mail"
          : /software/.test(s)
            ? "Software"
            : "Outros";
  const impact: Impact = s.includes("empresa")
    ? "empresa"
    : s.includes("equipe")
      ? "equipe"
      : "pessoa";
  const urgency: Urgency = /\bhoje\b|entrega|urgente/.test(s)
    ? "hoje"
    : s.includes("parado")
      ? "imediata"
      : "normal";
  const osRaw = story.match(
    /windows\s*(?:10|11)|macos|mac os|linux|ubuntu|android|\bios\b/i,
  )?.[0];
  const os = osRaw
    ? osRaw.replace(/^windows\s*/i, "Windows ").replace(/^macos$/i, "macOS")
    : null;
  const deadline =
    story.match(
      /(?:entrega|reuni[aã]o|apresenta[cç][aã]o|fechamento|prazo)[^,.;]*?(?:hoje|amanh[aã])/i,
    )?.[0] ||
    (/\bhoje\b/.test(s) ? "hoje" : /urgente/.test(s) ? "urgente" : null);
  const subject = /vpn/.test(s) ? "o cliente de VPN" : "o equipamento";
  const tried: string[] = [];
  if (/ja reinstal|reinstalei/.test(s)) tried.push(`Reinstalou ${subject}`);
  if (/reinici|reboot/.test(s)) tried.push("Reiniciou o computador");
  if (/outra rede|rede diferente/.test(s)) tried.push("Testou em outra rede");
  const neverTried = /ainda nao|nao reinstalei|nao tentei|nada ainda/.test(s);
  let question: Decision["question"] = null;
  if (intent === "create") {
    if (!tried.length && !neverTried && category !== "Outros")
      question = /vpn/.test(s)
        ? {
            text: "Antes de montar o chamado: você já reinstalou o cliente de VPN?",
            options: ["Sim, já reinstalei", "Ainda não", "Não sei como fazer"],
          }
        : {
            text: "Antes de montar o chamado: você já tentou reiniciar o equipamento?",
            options: ["Sim, já reiniciei", "Ainda não", "Não sei como fazer"],
          };
    else if (!os && ["Rede e VPN", "Software", "Hardware"].includes(category))
      question = {
        text: "Qual sistema operacional você usa?",
        options: ["Windows 11", "Windows 10", "macOS", "Outro"],
      };
  }
  const problem = tidy(
    story
      .split(/\.\s/)
      .filter((x) => !/^(sim|nao|n[aã]o|ainda)\b/i.test(x.trim()))[0]
      ?.replace(/\s+e\s+(?:tenho|preciso|tenho que)\b.*$/i, "")
      .replace(/^(?:[eé]\s+)/i, "") || "",
  );
  const base = intent === "create" ? problem || input : input;
  return {
    intent,
    type: intent === "create" ? "INC" : null,
    category,
    impact,
    urgency,
    confidence: intent === "unclear" && !greeting ? 0.4 : 0.85,
    title: base.slice(0, 90),
    description: base,
    ticketId: id,
    answer: greeting
      ? "Olá! Sou o assistente de TI da Nexo. Descreva seu problema ou dúvida, ou escolha uma opção rápida."
      : "",
    missing: /^(abrir|criar) chamado( de ti)?$/.test(t)
      ? ["descrição do problema", "pessoas afetadas", "urgência"]
      : [],
    tried,
    os,
    deadline,
    aboutOtherPerson: other && !t.includes("meus"),
    question,
  };
}
