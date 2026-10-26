import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
process.env.DATABASE_URL = "./data/test-nexo.sqlite";
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
    db.insert(schema.users)
      .values({ id, name: id, email: id + "@nexo.com", role: "employee" })
      .onConflictDoNothing()
      .run();
});
afterAll(() => {
  for (const ext of ["", "-wal", "-shm"])
    try {
      fs.unlinkSync("./data/test-nexo.sqlite" + ext);
    } catch {}
});
describe("fluxos seguros", () => {
  it("não cria antes da confirmação e impede duplicação", async () => {
    const id = randomUUID();
    const first = await handleChat(user, {
      action: "send",
      text: "Abrir chamado: meu notebook está lento após atualização " + id,
    });
    expect(first.conversation.draft).toBeTruthy();
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
    const again = await handleChat(user, { action: "confirm" });
    expect(again.tickets.length).toBe(count);
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
  it("transfere e pausa o agente", async () => {
    const state = await handleChat(other, { action: "transfer" });
    expect(state.conversation.status).toBe("waiting");
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
    expect(conversationState(user).tickets).toBeDefined();
  });
  it("redireciona assunto fora de TI e pede contexto ambíguo", async () => {
    const outside = await handleChat(user, {
      action: "send",
      text: "Preciso falar sobre minhas férias no RH",
    });
    expect(outside.messages.at(-1)?.body).toContain("assuntos de TI");
    const unclear = await handleChat(user, { action: "send", text: "oi" });
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
    db.update(schema.tickets)
      .set({ status: "Resolvido", resolvedAt: Date.now() - 6 * 86400000 })
      .where(eq(schema.tickets.id, t.id))
      .run();
    expect((await ticketService.reopen(user, t.id)).status).toBe("Reaberto");
    db.update(schema.tickets)
      .set({ status: "Resolvido", resolvedAt: Date.now() - 8 * 86400000 })
      .where(eq(schema.tickets.id, t.id))
      .run();
    await expect(ticketService.reopen(user, t.id)).rejects.toThrow("7 dias");
  });
});

describe("limite de sessão", () => {
  it("preserva a 30ª resposta e só inicia outra sessão por ação explícita", async () => {
    const { eq } = await import("drizzle-orm");
    const id = "test-limit";
    db.insert(schema.users)
      .values({ id, name: id, email: id + "@nexo.com", role: "employee" })
      .onConflictDoNothing()
      .run();
    db.insert(schema.articles)
      .values({
        id: "test-vpn",
        title: "VPN erro 809",
        body: "Reinstale o cliente VPN.",
        keywords: "vpn 809 rede",
      })
      .onConflictDoNothing()
      .run();
    const initial = conversationState(id);
    db.update(schema.conversations)
      .set({ messageCount: 29 })
      .where(eq(schema.conversations.id, initial.conversation.id))
      .run();
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
