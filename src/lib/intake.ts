import type { Impact, Urgency } from "./rules";

export const impactLabel: Record<Impact, string> = {
  empresa: "Toda a empresa",
  equipe: "Equipe",
  pessoa: "Só a própria pessoa",
  baixo: "Sem impacto relevante",
};
export const urgencyLabel: Record<Urgency, string> = {
  imediata: "Imediata (trabalho parado)",
  hoje: "Hoje",
  normal: "Normal",
  baixa: "Baixa",
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Título curto: sem prefixo de pedido, com inicial maiúscula. */
export function cleanTitle(raw: string, max = 70): string {
  let t = raw
    .replace(
      /^\s*(?:oi|olá|ola)[,!. ]*|^\s*(?:quero|preciso|gostaria de|queria)\s+(?:de\s+)?(?:abrir|criar)\s+(?:um\s+)?chamado(?:\s+de\s+ti)?\s*[:\-–]?\s*/gi,
      "",
    )
    .replace(/^\s*(?:abrir|criar)\s+chamado(?:\s+de\s+ti)?\s*[:\-–]?\s*/i, "")
    .replace(/^[\s:,\-–]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  t = cap(t.replace(/[.!\s]+$/, ""));
  if (t.length > max) {
    const cut = t.slice(0, max - 1);
    t =
      cut.slice(0, cut.lastIndexOf(" ") > 30 ? cut.lastIndexOf(" ") : max - 1) +
      "…";
  }
  return t;
}

export type IntakeFields = {
  problem: string;
  tried: string[];
  os?: string | null;
  deadline?: string | null;
  impact?: Impact | null;
  urgency?: Urgency | null;
};

/** Descrição estruturada, para o analista não precisar perguntar de novo. */
export function buildDescription(f: IntakeFields): string {
  const lines = [`Problema: ${cap(f.problem.trim().replace(/[.\s]+$/, ""))}.`];
  lines.push(
    f.tried.length
      ? `Já tentou: ${f.tried.map((x) => x.trim().replace(/[.\s]+$/, "")).join("; ")}.`
      : "Já tentou: nada informado.",
  );
  lines.push(`Sistema operacional: ${f.os?.trim() || "não informado"}.`);
  lines.push(`Prazo: ${f.deadline?.trim() || "sem compromisso informado"}.`);
  if (f.impact) lines.push(`Afetados: ${impactLabel[f.impact]}.`);
  return lines.join("\n");
}

export function formatDue(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export const typeLabel = { INC: "Incidente (INC)", REQ: "Requisição (REQ)" };
