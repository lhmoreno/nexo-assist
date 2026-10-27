import { eq } from "drizzle-orm";
import { db } from "./db";
import { analystPresence, conversations, messages } from "./schema";

type Conversation = typeof conversations.$inferSelect;
type Message = typeof messages.$inferSelect;
type Presence = typeof analystPresence.$inferSelect;

export type ServiceMetrics = {
  firstResponseSeconds: number | null;
  resolvedWithoutQueuePercent: number | null;
  analystsOnline: number;
};

export function aggregateMetrics(
  allConversations: Conversation[],
  allMessages: Message[],
  presence: Presence[],
  now: number,
): ServiceMetrics {
  const byConversation = new Map<string, Message[]>();
  for (const message of allMessages) {
    const list = byConversation.get(message.conversationId) || [];
    list.push(message);
    byConversation.set(message.conversationId, list);
  }

  const responseTimes: number[] = [];
  let finished = 0;
  let finishedWithoutQueue = 0;
  for (const conversation of allConversations) {
    // Seeded transcripts are presentation fixtures, not observed response times.
    if (conversation.id.startsWith("c-demo-")) continue;
    const history = (byConversation.get(conversation.id) || []).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    const firstEmployee = history.find((m) => m.sender === "employee");
    const firstReply = firstEmployee
      ? history.find(
          (m) =>
            (m.sender === "agent" || m.sender === "analyst") &&
            m.createdAt >= firstEmployee.createdAt,
        )
      : undefined;
    if (firstEmployee && firstReply)
      responseTimes.push(
        (firstReply.createdAt - firstEmployee.createdAt) / 1000,
      );

    if (conversation.status === "closed" && firstReply) {
      finished++;
      if (
        !history.some(
          (m) =>
            m.sender === "analyst" ||
            (m.sender === "system" && m.body.includes("assumiu o atendimento")),
        )
      )
        finishedWithoutQueue++;
    }
  }

  return {
    firstResponseSeconds: responseTimes.length
      ? Math.round(
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
        )
      : null,
    resolvedWithoutQueuePercent: finished
      ? Math.round((finishedWithoutQueue / finished) * 100)
      : null,
    analystsOnline: presence.filter((p) => p.lastSeenAt >= now - 60_000).length,
  };
}

export function getServiceMetrics(now = Date.now()): ServiceMetrics {
  return aggregateMetrics(
    db.select().from(conversations).all(),
    db.select().from(messages).all(),
    db.select().from(analystPresence).all(),
    now,
  );
}

export function touchAnalyst(userId: string) {
  db.insert(analystPresence)
    .values({ userId, lastSeenAt: Date.now() })
    .onConflictDoUpdate({
      target: analystPresence.userId,
      set: { lastSeenAt: Date.now() },
    })
    .run();
}

export function clearAnalystPresence(userId: string) {
  db.delete(analystPresence).where(eq(analystPresence.userId, userId)).run();
}
