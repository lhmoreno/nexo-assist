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

describe("duplicidade", () => {
  const open = (
    id: string,
    title: string,
    description: string,
    category = "Rede e VPN",
    status = "Aberto",
  ) => ({ id, title, description, status, category });
  it("reconhece o mesmo problema com outras palavras", () => {
    const existing = [
      open(
        "INC-1",
        "Notebook lento após atualização do Windows",
        "Notebook lento após atualização do Windows",
        "Hardware",
      ),
      open(
        "INC-2",
        "VPN não conecta (Windows 11)",
        "Problema: Não consigo conectar à VPN no Windows 11.\nJá tentou: Reinstalou o cliente VPN.\nPrazo: entrega hoje.",
      ),
    ];
    expect(
      duplicateOf("A VPN não conecta no Windows 11", existing, "Rede e VPN"),
    ).toBe("INC-2");
    expect(
      duplicateOf("Sem conexão com a VPN desde cedo", existing, "Rede e VPN"),
    ).toBe("INC-2");
    expect(
      duplicateOf(
        "Meu notebook está travando depois da atualização",
        existing,
        "Hardware",
      ),
    ).toBe("INC-1");
  });
  it("não confunde problemas diferentes nem usa chamados encerrados", () => {
    const existing = [
      open(
        "INC-2",
        "VPN não conecta (Windows 11)",
        "Problema: VPN não conecta.",
      ),
      open(
        "INC-3",
        "Senha do SAP bloqueada",
        "Senha do SAP bloqueada",
        "Acesso",
        "Resolvido",
      ),
    ];
    expect(
      duplicateOf("Impressora do andar não imprime", existing, "Hardware"),
    ).toBeNull();
    expect(
      duplicateOf("Wi-Fi do escritório está caindo", existing, "Rede e VPN"),
    ).toBeNull();
    expect(
      duplicateOf("Senha do SAP bloqueada de novo", existing, "Acesso"),
    ).toBeNull();
  });
});
