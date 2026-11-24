import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
const testDb = `./data/test-nexo-${randomUUID()}.sqlite`;
process.env.DATABASE_URL = testDb;
process.env.DEMO_MODE = "true";
let db: typeof import("../src/lib/db").db;
let schema: typeof import("../src/lib/schema");
let ticketService: typeof import("../src/lib/tickets").ticketService;
let handleChat: typeof import("../src/lib/conversation").handleChat;
let conversationState: typeof import("../src/lib/conversation").conversationState;
const user = "test-employee",
  other = "test-other";
beforeAll(async () => {
  ({ db } = await import("../src/lib/db"));
  schema = await import("../src/lib/schema");
  ({ ticketService } = await import("../src/lib/tickets"));
  ({ handleChat, conversationState } = await import("../src/lib/conversation"));
  for (const id of [user, other])
    await db
      .insert(schema.users)
      .values({ id, name: id, email: id + "@nexo.com", role: "employee" })
      .onConflictDoNothing();
});
afterAll(() => {
  for (const ext of ["", "-wal", "-shm"])
    try {
      fs.unlinkSync(testDb + ext);
    } catch {}
});
describe("fluxos seguros", () => {
  it("não cria antes da confirmação e impede duplicação", async () => {
    const id = randomUUID();
    const first = await handleChat(user, {
      action: "send",
      text: "Abrir chamado: meu notebook está lento após atualização " + id,
    });
    expect(first.conversation.draft).toBeNull();
    expect(first.messages.at(-1)?.trace).toContain('"clarify"');
    await handleChat(user, { action: "send", text: "Sim, já reiniciei" });
    const second = await handleChat(user, {
      action: "send",
      text: "Windows 11",
    });
    expect(second.conversation.draft).toBeTruthy();
    expect(first.tickets.some((t) => t.description.includes(id))).toBe(false);
    const confirmed = await handleChat(user, { action: "confirm" });
    expect(confirmed.tickets.some((t) => t.description.includes(id))).toBe(
      true,
    );
    const count = confirmed.tickets.length;
    await handleChat(user, {
      action: "send",
      text: "Abrir chamado: meu notebook está lento após atualização " + id,
    });
    await handleChat(user, { action: "send", text: "Sim, já reiniciei" });
    await handleChat(user, { action: "send", text: "Windows 11" });
    const again = await handleChat(user, { action: "confirm" });
    expect(again.tickets.length).toBe(count);
    expect(
      again.tickets.find((t) => t.description.includes(id))?.description,
    ).toContain("Atualização:");
  });
  it("restringe consulta e atualização ao proprietário", async () => {
    const t = (
      await ticketService.create({
        ownerId: user,
        type: "INC",
        title: "Teste exclusivo " + randomUUID(),
        description: "Teste exclusivo de TI",
        category: "Hardware",
        impact: "pessoa",
        urgency: "normal",
        key: randomUUID(),
      })
    ).ticket;
    expect(await ticketService.get(other, t.id)).toBeNull();
    await expect(ticketService.update(other, t.id, "nota")).rejects.toThrow();
  });
  it("atualiza uma duplicata no serviço e não repete a atualização na mesma chave", async () => {
    const title = "VPN falha no notebook " + randomUUID();
    const input = {
      ownerId: user,
      type: "INC" as const,
      title,
      description: title,
      category: "Rede e VPN",
      impact: "pessoa" as const,
      urgency: "normal" as const,
    };
    const first = await ticketService.create({ ...input, key: randomUUID() });
    const key = randomUUID();
    const second = await ticketService.create({ ...input, key });
    expect(second.duplicate).toBe(true);
    expect(second.ticket.id).toBe(first.ticket.id);
    expect(second.ticket.description).toContain("Atualização:");
    const retry = await ticketService.create({ ...input, key });
    expect(retry.ticket.description).toBe(second.ticket.description);
  });
  it("transfere e pausa o agente", async () => {
    const state = await handleChat(other, { action: "transfer" });
    expect(state.conversation.status).toBe("waiting");
    // O resumo existe para o analista, mas não aparece para o funcionário.
    expect(state.messages.some((m) => m.body.startsWith("Resumo"))).toBe(false);
    const conv = state.conversation.id;
    expect(
      (await db.select().from(schema.messages)).some(
        (m) => m.conversationId === conv && m.body.startsWith("Resumo"),
      ),
    ).toBe(true);
    const human = await handleChat(other, { action: "send", text: "ajuda" });
    expect(human.messages.at(-1)?.sender).toBe("employee");
    expect(human.conversation.status).toBe("waiting");
  });
  it("trata falha temporária sem criar dados", async () => {
    process.env.LEGACY_FAILURE_RATE = "1";
    await expect(ticketService.list(user)).rejects.toThrow(
      "temporariamente indisponível",
    );
    process.env.LEGACY_FAILURE_RATE = "0";
    expect((await conversationState(user)).tickets).toBeDefined();
  });
  it("redireciona assunto fora de TI e pede contexto ambíguo", async () => {
    const outside = await handleChat(user, {
      action: "send",
      text: "Preciso falar sobre minhas férias no RH",
    });
    expect(outside.messages.at(-1)?.body).toContain("assuntos de TI");
    const hello = await handleChat(user, {
      action: "send",
      text: "oi, tudo bem?",
    });
    expect(hello.conversation.status).toBe("agent");
    expect(hello.messages.at(-1)?.body).toMatch(/Olá/);
    const unclear = await handleChat(user, { action: "send", text: "zzz qqq" });
    expect(unclear.conversation.status).toBe("waiting");
    expect(unclear.messages.at(-1)?.trace).toContain("Baixa confiança");
  });
});

describe("reabertura e idempotência", () => {
  it("reabre só chamado resolvido nos últimos 7 dias", async () => {
    const key = randomUUID();
    const t = (
      await ticketService.create({
        ownerId: user,
        type: "INC",
        title: "MFA bloqueado " + key,
        description: "MFA bloqueado " + key,
        category: "Acesso",
        impact: "pessoa",
        urgency: "normal",
        key,
      })
    ).ticket;
    const { eq } = await import("drizzle-orm");
    await db
      .update(schema.tickets)
      .set({ status: "Resolvido", resolvedAt: Date.now() - 6 * 86400000 })
      .where(eq(schema.tickets.id, t.id));
    expect((await ticketService.reopen(user, t.id)).status).toBe("Reaberto");
    await db
      .update(schema.tickets)
      .set({ status: "Resolvido", resolvedAt: Date.now() - 8 * 86400000 })
      .where(eq(schema.tickets.id, t.id));
    await expect(ticketService.reopen(user, t.id)).rejects.toThrow("7 dias");
  });
});

describe("limite de sessão", () => {
  it("preserva a 30ª resposta e só inicia outra sessão por ação explícita", async () => {
    const { eq } = await import("drizzle-orm");
    const id = "test-limit";
    await db
      .insert(schema.users)
      .values({ id, name: id, email: id + "@nexo.com", role: "employee" })
      .onConflictDoNothing();
    await db
      .insert(schema.articles)
      .values({
        id: "test-vpn",
        title: "VPN erro 809",
        body: "Reinstale o cliente VPN.",
        keywords: "vpn 809 rede",
      })
      .onConflictDoNothing();
    const initial = await conversationState(id);
    await db
      .update(schema.conversations)
      .set({ messageCount: 29 })
      .where(eq(schema.conversations.id, initial.conversation.id));
    const last = await handleChat(id, {
      action: "send",
      text: "Como resolver erro 809 na VPN?",
    });
    expect(last.conversation.id).toBe(initial.conversation.id);
    expect(last.conversation.messageCount).toBe(30);
    expect(last.messages.at(-1)?.sender).toBe("agent");
    await expect(
      handleChat(id, { action: "send", text: "Outra dúvida" }),
    ).rejects.toThrow("30");
    const next = await handleChat(id, { action: "new" });
    expect(next.conversation.id).not.toBe(initial.conversation.id);
    expect(next.conversation.messageCount).toBe(0);
  });
});

describe("consulta de chamado vencido", () => {
  it("permite selecionar o chamado antes da transferência", async () => {
    const { eq } = await import("drizzle-orm");
    const owner = "test-overdue";
    await db
      .insert(schema.users)
      .values({
        id: owner,
        name: owner,
        email: owner + "@nexo.com",
        role: "employee",
      })
      .onConflictDoNothing();
    const t = (
      await ticketService.create({
        ownerId: owner,
        type: "INC",
        title: "Notebook lento após atualização de teste",
        description: "Notebook lento após atualização de teste",
        category: "Hardware",
        impact: "pessoa",
        urgency: "normal",
        key: randomUUID(),
      })
    ).ticket;
    await db
      .update(schema.tickets)
      .set({ dueAt: Date.now() - 1000 })
      .where(eq(schema.tickets.id, t.id));
    const listed = await handleChat(owner, {
      action: "send",
      text: "Quero consultar o status dos meus chamados",
    });
    expect(listed.conversation.status).toBe("agent");
    expect(listed.messages.at(-1)?.body).toContain("Selecione");
    const selected = await handleChat(owner, {
      action: "select",
      ticketId: t.id,
    });
    expect(selected.conversation.status).toBe("waiting");
    expect(selected.messages.at(-1)?.body).toContain("analista");
  });
});

describe("jornada de abertura (Anexo B)", () => {
  const who = "test-journey";
  beforeAll(async () => {
    await db
      .insert(schema.users)
      .values({
        id: who,
        name: "Jo Jornada",
        email: who + "@nexo.com",
        role: "employee",
      })
      .onConflictDoNothing();
    await db
      .insert(schema.users)
      .values({
        id: "test-bruno",
        name: "Bruno Teste",
        email: "tb@nexo.com",
        role: "employee",
      })
      .onConflictDoNothing();
    await db
      .insert(schema.articles)
      .values({
        id: "test-vpn2",
        title: "VPN não conecta",
        body: "Reinstale o cliente VPN.",
        keywords: "vpn conecta",
      })
      .onConflictDoNothing();
  });
  it("oferece chamado após o artigo, pergunta o que já tentou e mostra tipo e prazo", async () => {
    const art = await handleChat(who, {
      action: "send",
      text: "Minha VPN não conecta",
    });
    expect(art.messages.at(-1)?.trace).toContain('"knowledge"');
    expect(art.messages.at(-1)?.trace).not.toContain('"priority":"Média"');
    const q = await handleChat(who, {
      action: "send",
      text: "é Windows 11 e tenho entrega hoje",
    });
    const qt = JSON.parse(q.messages.at(-1)!.trace!);
    expect(qt.intent).toBe("clarify");
    expect(qt.quick).toContain("Sim, já reinstalei");
    const d = await handleChat(who, {
      action: "send",
      text: "Sim, já reinstalei",
    });
    const dt = JSON.parse(d.messages.at(-1)!.trace!);
    expect(dt.draft.type).toBe("INC");
    expect(dt.draft.title).toMatch(/^[A-ZÀ-Ú]/);
    expect(dt.draft.title).not.toMatch(/quero abrir/i);
    expect(dt.draft.description).toContain("Problema:");
    expect(dt.draft.description).toContain(
      "Já tentou: Reinstalou o cliente de VPN",
    );
    expect(dt.draft.description).toContain("Sistema operacional: Windows 11");
    expect(dt.draft.description).toContain("entrega hoje");
    expect(dt.priority).toBe("Alta");
    expect(dt.dueAt).toBeGreaterThan(Date.now());
    const done = await handleChat(who, { action: "confirm" });
    const last = done.messages.at(-1)!;
    expect(last.body).toMatch(/Prazo:/);
    expect(JSON.parse(last.trace!).ticket.id).toMatch(/^INC-/);
  });
  it("explica a recusa ao consultar chamado de outra pessoa", async () => {
    const r = await handleChat(who, {
      action: "send",
      text: "Qual o status do chamado do Bruno Teste?",
    });
    expect(r.messages.at(-1)?.body).toBe(
      "Só posso informar chamados abertos por você.",
    );
    const t = await handleChat(who, {
      action: "send",
      text: "Status do chamado INC-00001",
    });
    expect(t.messages.at(-1)?.body).toBe(
      "Só posso informar chamados abertos por você.",
    );
  });
  it("resumo da transferência traz chamado, problema, prioridade e tentativas", async () => {
    await handleChat(who, { action: "transfer" });
    const conv = (await conversationState(who)).conversation.id;
    const summary = (await db.select().from(schema.messages)).find(
      (m) => m.conversationId === conv && m.body.startsWith("Resumo"),
    )!;
    expect(summary.body).toMatch(/Chamado: INC-/);
    expect(summary.body).toContain("Prioridade: Alta");
    expect(summary.body).toContain("Já tentado: Reinstalou");
    expect(summary.body).not.toContain(" | ");
  });
});

describe("resumo da transferência usa o estado real", () => {
  const summaryOf = async (conv: string) =>
    (await db.select().from(schema.messages))
      .filter((m) => m.conversationId === conv && m.body.startsWith("Resumo"))
      .at(-1)!.body;
  it("usa o problema descrito, não o pedido de transferência, e omite prioridade não classificada", async () => {
    const who = "test-summary";
    await db
      .insert(schema.articles)
      .values({
        id: "test-outlook",
        title: "Outlook no celular",
        body: "Instale o app Outlook e entre com o e-mail corporativo.",
        keywords: "outlook celular configuro",
      })
      .onConflictDoNothing();
    await db
      .insert(schema.users)
      .values({
        id: who,
        name: "Sofia Resumo",
        email: who + "@nexo.com",
        role: "employee",
      })
      .onConflictDoNothing();
    await handleChat(who, {
      action: "send",
      text: "Como configuro o Outlook no celular?",
    });
    const s = await handleChat(who, {
      action: "send",
      text: "Quero falar com um analista",
    });
    const body = await summaryOf(s.conversation.id);
    expect(body).toContain("Chamado: nenhum associado");
    expect(body).toContain("Problema: Como configuro o Outlook no celular?");
    expect(body).not.toContain("Quero falar com um analista");
    expect(body).not.toContain("Prioridade:");
  });
  it("sem relato de TI, diz que não há problema descrito", async () => {
    const who = "test-summary-empty";
    await db
      .insert(schema.users)
      .values({
        id: who,
        name: "Zeca Vazio",
        email: who + "@nexo.com",
        role: "employee",
      })
      .onConflictDoNothing();
    const s = await handleChat(who, { action: "transfer" });
    expect(await summaryOf(s.conversation.id)).toContain("ainda não descreveu");
  });
});

describe("duplicidade na conversa", () => {
  it("propõe atualizar o chamado aberto do mesmo problema", async () => {
    const who = "test-dup-chat";
    await db
      .insert(schema.users)
      .values({
        id: who,
        name: "Dora Dup",
        email: who + "@nexo.com",
        role: "employee",
      })
      .onConflictDoNothing();
    const open = (
      await ticketService.create({
        ownerId: who,
        type: "INC",
        title: "VPN não conecta (Windows 11)",
        description:
          "Problema: Não consigo conectar à VPN no Windows 11.\nJá tentou: nada informado.",
        category: "Rede e VPN",
        impact: "pessoa",
        urgency: "normal",
        key: randomUUID(),
      })
    ).ticket;
    const s = await handleChat(who, {
      action: "send",
      text: "Abrir chamado: a VPN continua sem conectar no Windows 11, já reinstalei o cliente",
    });
    const draft = JSON.parse(s.messages.at(-1)!.trace!).draft;
    expect(draft.action).toBe("update");
    expect(draft.ticketId).toBe(open.id);
  });
});

describe("limite diário de uso", () => {
  it("bloqueia o usuário que passa do teto e mantém os outros", async () => {
    const who = "test-cap",
      free = "test-cap-free";
    for (const id of [who, free])
      await db
        .insert(schema.users)
        .values({ id, name: id, email: id + "@nexo.com", role: "employee" })
        .onConflictDoNothing();
    process.env.DAILY_MESSAGE_LIMIT = "2";
    try {
      await handleChat(who, { action: "send", text: "oi" });
      await handleChat(who, { action: "send", text: "tudo bem?" });
      await expect(
        handleChat(who, { action: "send", text: "ainda aqui" }),
      ).rejects.toThrow("limite de 2 mensagens por dia");
      await expect(
        handleChat(free, { action: "send", text: "oi" }),
      ).resolves.toBeDefined();
    } finally {
      delete process.env.DAILY_MESSAGE_LIMIT;
    }
  });
});
