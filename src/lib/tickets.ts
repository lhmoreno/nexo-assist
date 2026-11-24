import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { ticketOperations, tickets } from "./schema";
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
async function legacy<T>(operation: () => Promise<T>): Promise<T> {
  const delay = Number(process.env.LEGACY_DELAY_MS || 0);
  if (delay > 3000) throw new LegacyUnavailable();
  if (delay) await new Promise((r) => setTimeout(r, delay));
  if (Math.random() < Number(process.env.LEGACY_FAILURE_RATE || 0))
    throw new LegacyUnavailable();
  return operation();
}
type Level = "Crítica" | "Alta" | "Média" | "Baixa";
const byId = (ownerId: string, id: string) =>
  and(eq(tickets.id, id), eq(tickets.ownerId, ownerId));
const withNote = (
  current: { description: string; priority: string },
  note: string,
  now: number,
) => ({
  description: `${current.description}\nAtualização: ${note}`,
  updatedAt: now,
  dueAt: dueAt(new Date(now), current.priority as Level).getTime(),
});
export const ticketService = {
  list: (ownerId: string) =>
    legacy(() => db.select().from(tickets).where(eq(tickets.ownerId, ownerId))),
  get: (ownerId: string, id: string) =>
    legacy(async () => {
      const [t] = await db.select().from(tickets).where(byId(ownerId, id));
      return t ?? null;
    }),
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
    return legacy(() =>
      db.transaction(async (tx) => {
        const one = async (id: string) =>
          (await tx.select().from(tickets).where(eq(tickets.id, id)))[0]!;
        const [prior] = await tx
          .select()
          .from(ticketOperations)
          .where(eq(ticketOperations.key, input.key));
        if (prior) {
          if (prior.ownerId !== input.ownerId)
            throw new TicketError("Operação não autorizada.");
          return {
            ticket: await one(prior.ticketId),
            duplicate: prior.duplicate,
          };
        }
        const existing = await tx
          .select()
          .from(tickets)
          .where(eq(tickets.ownerId, input.ownerId));
        const same = existing.find((t) => t.idempotencyKey === input.key);
        if (same) return { ticket: same, duplicate: false };
        const duplicate = duplicateOf(
          input.title + " " + input.description,
          existing,
          input.category,
        );
        if (duplicate) {
          const current = existing.find((t) => t.id === duplicate)!;
          await tx
            .update(tickets)
            .set(withNote(current, input.description, Date.now()))
            .where(eq(tickets.id, duplicate));
          await tx.insert(ticketOperations).values({
            key: input.key,
            ownerId: input.ownerId,
            ticketId: duplicate,
            duplicate: true,
          });
          return { ticket: await one(duplicate), duplicate: true };
        }
        const priority = priorityFor(input.impact, input.urgency, input.type),
          now = Date.now();
        const id = `${input.type}-${Math.floor(10000 + Math.random() * 89999)}`;
        await tx.insert(tickets).values({
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
        });
        await tx.insert(ticketOperations).values({
          key: input.key,
          ownerId: input.ownerId,
          ticketId: id,
          duplicate: false,
        });
        return { ticket: await one(id), duplicate: false };
      }),
    );
  },
  update: (ownerId: string, id: string, note: string) =>
    legacy(async () => {
      const [current] = await db
        .select()
        .from(tickets)
        .where(byId(ownerId, id));
      if (!current) throw new TicketError("Chamado não encontrado.");
      if (["Resolvido", "Fechado", "Aprovado"].includes(current.status))
        throw new TicketError("Chamado resolvido: solicite reabertura.");
      await db
        .update(tickets)
        .set(withNote(current, note, Date.now()))
        .where(eq(tickets.id, id));
      return (await db.select().from(tickets).where(eq(tickets.id, id)))[0]!;
    }),
  reopen: (ownerId: string, id: string) =>
    legacy(async () => {
      const [current] = await db
        .select()
        .from(tickets)
        .where(byId(ownerId, id));
      if (!current) throw new TicketError("Chamado não encontrado.");
      if (!canReopen(current.resolvedAt))
        throw new TicketError("O prazo de 7 dias para reabertura terminou.");
      const now = Date.now();
      await db
        .update(tickets)
        .set({
          status: "Reaberto",
          resolvedAt: null,
          updatedAt: now,
          dueAt: dueAt(new Date(now), current.priority as Level).getTime(),
        })
        .where(eq(tickets.id, id));
      return (await db.select().from(tickets).where(eq(tickets.id, id)))[0]!;
    }),
  transfer: (ownerId: string, id: string) =>
    legacy(async () => {
      const [current] = await db
        .select()
        .from(tickets)
        .where(byId(ownerId, id));
      if (!current) throw new TicketError("Chamado não encontrado.");
      await db
        .update(tickets)
        .set({ status: "Aguardando analista", updatedAt: Date.now() })
        .where(eq(tickets.id, id));
      return current;
    }),
};
