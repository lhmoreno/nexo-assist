import { describe, it, expect } from "vitest";
import {
  addBusinessHours,
  canReopen,
  dueAt,
  duplicateOf,
  isOverdue,
  priorityFor,
} from "../src/lib/rules";
describe("regras do service desk", () => {
  it("prioriza impacto e urgência", () => {
    expect(priorityFor("equipe", "normal", "INC")).toBe("Crítica");
    expect(priorityFor("pessoa", "hoje", "INC")).toBe("Alta");
    expect(priorityFor("pessoa", "normal", "INC")).toBe("Média");
    expect(priorityFor("baixo", "baixa", "REQ")).toBe("Baixa");
  });
  it("calcula SLA útil e plantão crítico", () => {
    const friday = new Date(2026, 9, 23, 17, 0);
    expect(dueAt(friday, "Alta").getDay()).toBe(1);
    expect(dueAt(friday, "Alta").getHours()).toBe(11);
    expect(dueAt(friday, "Crítica").getHours()).toBe(18);
    expect(addBusinessHours(friday, 30).getDay()).toBe(3);
  });
  it("detecta vencimento e prazo de reabertura", () => {
    const now = Date.now();
    expect(isOverdue(now - 1, "Aberto", now)).toBe(true);
    expect(isOverdue(now - 1, "Resolvido", now)).toBe(false);
    expect(canReopen(now - 7 * 86400000, now)).toBe(true);
    expect(canReopen(now - 8 * 86400000, now)).toBe(false);
  });
  it("reconhece chamado duplicado ativo sem bloquear resolvido", () => {
    const rows = [
      {
        id: "1",
        title: "Notebook lento após atualização",
        description: "Windows",
        status: "Aberto",
      },
    ];
    expect(
      duplicateOf("Notebook lento após atualização do Windows", rows),
    ).toBe("1");
    expect(
      duplicateOf("Notebook lento após atualização do Windows", [
        { ...rows[0], status: "Resolvido" },
      ]),
    ).toBe(null);
  });
});
