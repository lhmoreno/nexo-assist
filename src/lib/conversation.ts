import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { conversations, messages, tickets } from "./schema";
import { decide, searchKnowledge } from "./agent";
import {
  dueAt,
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
};
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
    messages: db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, c.id))
      .orderBy(messages.createdAt)
      .all(),
    tickets: db.select().from(tickets).where(eq(tickets.ownerId, userId)).all(),
  };
}
function saveDraft(id: string, draft: Draft | null) {
  db.update(conversations)
    .set({ draft: draft ? JSON.stringify(draft) : null, updatedAt: Date.now() })
    .where(eq(conversations.id, id))
    .run();
}
function transfer(id: string, reason: string) {
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
        body = result.duplicate
          ? `Encontrei o chamado ${result.ticket.id} para o mesmo problema; não criei outro.`
          : `Chamado ${result.ticket.id} criado com prioridade ${result.ticket.priority}.`;
        if (!result.duplicate && result.ticket.priority === "Crítica") {
          await ticketService.transfer(userId, result.ticket.id);
          body += " Atendimento crítico: um analista foi acionado.";
          transfer(c.id, "chamado crítico");
        }
      } else if (draft.action === "update") {
        const t = await ticketService.update(
          userId,
          draft.ticketId!,
          draft.description!,
        );
        body = `Atualizei o chamado ${t.id}.`;
      } else {
        const t = await ticketService.reopen(userId, draft.ticketId!);
        body = `Reabri o chamado ${t.id}.`;
      }
      saveDraft(c.id, null);
      return emit(
        c.id,
        body,
        {
          intent: draft.action,
          tools: ["ticketService"],
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
    if (isOverdue(t.dueAt, t.status)) transfer(c.id, "chamado vencido");
    return emit(
      c.id,
      `${t.id} — ${t.title}. Status: ${t.status}. Prioridade: ${t.priority}. ${isOverdue(t.dueAt, t.status) ? "Prazo vencido. Encaminhei para um analista." : "Prazo: " + new Date(t.dueAt).toLocaleString("pt-BR")}.`,
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
        rules: ["Consulta restrita ao proprietário", "Verificação de SLA"],
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
    .map((m) => `${m.sender}: ${m.body}`);
  try {
    const { decision: d, tools, mode } = await decide(userId, text, history);
    let body = "",
      results: string[] = [];
    const rules: string[] = [];
    let draft: Draft | null = null;
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
    } else if (d.confidence < 0.55) {
      body = transfer(c.id, "classificação com baixa confiança");
      rules.push("Baixa confiança");
    } else if (d.intent === "list") {
      results = open.map((t) => `${t.id}: ${t.status}`);
      body = open.length
        ? `Encontrei ${open.length} chamado(s) em andamento. Selecione um card abaixo para ver os detalhes.`
        : "Não encontrei chamados em andamento no seu nome.";
      const overdue = open.filter((t) => isOverdue(t.dueAt, t.status));
      if (overdue.length) {
        body += ` ${overdue.length} está(ão) com prazo vencido. Encaminhei a conversa para um analista.`;
        transfer(c.id, "chamado vencido");
        rules.push("Transferência de chamado vencido");
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
        d.missing.length > 0 ||
        !impact ||
        !urgency ||
        !category ||
        !d.description ||
        d.description.length < 10
      ) {
        body = `Para preparar o chamado, informe ${d.missing.length ? d.missing.join(", ") : "o que aconteceu, quantas pessoas foram afetadas e se há um compromisso em risco"}.`;
        rules.push("Dados obrigatórios");
      } else {
        const priority = priorityFor(impact, urgency, type);
        draft = {
          action: "create",
          type,
          title: d.title || text.slice(0, 80),
          description: d.description,
          category,
          impact,
          urgency,
        };
        saveDraft(c.id, draft);
        body = `Rascunho: ${draft.title}\nTipo: ${type} · Categoria: ${category}\nImpacto: ${impact} · Urgência: ${urgency}\nPrioridade: ${priority} · Prazo: ${dueAt(new Date(), priority).toLocaleString("pt-BR")}\n\nConfirme para criar ou cancele. Nenhum chamado foi criado ainda.`;
        rules.push(
          "Confirmação obrigatória",
          "Prioridade calculada no backend",
        );
        if (priority === "Crítica") {
          body += " Após a confirmação, um analista será acionado.";
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
        body = `Rascunho para ${d.intent === "update" ? "atualizar" : "reabrir"} ${target.id}: ${draft.description}. Confirme ou cancele.`;
        rules.push("Confirmação obrigatória", "Proprietário validado");
      }
    } else body = "Descreva sua dúvida de TI ou escolha uma opção rápida.";
    const priority =
      d.impact && d.urgency
        ? priorityFor(d.impact, d.urgency, d.type || "INC")
        : null;
    return emit(
      c.id,
      body,
      {
        intent: d.intent,
        type: d.type,
        category: d.category,
        impact: d.impact,
        urgency: d.urgency,
        priority,
        confidence: d.confidence,
        tools,
        results,
        rules,
        reason:
          d.intent === "create"
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
