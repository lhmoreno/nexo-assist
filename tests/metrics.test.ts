import { describe, expect, it } from "vitest";
import { aggregateMetrics } from "../src/lib/metrics";

type Inputs = Parameters<typeof aggregateMetrics>;

describe("métricas do login", () => {
  it("calcula a primeira resposta, resolução sem fila e presença recente", () => {
    const now = 100_000;
    const conversations = [
      { id: "self", status: "closed" },
      { id: "human", status: "closed" },
      { id: "unanswered", status: "agent" },
      { id: "c-demo-seeded", status: "closed" },
    ] as Inputs[0];
    const messages = [
      { id: "s1", conversationId: "self", sender: "employee", createdAt: 1000 },
      { id: "s2", conversationId: "self", sender: "agent", createdAt: 9000 },
      {
        id: "h1",
        conversationId: "human",
        sender: "employee",
        createdAt: 1000,
      },
      {
        id: "h2",
        conversationId: "human",
        sender: "analyst",
        createdAt: 17000,
      },
      {
        id: "u1",
        conversationId: "unanswered",
        sender: "employee",
        createdAt: 5000,
      },
      {
        id: "d1",
        conversationId: "c-demo-seeded",
        sender: "employee",
        createdAt: 1000,
      },
      {
        id: "d2",
        conversationId: "c-demo-seeded",
        sender: "agent",
        createdAt: 999000,
      },
    ] as Inputs[1];
    const presence = [
      { userId: "online", lastSeenAt: now - 10_000 },
      { userId: "offline", lastSeenAt: now - 61_000 },
    ] as Inputs[2];
    expect(aggregateMetrics(conversations, messages, presence, now)).toEqual({
      firstResponseSeconds: 12,
      resolvedWithoutQueuePercent: 50,
      analystsOnline: 1,
    });
  });

  it("não inventa médias quando não há respostas concluídas", () => {
    expect(aggregateMetrics([], [], [], Date.now())).toEqual({
      firstResponseSeconds: null,
      resolvedWithoutQueuePercent: null,
      analystsOnline: 0,
    });
  });
});
