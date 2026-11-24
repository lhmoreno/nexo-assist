import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { conversations, messages, tickets, users } from "./schema";
import { decide, searchKnowledge, type DecideContext } from "./agent";
import { buildDescription, cleanTitle, formatDue } from "./intake";
import { normalize } from "./rules";
import {
  dueAt,
  duplicateOf,
  isOverdue,
  priorityFor,
  type Impact,
  type Urgency,
} from "./rules";
import { ticketService } from "./tickets";
type Draft = {
  action: "create" | "update" | "reopen";
  type?: "INC" | "REQ";
  title?: string;
  description?: string;
  category?: string;
  impact?: Impact;
  urgency?: Urgency;
  ticketId?: string;
  problem?: string;
  tried?: string[];
};
const QUICK = /^(Confirmar|Cancelar|Selecionar\s|Falar com analista$)/i;
const parse = (raw: string | null): Record<string, unknown> => {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
export const isHandoff = (raw: string | null) => parse(raw).kind === "handoff";
export function addMessage(
  conversationId: string,
  sender: "employee" | "agent" | "analyst" | "system",
  body: string,
  trace?: object,
) {
  db.insert(messages)
    .values({
      id: randomUUID(),
      conversationId,
      sender,
      body,
      trace: trace ? JSON.stringify(trace) : null,
      createdAt: Date.now(),
    })
    .run();
}
export function getConversation(userId: string) {
  let c = db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .get();
  if (!c || c.status === "closed") {
    const now = Date.now();
    c = {
      id: randomUUID(),
      userId,
      status: "agent",
      analystId: null,
      draft: null,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(conversations).values(c).run();
  }
  return c;
}
export function conversationState(userId: string) {
  const c = getConversation(userId);
  return {
    conversation: c,
    // O resumo da transferência é só para o console do analista.
    messages: db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, c.id))
      .orderBy(messages.createdAt)
      .all()
      .filter((m) => !isHandoff(m.trace)),
    tickets: db.select().from(tickets).where(eq(tickets.ownerId, userId)).all(),
  };
}
function saveDraft(id: string, draft: Draft | null) {
  db.update(conversations)
    .set({ draft: draft ? JSON.stringify(draft) : null, updatedAt: Date.now() })
    .where(eq(conversations.id, id))
    .run();
}
type Ticket = typeof tickets.$inferSelect;
const RELEVANT = ["knowledge", "clarify", "create", "update", "reopen"];
function transfer(id: string, reason: string, ticket?: Ticket) {
  const asc = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt)
    .all();
  // Problema = última mensagem do funcionário que o agente tratou como relato
  // de TI. O pedido de transferência não tem resposta do agente e fica de fora.
  let problemText: string | undefined;
  asc.forEach((m, i) => {
    const reply = asc[i + 1];
    if (
      m.sender === "employee" &&
      !QUICK.test(m.body) &&
      reply?.sender === "agent" &&
      RELEVANT.includes(String(parse(reply.trace).intent)) &&
      !/^(sim|não|nao|ainda)\b/i.test(m.body.trim())
    )
      problemText = m.body.slice(0, 240);
  });
  // Estado do chamado: o mais recente entre rascunho, criação ou cancelamento.
  const latest = [...asc]
    .reverse()
    .filter((m) => m.sender === "agent")
    .map((m) => parse(m.trace))
    .find((t) => t.ticket || t.draft || t.intent === "cancel");
  const mentioned = asc
    .filter((m) => m.sender === "employee")
    .flatMap((m) => m.body.match(/(?:INC|REQ)-\d+/gi) ?? [])
    .at(-1)
    ?.toUpperCase();
  const ownerId = db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .get()?.userId;
  const t =
    ticket ??
    (latest?.ticket as Ticket | undefined) ??
    (mentioned && ownerId
      ? db
          .select()
          .from(tickets)
          .where(and(eq(tickets.id, mentioned), eq(tickets.ownerId, ownerId)))
          .get()
      : undefined);
  const d = t ? undefined : (latest?.draft as Draft | undefined);
  const line = (label: string, text?: string | null) =>
    text ? `${label}: ${text}` : null;
  const field = (name: string) =>
    t?.description.match(new RegExp(`^${name}: (.+?)\\.?$`, "m"))?.[1];
  const problem = t
    ? field("Problema") || t.title
    : d?.problem || d?.title || problemText;
  const tried = t
    ? field("Já tentou")
    : d?.tried?.length
      ? d.tried.join("; ")
      : undefined;
  const classified = t?.priority ?? (d ? (latest?.priority as string) : null);
  const text = [
    "Resumo para o analista",
    line("Motivo da transferência", reason),
    t
      ? `Chamado: ${t.id} · ${t.title} (${t.status}, prazo ${formatDue(t.dueAt)})`
      : d
        ? "Chamado: ainda não aberto (rascunho aguardando confirmação)"
        : "Chamado: nenhum associado a esta conversa",
    line(
      "Problema",
      problem || "o funcionário ainda não descreveu um problema",
    ),
    line("Prioridade", classified),
    line("Já tentado", tried && !/nada informado/i.test(tried) ? tried : null),
  ]
    .filter(Boolean)
    .join("\n");
  addMessage(id, "system", text, { kind: "handoff" });
  db.update(conversations)
    .set({ status: "waiting", draft: null, updatedAt: Date.now() })
    .where(eq(conversations.id, id))
    .run();
  return `Encaminhei sua conversa para um analista. Motivo: ${reason}. O agente ficará pausado até o atendimento ser devolvido.`;
}
function emit(
  cId: string,
  body: string,
  trace: Record<string, unknown>,
  started: number,
) {
  addMessage(cId, "agent", body, {
    ...trace,
    executionMs: Date.now() - started,
  });
  return conversationState(
    db.select().from(conversations).where(eq(conversations.id, cId)).get()!
      .userId,
  );
}
export async function handleChat(
  userId: string,
  input: {
    action: "send" | "confirm" | "cancel" | "select" | "transfer" | "new";
    text?: string;
    ticketId?: string;
  },
) {
  const c = getConversation(userId),
    started = Date.now();
  if (input.action === "new") {
    if (c.status !== "agent" || c.messageCount < 30 || c.draft)
      throw new Error("Esta conversa ainda está em andamento.");
    db.insert(conversations)
      .values({
        id: randomUUID(),
        userId,
        status: "agent",
        analystId: null,
        draft: null,
        messageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    return conversationState(userId);
  }
  if (c.status !== "agent") {
    if (input.action !== "send")
      throw new Error("O agente está pausado enquanto o analista atende.");
    const humanText = (input.text || "").trim();
    if (!humanText || humanText.length > 2000)
      throw new Error("Mensagem inválida.");
    addMessage(c.id, "employee", humanText);
    db.update(conversations)
      .set({ updatedAt: Date.now() })
      .where(eq(conversations.id, c.id))
      .run();
    return conversationState(userId);
  }
  if (input.action === "confirm" || input.action === "cancel") {
    const draft =
      c.draft && c.draft !== "__processing__"
        ? (JSON.parse(c.draft) as Draft)
        : null;
    if (!draft) throw new Error("Não há operação pendente de confirmação.");
    const locked = db
      .update(conversations)
      .set({ draft: "__processing__" })
      .where(and(eq(conversations.id, c.id), eq(conversations.draft, c.draft!)))
      .returning({ id: conversations.id })
      .get();
    if (!locked) throw new Error("A operação já está sendo processada.");
    addMessage(
      c.id,
      "employee",
      input.action === "confirm" ? "Confirmar" : "Cancelar",
    );
    if (input.action === "cancel") {
      saveDraft(c.id, null);
      return emit(
        c.id,
        "Operação cancelada. Nenhum chamado foi alterado.",
        {
          intent: "cancel",
          tools: [],
          rules: ["Confirmação obrigatória"],
          reason: "O funcionário cancelou.",
        },
        started,
      );
    }
    try {
      let body = "";
      let created: Ticket | undefined;
      if (draft.action === "create") {
        const result = await ticketService.create({
          ownerId: userId,
          type: draft.type!,
          title: draft.title!,
          description: draft.description!,
          category: draft.category!,
          impact: draft.impact!,
          urgency: draft.urgency!,
          key: c.id + ":" + c.draft,
        });
        created = result.ticket;
        body = result.duplicate
          ? `Atualizei o chamado existente ${result.ticket.id}; não criei outro. Prazo: ${formatDue(result.ticket.dueAt)}.`
          : `Chamado ${result.ticket.id} criado com prioridade ${result.ticket.priority}. Prazo: ${formatDue(result.ticket.dueAt)}.`;
        if (!result.duplicate && result.ticket.priority === "Crítica") {
          await ticketService.transfer(userId, result.ticket.id);
          body += " Atendimento crítico: um analista foi acionado.";
          transfer(c.id, "chamado crítico", result.ticket);
        }
      } else if (draft.action === "update") {
        const t = await ticketService.update(
          userId,
          draft.ticketId!,
          draft.description!,
        );
        created = t;
        body = `Atualizei o chamado ${t.id}. Prazo: ${formatDue(t.dueAt)}.`;
      } else {
        const t = await ticketService.reopen(userId, draft.ticketId!);
        created = t;
        body = `Reabri o chamado ${t.id}. Prazo: ${formatDue(t.dueAt)}.`;
      }
      saveDraft(c.id, null);
      return emit(
        c.id,
        body,
        {
          intent: draft.action,
          tools: ["ticketService"],
          ticket: created,
          rules: [
            "Confirmação explícita",
            "Autorização do proprietário",
            "Idempotência",
          ],
          reason: "Operação confirmada pelo funcionário.",
        },
        started,
      );
    } catch (e) {
      saveDraft(c.id, draft);
      return emit(
        c.id,
        e instanceof Error ? e.message : "Erro no serviço de chamados.",
        {
          intent: draft.action,
          tools: ["ticketService"],
          errors: [String(e)],
          reason: "A operação não foi concluída; rascunho preservado.",
        },
        started,
      );
    }
  }
  if (input.action === "select") {
    const t = await ticketService.get(userId, input.ticketId || "");
    if (!t) throw new Error("Chamado não encontrado.");
    addMessage(c.id, "employee", `Selecionar ${t.id}`);
    if (isOverdue(t.dueAt, t.status)) transfer(c.id, "chamado vencido", t);
    return emit(
      c.id,
      isOverdue(t.dueAt, t.status)
        ? "Esse chamado passou do prazo de atualização. Encaminhei a conversa para um analista."
        : "Encontrei o chamado. Confira o status e o prazo abaixo.",
      {
        intent: "list",
        type: t.type,
        category: t.category,
        impact: t.impact,
        urgency: t.urgency,
        priority: t.priority,
        confidence: 1,
        tools: ["ticketService.get"],
        results: [t.id, t.status],
        ticket: t,
        rules: [
          "Consulta restrita ao proprietário",
          "Verificação de SLA",
          ...(isOverdue(t.dueAt, t.status)
            ? ["Transferência de chamado vencido"]
            : []),
        ],
        reason: "Chamado selecionado pelo funcionário.",
      },
      started,
    );
  }
  if (input.action === "transfer") {
    addMessage(c.id, "employee", "Falar com analista");
    const body = transfer(c.id, "solicitação do funcionário");
    return emit(
      c.id,
      body,
      {
        intent: "transfer",
        confidence: 1,
        tools: [],
        rules: ["Transferência solicitada"],
        reason: "Solicitação explícita do funcionário.",
      },
      started,
    );
  }
  const text = (input.text || "").trim();
  if (!text || text.length > 2000) throw new Error("Mensagem inválida.");
  if (c.messageCount >= 30)
    throw new Error("Limite de 30 mensagens nesta sessão.");
  if (c.draft)
    throw new Error(
      "Confirme ou cancele o rascunho antes de enviar outra mensagem.",
    );
  addMessage(c.id, "employee", text);
  db.update(conversations)
    .set({ messageCount: c.messageCount + 1, updatedAt: Date.now() })
    .where(eq(conversations.id, c.id))
    .run();
  const ids = db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .all()
    .map((x) => x.id);
  const history = db
    .select()
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .orderBy(desc(messages.createdAt))
    .limit(8)
    .all()
    .reverse()
    .filter((m) => !isHandoff(m.trace))
    .map((m) => `${m.sender}: ${m.body}`);
  // Relato em andamento: mensagens do funcionário desde o último desfecho.
  const thread: string[] = [];
  let lastAgent: { intent?: string; body: string } | undefined,
    rounds = 0;
  for (const m of db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, c.id))
    .orderBy(desc(messages.createdAt))
    .all()) {
    if (m.sender === "employee") {
      if (!QUICK.test(m.body)) thread.unshift(m.body);
    } else if (m.sender === "agent") {
      const intent = parse(m.trace).intent as string | undefined;
      lastAgent ??= { intent, body: m.body };
      if (intent === "clarify") rounds++;
      if (
        !["knowledge", "clarify"].includes(intent || "") &&
        !m.body.startsWith("Para preparar o chamado")
      )
        break;
    }
    if (thread.length >= 6) break;
  }
  const ctx: DecideContext = {
    continuing:
      lastAgent?.intent === "clarify" ||
      !!lastAgent?.body.startsWith("Para preparar o chamado"),
    knowledgeBefore: lastAgent?.intent === "knowledge",
    thread,
    otherNames: db
      .select()
      .from(users)
      .where(eq(users.role, "employee"))
      .all()
      .filter((u) => u.id !== userId)
      .map((u) => u.name.split(" ")[0]),
  };
  try {
    const {
      decision: d,
      tools,
      mode,
    } = await decide(userId, text, history, ctx);
    let quick: string[] | undefined;
    let dueMs: number | undefined;
    const asksFor = [...text.matchAll(/(?:INC|REQ)-\d+/gi)].map((x) =>
      x[0].toUpperCase(),
    );
    let body = "",
      results: string[] = [];
    const rules: string[] = [];
    let draft: Draft | null = null,
      denied = false,
      clarify = false;
    const owned = await ticketService.list(userId);
    tools.push("ticketService.list");
    const selected = d.ticketId ? owned.find((t) => t.id === d.ticketId) : null;
    const open = owned.filter(
      (t) => !["Resolvido", "Fechado", "Aprovado"].includes(t.status),
    );
    const target =
      selected ||
      ((d.intent === "update" || d.intent === "reopen") && owned.length === 1
        ? owned[0]
        : null);
    if (d.intent === "transfer") {
      body = transfer(c.id, "solicitação do funcionário");
      rules.push("Transferência solicitada");
    } else if (d.intent === "outside") {
      body =
        "Posso ajudar com assuntos de TI. Para esse tema, procure a área responsável.";
      rules.push("Escopo restrito a TI");
    } else if (
      ["list", "update", "reopen"].includes(d.intent) &&
      (d.aboutOtherPerson ||
        asksFor.some((i) => !owned.some((t) => t.id === i)))
    ) {
      body = "Só posso informar chamados abertos por você.";
      rules.push("Consulta restrita ao proprietário");
      denied = true;
    } else if (d.confidence < 0.55) {
      body = transfer(c.id, "classificação com baixa confiança");
      rules.push("Baixa confiança");
    } else if (d.intent === "list") {
      results = open.map((t) => `${t.id}: ${t.status}`);
      body = owned.length
        ? `Encontrei ${owned.length} ${owned.length === 1 ? "chamado" : "chamados"} no seu nome; ${open.length} ${open.length === 1 ? "está" : "estão"} em andamento. Selecione um chamado abaixo para ver os detalhes.`
        : "Não encontrei chamados no seu nome.";
      const overdue = open.filter((t) => isOverdue(t.dueAt, t.status));
      if (overdue.length) {
        body += ` ${overdue.length} ${overdue.length === 1 ? "está" : "estão"} com prazo vencido. Selecione um deles para consultar e encaminhar ao analista.`;
        rules.push("Prazo dos chamados verificado");
      }
    } else if (d.intent === "knowledge") {
      const found = searchKnowledge(text);
      tools.push("searchKnowledge");
      results = found.map((x) => x.title);
      body = found.length
        ? `${found[0].body}\n\nFonte: ${found[0].title}.`
        : d.answer ||
          "Não achei um artigo conclusivo. Descreva o problema com mais detalhes.";
    } else if (d.intent === "create") {
      const type = d.type || "INC",
        impact = d.impact,
        urgency = d.urgency,
        category = d.category;
      if (
        !impact ||
        !urgency ||
        !category ||
        !d.description ||
        d.description.length < 10
      ) {
        body = `Para preparar o chamado, informe ${d.missing.length ? d.missing.join(", ") : "o que aconteceu, quantas pessoas foram afetadas e se há um compromisso em risco"}.`;
        rules.push("Dados obrigatórios");
      } else {
        if (d.question && rounds < 2) {
          body = d.question.text;
          quick = d.question.options;
          clarify = true;
          rules.push("Pergunta de esclarecimento antes do rascunho");
        } else {
          const priority = priorityFor(impact, urgency, type);
          const problem = cleanTitle(d.description || d.title || text, 300);
          let title = cleanTitle(d.title || problem, 70);
          if (d.os && !normalize(title).includes(normalize(d.os)))
            title = cleanTitle(`${title} (${d.os})`, 80);
          const description = buildDescription({
            problem,
            tried: d.tried,
            os: d.os,
            deadline: d.deadline,
            impact,
          });
          const similar = duplicateOf(`${title} ${problem}`, owned, category);
          draft = similar
            ? { action: "update", ticketId: similar, description }
            : {
                action: "create",
                type,
                title,
                description,
                category,
                impact,
                urgency,
                problem,
                tried: d.tried,
              };
          saveDraft(c.id, draft);
          dueMs = dueAt(new Date(), priority).getTime();
          body = similar
            ? `Encontrei o chamado aberto ${similar} para o mesmo problema. Preparei uma atualização; confira e confirme antes de alterar.`
            : `Preparei um rascunho do chamado ${type === "INC" ? "(incidente)" : "(requisição)"} com prioridade ${priority} e prazo até ${formatDue(dueMs)}. Confira os dados antes de criar.`;
          rules.push(
            "Confirmação obrigatória",
            "Prioridade calculada no backend",
            ...(similar
              ? ["Chamado semelhante: atualizar em vez de duplicar"]
              : []),
          );
          if (!similar && priority === "Crítica") {
            body += " Após a confirmação, um analista será acionado.";
          }
        }
      }
    } else if (d.intent === "update" || d.intent === "reopen") {
      if (!target) {
        body = `Qual chamado você quer ${d.intent === "update" ? "atualizar" : "reabrir"}? Selecione um card ou informe o número.`;
        rules.push("Seleção de chamado obrigatória");
      } else {
        draft = {
          action: d.intent,
          ticketId: target.id,
          description: d.description || text,
        };
        saveDraft(c.id, draft);
        body = `Preparei um rascunho para ${d.intent === "update" ? "atualizar" : "reabrir"} o chamado ${target.id}. Confira antes de confirmar.`;
        rules.push("Confirmação obrigatória", "Proprietário validado");
      }
    } else body = "Descreva sua dúvida de TI ou escolha uma opção rápida.";
    // Classificação só aparece quando faz parte da ação (chamado).
    const ticketful = ["create", "update", "reopen"].includes(d.intent);
    const priority =
      d.intent === "create" && d.impact && d.urgency
        ? priorityFor(d.impact, d.urgency, d.type || "INC")
        : null;
    return emit(
      c.id,
      body,
      {
        intent: denied ? "denied" : clarify ? "clarify" : d.intent,
        type: ticketful ? d.type : null,
        category: ticketful ? d.category : null,
        impact: ticketful ? d.impact : null,
        urgency: ticketful ? d.urgency : null,
        priority,
        dueAt: dueMs,
        confidence: d.confidence,
        tools,
        results,
        draft,
        quick,
        rules,
        reason: denied
          ? "Chamados de outras pessoas não são consultados."
          : clarify
            ? "Faltam informações úteis ao analista; pergunta feita antes do rascunho."
            : d.intent === "create"
              ? "Dados classificados; aguardando confirmação."
              : d.intent === "knowledge"
                ? "Resposta baseada na central de ajuda."
                : "Ação escolhida conforme intenção e estado da conversa.",
        mode,
      },
      started,
    );
  } catch (e) {
    return emit(
      c.id,
      e instanceof Error ? e.message : "Falha na resposta.",
      {
        intent: "error",
        tools: [],
        errors: [String(e)],
        rules: ["Nenhuma operação foi executada"],
        reason: "Falha de serviço ou modelo.",
      },
      started,
    );
  }
}
