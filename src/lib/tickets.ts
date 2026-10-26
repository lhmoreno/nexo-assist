import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { tickets } from "./schema";
import {
  canReopen,
  dueAt,
  duplicateOf,
  priorityFor,
  type Impact,
  type Urgency,
} from "./rules";
export class LegacyUnavailable extends Error {
  constructor() {
    super(
      "O serviço de chamados está temporariamente indisponível. Tente novamente.",
    );
  }
}
export class TicketError extends Error {}
async function legacy<T>(operation: () => T): Promise<T> {
  const delay = Number(process.env.LEGACY_DELAY_MS || 0);
  if (delay > 3000) throw new LegacyUnavailable();
  if (delay) await new Promise((r) => setTimeout(r, delay));
  if (Math.random() < Number(process.env.LEGACY_FAILURE_RATE || 0))
    throw new LegacyUnavailable();
  return operation();
}
export const ticketService = {
  list: (ownerId: string) =>
    legacy(() =>
      db.select().from(tickets).where(eq(tickets.ownerId, ownerId)).all(),
    ),
  get: (ownerId: string, id: string) =>
    legacy(
      () =>
        db
          .select()
          .from(tickets)
          .where(and(eq(tickets.id, id), eq(tickets.ownerId, ownerId)))
          .get() ?? null,
    ),
  async create(input: {
    ownerId: string;
    type: "INC" | "REQ";
    title: string;
    description: string;
    category: string;
    impact: Impact;
    urgency: Urgency;
    key: string;
  }) {
    return legacy(() => {
      const existing = db
        .select()
        .from(tickets)
        .where(eq(tickets.ownerId, input.ownerId))
        .all();
      const same = existing.find((t) => t.idempotencyKey === input.key);
      if (same) return { ticket: same, duplicate: false };
      const duplicate = duplicateOf(
        input.title + " " + input.description,
        existing,
      );
      if (duplicate)
        return {
          ticket: existing.find((t) => t.id === duplicate)!,
          duplicate: true,
        };
      const priority = priorityFor(input.impact, input.urgency, input.type),
        now = Date.now();
      const id = `${input.type}-${Math.floor(10000 + Math.random() * 89999)}`;
      db.insert(tickets)
        .values({
          id,
          ownerId: input.ownerId,
          type: input.type,
          title: input.title,
          description: input.description,
          category: input.category,
          impact: input.impact,
          urgency: input.urgency,
          priority,
          status: "Aberto",
          dueAt: dueAt(new Date(now), priority).getTime(),
          createdAt: now,
          updatedAt: now,
          idempotencyKey: input.key,
        })
        .run();
      return {
        ticket: db.select().from(tickets).where(eq(tickets.id, id)).get()!,
        duplicate: false,
      };
    });
  },
  update: (ownerId: string, id: string, note: string) =>
    legacy(() => {
      const current = db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.ownerId, ownerId)))
        .get();
      if (!current) throw new TicketError("Chamado não encontrado.");
      if (["Resolvido", "Fechado", "Aprovado"].includes(current.status))
        throw new TicketError("Chamado resolvido: solicite reabertura.");
      const now = Date.now();
      db.update(tickets)
        .set({
          description: current.description + "\nAtualização: " + note,
          updatedAt: now,
          dueAt: dueAt(
            new Date(now),
            current.priority as "Crítica" | "Alta" | "Média" | "Baixa",
          ).getTime(),
        })
        .where(eq(tickets.id, id))
        .run();
      return db.select().from(tickets).where(eq(tickets.id, id)).get()!;
    }),
  reopen: (ownerId: string, id: string) =>
    legacy(() => {
      const current = db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.ownerId, ownerId)))
        .get();
      if (!current) throw new TicketError("Chamado não encontrado.");
      if (!canReopen(current.resolvedAt))
        throw new TicketError("O prazo de 7 dias para reabertura terminou.");
      const now = Date.now();
      db.update(tickets)
        .set({
          status: "Reaberto",
          resolvedAt: null,
          updatedAt: now,
          dueAt: dueAt(
            new Date(now),
            current.priority as "Crítica" | "Alta" | "Média" | "Baixa",
          ).getTime(),
        })
        .where(eq(tickets.id, id))
        .run();
      return db.select().from(tickets).where(eq(tickets.id, id)).get()!;
    }),
  transfer: (ownerId: string, id: string) =>
    legacy(() => {
      const current = db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.ownerId, ownerId)))
        .get();
      if (!current) throw new TicketError("Chamado não encontrado.");
      db.update(tickets)
        .set({ status: "Aguardando analista", updatedAt: Date.now() })
        .where(eq(tickets.id, id))
        .run();
      return current;
    }),
};
