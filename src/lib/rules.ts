export type Priority = "Crítica" | "Alta" | "Média" | "Baixa";
export type Impact = "empresa" | "equipe" | "pessoa" | "baixo";
export type Urgency = "imediata" | "hoje" | "normal" | "baixa";
export function priorityFor(
  impact: Impact,
  urgency: Urgency,
  type: "INC" | "REQ",
): Priority {
  if (impact === "empresa" || impact === "equipe") return "Crítica";
  if (urgency === "imediata" || urgency === "hoje") return "Alta";
  if (type === "REQ" && urgency === "baixa") return "Baixa";
  return "Média";
}
export function addBusinessHours(date: Date, hours: number): Date {
  const d = new Date(date);
  let remaining = hours * 60;
  while (remaining > 0) {
    d.setMinutes(d.getMinutes() + 1);
    const day = d.getDay(),
      hour = d.getHours();
    if (day !== 0 && day !== 6 && hour >= 8 && hour < 18) remaining--;
  }
  return d;
}
export function dueAt(start: Date, priority: Priority): Date {
  if (priority === "Crítica") return new Date(start.getTime() + 3600000);
  return addBusinessHours(
    start,
    priority === "Alta" ? 4 : priority === "Média" ? 30 : 50,
  );
}
export function isOverdue(
  due: number,
  status: string,
  now = Date.now(),
): boolean {
  return !["Resolvido", "Fechado", "Aprovado"].includes(status) && due < now;
}
export function canReopen(
  resolvedAt: number | null,
  now = Date.now(),
): boolean {
  return (
    resolvedAt !== null && now - resolvedAt <= 7 * 86400000 && now >= resolvedAt
  );
}
const stop = new Set([
  "de",
  "da",
  "do",
  "para",
  "com",
  "um",
  "uma",
  "no",
  "na",
  "o",
  "a",
  "e",
  "meu",
  "minha",
  "está",
  "não",
]);
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((x) => x.length > 2 && !stop.has(x))
    .sort()
    .join(" ");
}
const generic = new Set([
  "nao",
  "esta",
  "estao",
  "problema",
  "erro",
  "chamado",
  "tenho",
  "quero",
  "preciso",
  "ajuda",
  "hoje",
  "mais",
  "muito",
  "como",
  "que",
  "por",
  "pra",
  "aqui",
  "ainda",
  "depois",
  "apos",
  "quando",
  "esse",
  "essa",
  "meu",
  "minha",
  "fazer",
  "abrir",
  "para",
  "com",
  "uma",
  "dos",
  "das",
  "nos",
  "nas",
]);
const synonyms: [RegExp, string][] = [
  [/^conex\w*|^conect\w*|^acess\w*|^logar$|^login$/, "conect"],
  [/^lentid\w*|^lent\w*|^devagar$|^trav\w*|^congel\w*/, "lento"],
  [/^wifi$|^wireless$|^internet$/, "rede"],
  [/^e?mail$|^outlook$|^correio$/, "email"],
  [/^notebook$|^laptop$|^computador$|^pc$|^maquina$/, "notebook"],
  [/^senha\w*|^password$|^bloquead\w*|^bloqueio$/, "senha"],
];
/** Radicais do problema, sem rótulos, ruído nem palavras genéricas. */
function stems(text: string): Set<string> {
  const core = text
    .replace(
      /\n?(Já tentou|Sistema operacional|Prazo|Afetados|Atualização):[\s\S]*$/,
      "",
    )
    .replace(/Problema:/g, " ");
  const out = new Set<string>();
  for (const w of core
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)) {
    if (w.length < 3 || generic.has(w) || stop.has(w)) continue;
    const canon = synonyms.find(([re]) => re.test(w))?.[1] ?? w;
    out.add(canon.length > 5 ? canon.slice(0, 5) : canon);
  }
  return out;
}
export function duplicateOf(
  candidate: string,
  existing: {
    id: string;
    title: string;
    description: string;
    status: string;
    category?: string;
  }[],
  category?: string,
): string | null {
  const a = stems(candidate);
  if (!a.size) return null;
  let best: { id: string; score: number } | null = null;
  for (const t of existing) {
    if (["Resolvido", "Fechado", "Aprovado"].includes(t.status)) continue;
    const b = stems(t.title + " " + t.description);
    const common = [...a].filter((x) => b.has(x)).length;
    const score = common / Math.min(a.size, b.size || 1);
    const sameCategory = !!category && t.category === category;
    // Mesmo assunto: muita sobreposição, ou sobreposição mínima na mesma categoria.
    const dup = score >= 0.6 || (sameCategory && common >= 2 && score >= 0.4);
    if (dup && (!best || score > best.score)) best = { id: t.id, score };
  }
  return best?.id ?? null;
}
