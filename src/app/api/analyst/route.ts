import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages, tickets, users } from "@/lib/schema";
import { addMessage } from "@/lib/conversation";
const action = z.object({
  conversationId: z.string(),
  action: z.enum(["assume", "reply", "return", "close"]),
  text: z.string().max(2000).optional(),
});
export async function GET(req: Request) {
  try {
    await requireUser("analyst");
    const id = new URL(req.url).searchParams.get("id");
    const list = db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .all()
      .map((c) => ({
        ...c,
        employee:
          db.select().from(users).where(eq(users.id, c.userId)).get()?.name ||
          "Funcionário",
        preview:
          db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, c.id))
            .orderBy(desc(messages.createdAt))
            .get()?.body || "Conversa iniciada",
      }));
    if (!id) return NextResponse.json({ conversations: list });
    const c = list.find((x) => x.id === id);
    if (!c)
      return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    return NextResponse.json({
      conversations: list,
      conversation: c,
      messages: db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, id))
        .orderBy(messages.createdAt)
        .all(),
      tickets: db
        .select()
        .from(tickets)
        .where(eq(tickets.ownerId, c.userId))
        .all(),
    });
  } catch {
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser("analyst"),
      v = action.parse(await req.json());
    const c = db
      .select()
      .from(conversations)
      .where(eq(conversations.id, v.conversationId))
      .get();
    if (!c) throw new Error("Conversa não encontrada.");
    if (v.action === "assume") {
      if (c.status !== "waiting")
        throw new Error("Conversa não está aguardando.");
      db.update(conversations)
        .set({ status: "analyst", analystId: u.id, updatedAt: Date.now() })
        .where(eq(conversations.id, c.id))
        .run();
      addMessage(c.id, "system", `${u.name} assumiu o atendimento.`);
    } else {
      if (c.status !== "analyst" || c.analystId !== u.id)
        throw new Error("Assuma a conversa para continuar.");
      if (v.action === "reply") {
        if (!v.text?.trim()) throw new Error("Resposta vazia.");
        addMessage(c.id, "analyst", v.text.trim());
        db.update(conversations)
          .set({ updatedAt: Date.now() })
          .where(eq(conversations.id, c.id))
          .run();
      } else {
        db.update(conversations)
          .set({
            status: v.action === "return" ? "agent" : "closed",
            analystId: null,
            updatedAt: Date.now(),
          })
          .where(
            and(eq(conversations.id, c.id), eq(conversations.analystId, u.id)),
          )
          .run();
        addMessage(
          c.id,
          "system",
          v.action === "return"
            ? "Atendimento devolvido ao agente."
            : "Atendimento encerrado.",
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro." },
      { status: 400 },
    );
  }
}
