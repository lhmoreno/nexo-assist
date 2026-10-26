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
export function duplicateOf(
  candidate: string,
  existing: {
    id: string;
    title: string;
    description: string;
    status: string;
  }[],
): string | null {
  const a = new Set(normalize(candidate).split(" ").filter(Boolean));
  if (!a.size) return null;
  for (const t of existing) {
    if (["Resolvido", "Fechado", "Aprovado"].includes(t.status)) continue;
    const b = new Set(normalize(t.title + " " + t.description).split(" "));
    const common = [...a].filter((x) => b.has(x)).length;
    if (common / a.size >= 0.65) return t.id;
  }
  return null;
}
