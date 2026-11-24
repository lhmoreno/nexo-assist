"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Headphones,
  LogOut,
  MessageCircle,
  Send,
  UserRound,
  Search,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
type User = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "analyst";
};
type TicketData = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: number;
  category: string;
  description: string;
};
type Conversation = {
  id: string;
  status: "agent" | "waiting" | "analyst" | "closed";
  messageCount: number;
  draft: string | null;
  employee?: string;
  userId: string;
  analystId: string | null;
  updatedAt: number;
};
type Msg = {
  id: string;
  sender: "employee" | "agent" | "analyst" | "system";
  body: string;
  trace: string | null;
  createdAt: number;
};
type ChatState = {
  conversation: Conversation;
  messages: Msg[];
  tickets: TicketData[];
  demo?: boolean;
};
async function api<T>(url: string, method = "GET", body?: object): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Falha na requisição.");
  return j;
}
function NexoMark({
  light = false,
  size = 24,
}: {
  light?: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      aria-hidden="true"
      className={light ? "text-white" : "text-[#037AF6]"}
    >
      <path
        transform="translate(1.5 3.5)"
        d="M21.763 0.24493l-3.374 1.687c-0.623 0.308-0.973 0.903-0.973 1.631l0 6.293-11.193-9.429c-0.623-0.469-1.372-0.553-2.03-0.245l-3.185 1.631c-0.651 0.322-1.008 0.924-1.008 1.673l0 15.218c0 1.477 1.526 2.289 2.716 1.785l3.073-1.617c0.693-0.322 1.057-0.952 1.057-1.722l0-7.7 11.732 10.591c0.602 0.546 1.421 0.679 2.086 0.364l2.786-1.505c0.602-0.315 0.938-0.931 0.938-1.68l0-15.288c0-1.463-1.505-2.275-2.625-1.687z"
        fill="currentColor"
      />
    </svg>
  );
}
function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 text-[17px] font-bold ${dark ? "text-white" : "text-[#1B2431]"}`}
    >
      <NexoMark light={dark} />
      <span>Nexo Assist</span>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("ana.paula@nexo.com"),
    [password, setPassword] = useState("demo"),
    [remember, setRemember] = useState(true),
    [showPassword, setShowPassword] = useState(false),
    [dialog, setDialog] = useState<"privacy" | "password" | null>(null),
    [metrics, setMetrics] = useState<{
      firstResponseSeconds: number | null;
      resolvedWithoutQueuePercent: number | null;
      analystsOnline: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const loadMetrics = async () => {
      try {
        const next = await api<NonNullable<typeof metrics>>("/api/metrics");
        if (active) setMetrics(next);
      } catch {
        if (active) setMetrics(null);
      }
    };
    void loadMetrics();
    const timer = setInterval(loadMetrics, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const firstResponse =
    metrics?.firstResponseSeconds == null
      ? "—"
      : metrics.firstResponseSeconds === 0
        ? "<1 s"
        : metrics.firstResponseSeconds < 60
          ? `${metrics.firstResponseSeconds} s`
          : `${Math.round(metrics.firstResponseSeconds / 60)} min`;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ user: User }>("/api/auth", "POST", {
        email,
        password,
        remember,
      });
      onLogin(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,800fr)_minmax(0,640fr)]">
      <section className="flex min-h-[620px] flex-col justify-between bg-[#1B2431] px-8 py-10 text-white lg:min-h-screen lg:px-16 lg:pb-12">
        <Logo dark />
        <div className="w-full max-w-[650px]">
          <div className="text-[13.5px] font-medium text-white/55">
            Service desk de TI da Nexo
          </div>
          <h1 className="font-display mt-5 max-w-[640px] text-[48px] leading-[1.04] tracking-[-.025em] md:text-[54px]">
            Seu problema de TI, resolvido em uma conversa.
          </h1>
          <p className="mt-5 max-w-[520px] text-[16px] leading-[1.55] text-white/65">
            Descreva o que está acontecendo. O assistente consulta seus
            chamados, busca na central de ajuda e chama um analista quando
            precisa.
          </p>
          <div className="ml-0 mt-9 max-w-[500px] rounded-[14px] border border-white/15 bg-white/[.04] p-[18px] lg:ml-24">
            <div className="ml-auto max-w-[355px] rounded-[8px] bg-white px-3 py-2 text-[13px] text-[#1B2431]">
              Meu notebook não conecta na VPN. Erro 809.
            </div>
            <div className="mt-3 text-[12px] font-semibold text-white/80">
              Nexo Assist{" "}
              <span className="ml-2 font-normal text-white/45">
                consultou seus chamados · criou um chamado
              </span>
            </div>
            <div className="mt-1 rounded-[8px] bg-white/10 p-3 text-[13px] leading-5 text-white">
              Pronto: abri o chamado com prioridade alta. Um analista fala com
              você em até 4 h úteis.
            </div>
            <div className="mt-2 inline-flex items-center gap-2 rounded-[8px] bg-white px-3 py-2 text-[12px] text-[#3D4656]">
              <span className="size-[7px] rounded-full bg-[#00BD6C]" />
              <strong className="text-[#1B2431]">INC-20517</strong>
              Rede e VPN · Alta · em até 4 h
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
          <div>
            <strong className="font-display block text-[32px] leading-none">
              {firstResponse}
            </strong>
            <span className="mt-1 block text-[13.5px] text-white/55">
              primeira resposta, em média
            </span>
          </div>
          <div className="border-l border-white/15 pl-5">
            <strong className="font-display block text-[32px] leading-none">
              {metrics?.resolvedWithoutQueuePercent == null
                ? "—"
                : `${metrics.resolvedWithoutQueuePercent}%`}
            </strong>
            <span className="mt-1 block text-[13.5px] text-white/55">
              resolvidos sem fila
            </span>
          </div>
          <div className="border-l border-white/15 pl-5">
            <strong className="font-display flex items-center gap-2 text-[32px] leading-none">
              {metrics?.analystsOnline ?? "—"}
              <span className="size-2 rounded-full bg-[#00BD6C]" />
            </strong>
            <span className="mt-1 block text-[13.5px] text-white/55">
              analistas online agora
            </span>
          </div>
        </div>
      </section>
      <section className="flex min-h-[620px] flex-col justify-between px-8 py-10 lg:min-h-screen lg:px-14">
        <div className="self-end text-right text-[13px] text-[#5B6472]">
          Problema para entrar?
          <br />
          <a href="tel:4000" className="font-semibold text-[#0069C7]">
            Ligue no ramal 4000
          </a>
        </div>
        <form onSubmit={submit} className="mx-auto w-full max-w-[380px]">
          <h2 className="font-display text-[40px] leading-none">Entrar</h2>
          <p className="mt-2 text-[15px] text-[#5B6472]">
            Use seu e-mail corporativo e a senha da rede Nexo.
          </p>
          <div className="mt-7 space-y-[18px]">
            <label className="block text-[13.5px] font-medium">
              E-mail corporativo
              <span className="relative mt-2 block">
                <Mail
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-3.5 text-[#5B6472]"
                />
                <input
                  autoComplete="username"
                  className="h-11 w-full rounded-[8px] border border-[#E6E8EC] pl-10 pr-3 text-[14.5px]"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </span>
            </label>
            <div className="text-[13.5px] font-medium">
              <div className="flex items-center justify-between">
                <label htmlFor="nexo-password">Senha</label>
                <button
                  type="button"
                  className="text-[#0062C4]"
                  onClick={() => setDialog("password")}
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative mt-2">
                <LockKeyhole
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-3.5 text-[#0062C4]"
                />
                <input
                  id="nexo-password"
                  autoComplete="current-password"
                  className="h-11 w-full rounded-[8px] border border-[#E6E8EC] pl-10 pr-11 text-[14.5px]"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-2 flex size-[30px] items-center justify-center rounded-md text-[#5B6472] hover:bg-[#F6F7F9]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-[#3D4656]">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />{" "}
              Manter conectado neste computador
            </label>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-[#C4161D]">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="mt-7 h-11 w-full rounded-[10px] bg-[#0062C4] text-[15.5px] hover:bg-[#0071D6]"
            disabled={busy}
          >
            {busy ? "Entrando..." : "Entrar"} <ArrowRight size={16} />
          </Button>
          <div className="mt-5 border-t border-[#E6E8EC] pt-4" />
        </form>
        <div className="flex justify-between gap-2 text-[12px] text-[#5B6472]">
          <span>© 2026 Nexo · Service desk de TI</span>
          <button
            type="button"
            onClick={() => setDialog("privacy")}
            className="hover:text-[#0062C4] hover:underline"
          >
            Privacidade e uso de dados
          </button>
        </div>
      </section>
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2431]/55 p-5"
          onClick={() => setDialog(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog === "privacy"
                ? "Privacidade e uso de dados"
                : "Ajuda com a senha"
            }
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[460px] rounded-[14px] bg-white p-6 text-[#1B2431] shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-[28px]">
                {dialog === "privacy"
                  ? "Privacidade e uso de dados"
                  : "Ajuda com a senha"}
              </h2>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setDialog(null)}
              >
                <X size={20} />
              </button>
            </div>
            {dialog === "privacy" ? (
              <div className="mt-4 space-y-3 text-[14px] leading-6 text-[#3D4656]">
                <p>
                  Esta demonstração guarda usuários, conversas e chamados em
                  SQLite local. Cada funcionário só pode consultar e alterar
                  seus próprios chamados.
                </p>
                <p>
                  A sessão usa um cookie protegido contra leitura por
                  JavaScript. Ao sair, a sessão é revogada. Quando configurado,
                  o modelo de IA recebe a mensagem e o contexto recente
                  necessários para responder; a chave fica somente no servidor.
                </p>
              </div>
            ) : (
              <p className="mt-4 text-[14px] leading-6 text-[#3D4656]">
                Neste ambiente de demonstração, os usuários de exemplo entram
                com qualquer senha não vazia. Não há redefinição de senha; em
                produção, a autenticação seria feita pelo provedor corporativo.
              </p>
            )}
            <Button
              type="button"
              className="mt-6"
              onClick={() => setDialog(null)}
            >
              Entendi
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
function Trace({ raw }: { raw: string | null }) {
  if (!raw) return null;
  let t: Record<string, unknown>;
  try {
    t = JSON.parse(raw);
  } catch {
    return null;
  }
  const intents: Record<string, string> = {
    knowledge: "Dúvida (central de ajuda)",
    list: "Consulta de chamados",
    create: "Abertura de chamado",
    update: "Atualização de chamado",
    reopen: "Reabertura de chamado",
    transfer: "Transferência para analista",
    outside: "Fora do escopo de TI",
    unclear: "Não entendido",
    clarify: "Pergunta de esclarecimento",
    cancel: "Cancelamento",
    denied: "Consulta negada (outro proprietário)",
    error: "Erro",
  };
  const cond = (label: string, v: string) => (v ? [[label, v]] : []);
  const rows = [
    ["Intenção", intents[String(t.intent)] || t.intent || "Não informada"],
    ...cond(
      "Tipo e categoria",
      [t.type, t.category].filter(Boolean).join(" · "),
    ),
    ...cond(
      "Impacto e urgência",
      [t.impact, t.urgency].filter(Boolean).join(" · "),
    ),
    ...cond("Prioridade", String(t.priority || "")),
    [
      "Confiança",
      typeof t.confidence === "number"
        ? `${Math.round(t.confidence * 100)}%`
        : "Não informada",
    ],
    ["Ferramentas", ((t.tools as string[]) || []).join(", ") || "Nenhuma"],
    ["Resultados", ((t.results as string[]) || []).join("; ") || "Nenhum"],
    ["Regras", ((t.rules as string[]) || []).join("; ") || "Nenhuma"],
    ["Justificativa", t.reason || "Sem justificativa registrada"],
    [
      "Tempo",
      typeof t.executionMs === "number"
        ? `${t.executionMs} ms`
        : "Não informado",
    ],
    ["Erros", ((t.errors as string[]) || []).join("; ") || "Nenhum"],
  ];
  const toolNames: Record<string, string> = {
    "ticketService.list": "consultou seus chamados",
    listTickets: "consultou seus chamados",
    searchKnowledge: "buscou na central de ajuda",
    "ticketService.get": "consultou o chamado",
    ticketService: "executou no serviço de chamados",
  };
  const actions = ((t.tools as string[]) || []).map((x) => toolNames[x] || x);
  if (t.priority && t.intent === "create")
    actions.push("classificou a prioridade");
  if (t.draft) actions.push("montou o rascunho");
  if (actions.length === 0) actions.push("classificou a solicitação");
  return (
    <details className="mb-2 max-w-[600px] text-[12.5px] text-[#5B6472]">
      <summary className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md py-1">
        <span className="font-semibold text-[#1B2431]">Nexo Assist</span>
        {actions.slice(0, 3).map((x, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <Check size={12} />
            {x}
          </span>
        ))}
        <span className="ml-1 inline-flex items-center gap-1 text-[#0069C7]">
          Detalhes <ChevronDown size={12} />
        </span>
      </summary>
      <dl className="mt-2 grid gap-2 rounded-[10px] border border-[#E6E8EC] bg-white p-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={String(k)}>
            <dt className="font-semibold">{String(k)}</dt>
            <dd className="mt-0.5 break-words">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
function TicketCard({
  ticket,
  onClick,
}: {
  ticket: TicketData;
  onClick?: () => void;
}) {
  const [now] = useState(() => Date.now());
  const overdue =
    ticket.dueAt < now &&
    !["Resolvido", "Fechado", "Aprovado"].includes(ticket.status);
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-blue-400 disabled:cursor-default"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-blue-600">{ticket.id}</span>
        <span
          className={
            "rounded px-2 py-0.5 text-[11px] " +
            (overdue ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")
          }
        >
          {overdue ? "Vencido" : ticket.status}
        </span>
      </div>
      <div className="mt-1 text-sm font-medium text-slate-800">
        {ticket.title}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{ticket.category}</span>
        <span>{ticket.priority}</span>
      </div>
    </button>
  );
}
function traceOf(raw: string | null): Record<string, unknown> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function TicketSelector({
  tickets,
  onSelect,
}: {
  tickets: TicketData[];
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="mt-2 max-w-[600px] overflow-hidden rounded-[14px] border border-[#E6E8EC] bg-white shadow-[0_2px_8px_#1B243108]">
      {tickets.map((t) => (
        <button
          key={t.id}
          disabled={!onSelect}
          onClick={() => onSelect?.(t.id)}
          className="flex min-h-[46px] w-full items-center gap-3 border-b border-[#E6E8EC] px-4 text-left last:border-0 hover:bg-[#0062C40A]"
        >
          <span className="size-4 shrink-0 rounded-full border border-[#C7CDD5]" />
          <span className="w-[80px] shrink-0 text-[12.5px] font-medium text-[#5B6472]">
            {t.id}
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
            {t.title}
          </span>
          <span className="hidden items-center gap-1.5 text-[12px] text-[#5B6472] sm:inline-flex">
            <span
              className={`size-1.5 rounded-full ${t.status === "Aprovado" || t.status === "Resolvido" ? "bg-[#00BD6C]" : t.status === "Aguardando analista" ? "bg-[#F5A500]" : "bg-[#0285F7]"}`}
            />
            {t.status}
          </span>
          <span className="hidden w-[60px] shrink-0 whitespace-nowrap text-right text-[12px] text-[#5B6472] md:block">
            {new Date(t.dueAt)
              .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
              .replace(" de ", " ")}
          </span>
        </button>
      ))}
    </div>
  );
}
function TicketDetail({
  ticket,
  onTransfer,
  onAddInfo,
}: {
  ticket: TicketData;
  onTransfer?: () => void;
  onAddInfo?: () => void;
}) {
  const [now] = useState(() => Date.now());
  const overdue =
    ticket.dueAt < now &&
    !["Resolvido", "Fechado", "Aprovado"].includes(ticket.status);
  return (
    <div className="mt-2 max-w-[600px] overflow-hidden rounded-[14px] border border-[#E6E8EC] bg-white shadow-[0_2px_8px_#1B243108]">
      <div className="px-[18px] pt-4 pb-3">
        <div className="flex items-center justify-between gap-2 text-[12.5px] text-[#5B6472]">
          <span>Chamado · {ticket.id}</span>
          <span className={overdue ? "font-medium text-[#946300]" : ""}>
            {overdue ? "● Prazo vencido" : ticket.status}
          </span>
        </div>
        <h3 className="mt-2 text-[18px] font-semibold leading-6">
          {ticket.title}
        </h3>
        <p className="mt-1 whitespace-pre-line text-[13.5px] leading-5 text-[#3D4656]">
          {ticket.description}
        </p>
      </div>
      <div className="mx-[18px] grid grid-cols-2 gap-3 border-t border-[#E6E8EC] py-3 text-[13px] sm:grid-cols-4">
        <div>
          <span className="block text-[#8E8E8E]">Categoria</span>
          {ticket.category}
        </div>
        <div>
          <span className="block text-[#8E8E8E]">Prioridade</span>
          {ticket.priority}
        </div>
        <div>
          <span className="block text-[#8E8E8E]">Status</span>
          {ticket.status}
        </div>
        <div>
          <span className="block text-[#8E8E8E]">Prazo</span>
          {new Date(ticket.dueAt).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </div>
      </div>
      {(onTransfer || onAddInfo) && (
        <div className="flex flex-wrap gap-2 border-t border-[#E6E8EC] bg-[#F6F7F9] px-[18px] py-2">
          {onTransfer && (
            <Button variant="outline" size="sm" onClick={onTransfer}>
              Falar com um analista
            </Button>
          )}
          {onAddInfo && (
            <Button variant="outline" size="sm" onClick={onAddInfo}>
              Adicionar informação
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
type DraftView = {
  action: "create" | "update" | "reopen";
  type?: "INC" | "REQ";
  title?: string;
  description?: string;
  category?: string;
  impact?: string;
  urgency?: string;
  ticketId?: string;
};
const impactText: Record<string, string> = {
  empresa: "Toda a empresa",
  equipe: "Equipe",
  pessoa: "Só você",
  baixo: "Sem impacto relevante",
};
function DraftCard({
  draft,
  priority,
  due,
  active,
  onConfirm,
  onCancel,
}: {
  draft: DraftView;
  priority: unknown;
  due?: number;
  active: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 max-w-[600px] overflow-hidden rounded-[14px] border border-[#E6E8EC] bg-white shadow-[0_2px_8px_#1B243108]">
      <div className="px-[18px] pt-4 pb-3">
        <div className="text-[12.5px] text-[#5B6472]">
          {draft.action === "create"
            ? "Novo chamado"
            : draft.action === "update"
              ? "Atualização de chamado"
              : "Reabertura de chamado"}{" "}
          · Rascunho{" "}
          <span className="float-right text-[#946300]">
            ● {active ? "Aguardando confirmação" : "Concluído ou cancelado"}
          </span>
        </div>
        <h3 className="mt-2 text-[18px] font-semibold leading-6">
          {draft.title || draft.ticketId}
        </h3>
        <p className="mt-1 whitespace-pre-line text-[13.5px] leading-5 text-[#3D4656]">
          {draft.description}
        </p>
      </div>
      {draft.action === "create" && (
        <div className="mx-[18px] grid grid-cols-2 gap-3 border-t border-[#E6E8EC] py-3 text-[13px] sm:grid-cols-5">
          <div>
            <span className="block text-[#8E8E8E]">Tipo</span>
            {draft.type === "REQ" ? "Requisição (REQ)" : "Incidente (INC)"}
          </div>
          <div>
            <span className="block text-[#8E8E8E]">Categoria</span>
            {draft.category}
          </div>
          <div>
            <span className="block text-[#8E8E8E]">Prioridade</span>
            {String(priority || "—")}
          </div>
          <div>
            <span className="block text-[#8E8E8E]">Prazo</span>
            {due
              ? new Date(due).toLocaleString("pt-BR", {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </div>
          <div>
            <span className="block text-[#8E8E8E]">Afetados</span>
            {impactText[draft.impact || ""] || draft.impact}
          </div>
        </div>
      )}
      {active && (
        <div className="flex gap-2 border-t border-[#E6E8EC] bg-[#F6F7F9] px-2 py-2">
          <Button size="sm" onClick={onConfirm}>
            Confirmar <Check size={13} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <span className="ml-auto self-center pr-2 text-[11px] text-[#5B6472]">
            Nenhuma alteração sem confirmar
          </span>
        </div>
      )}
    </div>
  );
}
function Message({ m, analyst = false }: { m: Msg; analyst?: boolean }) {
  const own = m.sender === "employee";
  if (m.sender === "system" && traceOf(m.trace).kind === "handoff") {
    const [title, ...lines] = m.body.split("\n");
    return (
      <div className="max-w-[600px] rounded-[10px] border border-[#F5A500] bg-[#FFF8E8] px-4 py-3 text-[13px] leading-5 text-[#1B2431]">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-[#946300]">
          <Headphones size={14} /> {title}
          <span className="ml-auto text-[11px] font-normal">
            visível só para analistas
          </span>
        </div>
        {lines.map((l) => {
          const [k, ...v] = l.split(": ");
          return (
            <div key={l}>
              <strong>{k}:</strong> {v.join(": ")}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div
      className={"flex " + (own && !analyst ? "justify-end" : "justify-start")}
    >
      <div
        className={"min-w-0 max-w-[600px] " + (own && !analyst ? "" : "w-full")}
      >
        {(m.sender !== "agent" || analyst) && (
          <div
            className={
              "mb-1 text-[12px] text-[#5B6472] " +
              (own && !analyst ? "text-right" : "")
            }
          >
            {m.sender === "employee"
              ? "Você"
              : m.sender === "agent"
                ? "Nexo Assist"
                : m.sender === "analyst"
                  ? "Analista"
                  : "Sistema"}{" "}
            ·{" "}
            {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
        {m.sender === "agent" && <Trace raw={m.trace} />}
        <div
          className={
            "whitespace-pre-line rounded-[10px] px-4 py-3 text-[14.5px] leading-[1.5] " +
            (own && !analyst
              ? "bg-[#1B2431] text-white"
              : m.sender === "system"
                ? "bg-[#EDEDED] text-[#5B6472]"
                : analyst && m.sender === "agent"
                  ? "bg-[#E6EFFA] text-[#1B2431]"
                  : analyst && m.sender === "analyst"
                    ? "bg-[#E3F4EA] text-[#1B2431]"
                    : "border border-[#E6E8EC] bg-white text-[#1B2431]")
          }
        >
          {m.body}
        </div>
      </div>
    </div>
  );
}
function Shell({
  user,
  onLogout,
  view,
  onView,
  children,
}: {
  user: User;
  onLogout: () => void;
  view: "chat" | "profile";
  onView: (view: "chat" | "profile") => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="hidden h-screen w-[232px] shrink-0 flex-col border-r border-[#E6E8EC] bg-white px-[14px] pb-[14px] pt-5 md:flex">
        <Logo />
        <div className="mt-[38px] space-y-[2px]">
          <button
            onClick={() => onView("chat")}
            className={`flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] ${view === "chat" ? "bg-[#0285F712] font-medium text-[#0069C7]" : "text-[#3D4656] hover:bg-[#F6F7F9]"}`}
          >
            <MessageCircle size={16} /> Atendimento
          </button>
          <button
            onClick={() => onView("profile")}
            className={`flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] ${view === "profile" ? "bg-[#0285F712] font-medium text-[#0069C7]" : "text-[#3D4656] hover:bg-[#F6F7F9]"}`}
          >
            <UserRound size={16} /> Meu perfil
          </button>
        </div>
        <div className="mt-auto border-t border-[#E6E8EC] pt-3">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#0285F712] text-[12px] font-semibold text-[#0069C7]">
              {user.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">
                {user.name}
              </div>
              <div className="truncate text-[11px] text-[#5B6472]">
                {user.email}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="mt-3 flex h-[34px] items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] text-[#3D4656] hover:bg-[#F6F7F9]"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
function Profile({ user }: { user: User }) {
  return (
    <div className="h-screen bg-white">
      <header className="flex h-16 items-center border-b border-[#E6E8EC] px-8 text-[13px] text-[#5B6472]">
        Service desk de TI <span className="px-2">›</span>
        <strong className="font-medium text-[#1B2431]">Meu perfil</strong>
      </header>
      <div className="mx-auto max-w-[600px] px-5 pt-16">
        <h1 className="font-display text-[36px]">Meu perfil</h1>
        <p className="mt-1 text-[14px] text-[#5B6472]">
          Seus dados de acesso ao service desk de TI.
        </p>
        <div className="mt-8 overflow-hidden rounded-[14px] border border-[#E6E8EC]">
          <div className="grid grid-cols-[140px_1fr] border-b border-[#E6E8EC] p-4 text-[14px]">
            <span className="text-[#5B6472]">Nome</span>
            {user.name}
          </div>
          <div className="grid grid-cols-[140px_1fr] p-4 text-[14px]">
            <span className="text-[#5B6472]">E-mail corporativo</span>
            <span className="truncate">{user.email}</span>
          </div>
        </div>
        <p className="mt-6 rounded-[14px] bg-[#F6F7F9] p-4 text-[13px] text-[#5B6472]">
          Ambiente de demonstração: qualquer senha não vazia é aceita para os
          usuários cadastrados.
        </p>
      </div>
    </div>
  );
}
function Employee({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [state, setState] = useState<ChatState | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [view, setView] = useState<"chat" | "profile">("chat");
  const bottom = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      setState(await api<ChatState>("/api/chat"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const start = setTimeout(load, 0),
      i = setInterval(load, 4000);
    return () => {
      clearTimeout(start);
      clearInterval(i);
    };
  }, [load]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.messages.length]);
  async function act(
    action: "send" | "confirm" | "cancel" | "select" | "transfer" | "new",
    ticketId?: string,
    quick?: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<ChatState>("/api/chat", "POST", {
        action,
        text: quick || text,
        ticketId,
      });
      setState(next);
      if (action === "send") setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const c = state?.conversation;
  const currentDraft =
    c?.draft && c.draft !== "__processing__" ? c.draft : null;
  return (
    <Shell user={user} onLogout={onLogout} view={view} onView={setView}>
      {view === "profile" ? (
        <Profile user={user} />
      ) : (
        <div className="flex h-screen flex-col bg-white">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E6E8EC] px-5 md:px-8">
            <div className="text-[13px] text-[#5B6472]">
              Service desk de TI <span className="px-2">›</span>
              <strong className="font-medium text-[#1B2431]">
                Atendimento
              </strong>
            </div>
            <div className="flex items-center gap-3">
              {state?.demo && (
                <span
                  className="rounded-md bg-[#F5A50018] px-2 py-1 text-[11px] text-[#946300]"
                  title="Classificação determinística. Configure OPENAI_API_KEY para usar Mastra com OpenAI."
                >
                  Modo demo · sem LLM
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] ${c?.status === "agent" ? "bg-[#00BD6C14] text-[#00804A]" : "bg-[#F5A50018] text-[#946300]"}`}
              >
                <span
                  className={`size-[7px] rounded-full ${c?.status === "agent" ? "bg-[#00BD6C]" : "bg-[#F5A500]"}`}
                />
                {c?.status === "agent"
                  ? "Assistente online"
                  : c?.status === "waiting"
                    ? "Aguardando analista"
                    : "Analista atendendo"}
              </span>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-4 pt-7 lg:px-[clamp(24px,14vw,200px)]">
              {!state && (
                <p className="text-[14px] text-[#5B6472]">
                  Carregando conversa...
                </p>
              )}
              {state?.messages.length === 0 && (
                <div className="mx-auto max-w-[600px] pt-16">
                  <div className="font-display text-[32px]">
                    Como posso ajudar, {user.name.split(" ")[0]}?
                  </div>
                  <p className="mt-2 text-[14px] text-[#5B6472]">
                    Descreva sua dúvida ou problema de TI.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {[
                      [
                        "Consultar meus chamados",
                        "Quero consultar meus chamados",
                      ],
                      ["Abrir chamado", "Quero abrir um chamado de TI"],
                      ["Ajuda com VPN", "Minha VPN não conecta"],
                      ["Falar com analista", "Quero falar com um analista"],
                    ].map(([label, q]) => (
                      <Button
                        key={label}
                        variant="outline"
                        size="sm"
                        onClick={() => act("send", undefined, q)}
                        disabled={busy}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {state?.messages.map((m) => {
                const trace = traceOf(m.trace),
                  draft = trace.draft as DraftView | null,
                  ticket = trace.ticket as TicketData | undefined;
                const active = !!(
                  draft &&
                  currentDraft &&
                  JSON.stringify(draft) === currentDraft &&
                  c?.status === "agent"
                );
                return (
                  <div key={m.id}>
                    <Message m={m} />
                    {m.sender === "agent" &&
                      trace.intent === "list" &&
                      !ticket &&
                      m.body.includes("Selecione") && (
                        <TicketSelector
                          tickets={state.tickets}
                          onSelect={
                            c?.status === "agent"
                              ? (id) => act("select", id)
                              : undefined
                          }
                        />
                      )}{" "}
                    {m.sender === "agent" && ticket && (
                      <TicketDetail
                        ticket={ticket}
                        onTransfer={
                          c?.status === "agent"
                            ? () => act("transfer")
                            : undefined
                        }
                        onAddInfo={() => {
                          setText(`Atualizar chamado ${ticket.id}: `);
                          inputRef.current?.focus();
                        }}
                      />
                    )}
                    {m.sender === "agent" &&
                      m.id === state.messages.at(-1)?.id &&
                      c?.status === "agent" &&
                      Array.isArray(trace.quick) && (
                        <div className="mt-2 flex max-w-[600px] flex-wrap gap-2">
                          {(trace.quick as string[]).map((q) => (
                            <Button
                              key={q}
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => act("send", undefined, q)}
                            >
                              {q}
                            </Button>
                          ))}
                        </div>
                      )}
                    {m.sender === "agent" && draft && (
                      <DraftCard
                        draft={draft}
                        priority={trace.priority}
                        due={trace.dueAt as number | undefined}
                        active={active}
                        onConfirm={() => act("confirm")}
                        onCancel={() => act("cancel")}
                      />
                    )}
                  </div>
                );
              })}
              {c?.status === "agent" && c?.messageCount === 30 && !c.draft && (
                <div className="max-w-[600px] rounded-[10px] border border-[#E6E8EC] p-4 text-[13px]">
                  Esta conversa chegou ao limite de 30 mensagens.{" "}
                  <Button
                    size="sm"
                    className="ml-2"
                    onClick={() => act("new")}
                    disabled={busy}
                  >
                    Nova conversa
                  </Button>
                </div>
              )}
              {busy && (
                <div className="text-[13px] text-[#5B6472]">
                  Nexo Assist está analisando...
                </div>
              )}
              <div ref={bottom} />
            </div>
            <div className="shrink-0 border-t border-[#E6E8EC] bg-white px-5 pb-[18px] pt-[10px] lg:px-[clamp(24px,14vw,200px)]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) act("send");
                }}
                className="flex h-12 items-center gap-2 rounded-[10px] border border-[#E6E8EC] bg-white px-1.5 pl-4"
              >
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={
                    busy ||
                    (c?.status === "agent" && (c?.messageCount || 0) >= 30)
                  }
                  placeholder={
                    c?.status === "agent"
                      ? "Escreva para o Nexo…"
                      : "Mensagem para o analista…"
                  }
                  className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] shadow-none!"
                />
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !text.trim() ||
                    (c?.status === "agent" && (c?.messageCount || 0) >= 30)
                  }
                  className="h-9 rounded-[7px] bg-[#0062C4] px-3 text-[13.5px]"
                >
                  <Send size={14} /> Enviar
                </Button>
              </form>
              <div className="mt-1.5 flex justify-between text-[12px] text-[#5B6472]">
                <span className="text-[#C4161D]" role="alert">
                  {error}
                </span>
                <span>
                  {c?.status === "agent"
                    ? `${c.messageCount}/30 mensagens nesta sessão`
                    : "Atendimento humano"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
function Analyst({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [list, setList] = useState<
      (Conversation & { employee: string; preview?: string })[]
    >([]),
    [id, setId] = useState<string | null>(null),
    [detail, setDetail] = useState<
      (ChatState & { conversation: Conversation & { employee: string } }) | null
    >(null),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const v = await api<{
        conversations: (Conversation & {
          employee: string;
          preview?: string;
        })[];
        conversation: Conversation & { employee: string };
        messages: Msg[];
        tickets: TicketData[];
      }>(`/api/analyst${id ? "?id=" + id : ""}`);
      setList(v.conversations);
      if (id) setDetail(v as typeof detail);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    const start = setTimeout(load, 0),
      i = setInterval(load, 4000);
    return () => {
      clearTimeout(start);
      clearInterval(i);
    };
  }, [load]);
  async function act(action: "assume" | "reply" | "return" | "close") {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/analyst", "POST", { conversationId: id, action, text });
      setText("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const thread = useRef<HTMLDivElement>(null),
    lastShown = useRef<{ id: string | null; n: number }>({ id: null, n: 0 });
  useEffect(() => {
    const n = detail?.messages.length || 0,
      el = thread.current;
    if (!el || !n || detail?.conversation.id !== id) return;
    const opened = lastShown.current.id !== id;
    if (opened || n !== lastShown.current.n)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: opened ? "auto" : "smooth",
      });
    lastShown.current = { id, n };
  }, [detail?.messages.length, detail?.conversation.id, id]);
  const waiting = list.filter((c) => c.status === "waiting").length;
  const filtered = list.filter(
    (c) =>
      (filter === "all" ||
        (filter === "mine" && c.analystId === user.id) ||
        filter === c.status) &&
      (!search ||
        c.employee.toLowerCase().includes(search.toLowerCase()) ||
        c.id.toLowerCase().includes(search.toLowerCase())),
  );
  const current = detail?.conversation,
    tickets = detail?.tickets || [];
  return (
    <div className="flex h-screen bg-[#F6F7F9] text-[#1B2431]">
      <aside className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-[#E6E8EC] bg-[#F6F7F9] py-4 sm:flex">
        <div className="flex size-10 items-center justify-center">
          <NexoMark size={24} />
        </div>
        <button
          title="Conversas"
          className="relative flex size-10 items-center justify-center rounded-[10px] bg-white text-[#1B2431]"
        >
          <MessageCircle size={19} />
          {waiting > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full bg-[#0062C4] px-1 text-[10px] text-white">
              {waiting}
            </span>
          )}
        </button>
        <div className="flex-1" />
        <div
          className="flex size-9 items-center justify-center rounded-full bg-[#0285F712] text-[12px] font-semibold text-[#0069C7]"
          title={user.name}
        >
          {user.name
            .split(" ")
            .map((x) => x[0])
            .slice(0, 2)
            .join("")}
        </div>
        <button
          onClick={onLogout}
          title="Sair"
          aria-label="Sair"
          className="mt-1 flex size-9 items-center justify-center text-[#5B6472]"
        >
          <LogOut size={17} />
        </button>
      </aside>
      <aside
        className={`w-full shrink-0 border-r border-[#E6E8EC] bg-white lg:w-[380px] ${id ? "hidden lg:flex" : "flex"} flex-col`}
      >
        <div className="border-b border-[#E6E8EC] px-4 pb-[10px] pt-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[20px] font-semibold">Conversas</h1>
            <span className="rounded-full bg-[#00BD6C14] px-2.5 py-1 text-[11px] text-[#00804A]">
              ● Disponível
            </span>
          </div>
          <div className="relative mt-3">
            <Search
              className="absolute left-3 top-2.5 text-[#5B6472]"
              size={15}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar conversa"
              className="h-9 w-full rounded-[8px] bg-[#F6F7F9] pl-9 pr-3 text-[13px]"
            />
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
            {[
              ["all", "Todas"],
              ["waiting", "Precisam de você"],
              ["agent", "Com o agent"],
              ["mine", "Minhas"],
              ["closed", "Encerradas"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`shrink-0 rounded-[7px] px-2.5 py-1.5 text-[12px] ${filter === value ? "bg-[#0285F712] font-semibold text-[#0069C7]" : "bg-[#F6F7F9] text-[#3D4656]"}`}
              >
                {label}
                {value === "waiting" && waiting > 0 ? ` ${waiting}` : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          {filtered.length === 0 && (
            <p className="p-4 text-[13px] text-[#5B6472]">
              Nenhuma conversa neste filtro.
            </p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setId(c.id)}
              className={`flex w-full gap-3 rounded-[10px] p-2.5 text-left hover:bg-[#F6F7F9] ${id === c.id ? "bg-[#F6F7F9]" : ""}`}
            >
              <span className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-[#DCE9F7] text-[13px] font-semibold text-[#0062C4]">
                {c.employee
                  .split(" ")
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-2">
                  <strong className="truncate text-[14px]">{c.employee}</strong>
                  <small className="shrink-0 text-[11px] text-[#8E8E8E]">
                    {new Date(c.updatedAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </span>
                <span className="mt-1 block truncate text-[12px] text-[#5B6472]">
                  {c.preview || "Conversa iniciada"}
                </span>
                <span
                  className={`mt-1 block text-[11px] ${c.status === "waiting" ? "text-[#C4161D]" : c.status === "analyst" ? "text-[#00804A]" : "text-[#5B6472]"}`}
                >
                  ●{" "}
                  {c.status === "waiting"
                    ? "Aguardando atendimento"
                    : c.status === "analyst"
                      ? "Em atendimento"
                      : c.status === "agent"
                        ? "Com o agent"
                        : "Encerrada"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <section
        className={`min-w-0 flex-1 flex-col bg-[#EEF1F5] ${id ? "flex" : "hidden lg:flex"}`}
      >
        {current ? (
          <>
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#E6E8EC] bg-white px-5">
              <button
                onClick={() => setId(null)}
                className="lg:hidden"
                aria-label="Voltar"
              >
                <ArrowLeft size={18} />
              </button>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DCE9F7] text-[12px] font-semibold text-[#0062C4]">
                {current.employee
                  .split(" ")
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">
                  {current.employee}
                </div>
                <div className="text-[12px] text-[#5B6472]">
                  {current.status === "waiting"
                    ? "aguardando atendimento"
                    : current.status === "analyst"
                      ? "atendimento humano"
                      : "com o agent"}
                </div>
              </div>
              {current.status === "analyst" &&
                current.analystId === user.id && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => act("return")}
                      disabled={busy}
                    >
                      Devolver ao agent
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => act("close")}
                      disabled={busy}
                    >
                      Encerrar atendimento
                    </Button>
                  </>
                )}
            </header>
            <div
              ref={thread}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 lg:px-10"
            >
              {detail?.messages.map((m) => (
                <Message key={m.id} m={m} analyst />
              ))}
            </div>
            <div className="shrink-0 border-t border-[#E6E8EC] bg-white px-5 py-3 lg:px-5">
              {current.status === "waiting" && (
                <div className="mb-2 flex items-center gap-3 rounded-[9px] bg-[#F5A50018] p-2.5">
                  <Headphones size={18} className="text-[#946300]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">
                      Aguardando atendimento humano
                    </div>
                    <div className="text-[12px] text-[#5B6472]">
                      O agente está pausado. Assuma a conversa para responder.
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => act("assume")}
                    disabled={busy}
                  >
                    Assumir atendimento
                  </Button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) act("reply");
                }}
                className="flex h-11 gap-2"
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={
                    current.status !== "analyst" ||
                    current.analystId !== user.id ||
                    busy
                  }
                  placeholder={
                    current.status === "analyst"
                      ? "Escreva uma resposta…"
                      : "Assuma o atendimento para responder…"
                  }
                  className="min-w-0 flex-1 rounded-[9px] border border-[#E6E8EC] bg-[#F6F7F9] px-3 text-[13px]"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={
                    !text.trim() ||
                    busy ||
                    current.status !== "analyst" ||
                    current.analystId !== user.id
                  }
                  aria-label="Enviar resposta"
                >
                  <Send size={16} />
                </Button>
              </form>
              {error && (
                <p role="alert" className="mt-1 text-xs text-[#C4161D]">
                  {error}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-[14px] text-[#5B6472]">
            Selecione uma conversa para começar.
          </div>
        )}
      </section>
      <aside className="hidden w-[340px] shrink-0 flex-col border-l border-[#E6E8EC] bg-white xl:flex">
        <div className="flex h-16 shrink-0 flex-col justify-center border-b border-[#E6E8EC] px-5">
          <h2 className="text-[14px] font-semibold">
            Chamados{" "}
            {current
              ? `de ${current.employee.split(" ")[0]}`
              : "do funcionário"}
          </h2>
          <p className="text-[12px] text-[#5B6472]">
            {
              tickets.filter(
                (t) => !["Resolvido", "Fechado", "Aprovado"].includes(t.status),
              ).length
            }{" "}
            abertos ·{" "}
            {
              tickets.filter((t) =>
                ["Resolvido", "Fechado", "Aprovado"].includes(t.status),
              ).length
            }{" "}
            encerrados
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {tickets.length > 0 && (
            <>
              <h3 className="mb-3 text-[12px] text-[#5B6472]">
                Desta conversa
              </h3>
              <TicketCard ticket={tickets[tickets.length - 1]} />
              <h3 className="mb-1 mt-8 text-[12px] text-[#5B6472]">
                Outros chamados
              </h3>
              {tickets.slice(0, -1).map((t) => (
                <div key={t.id} className="border-b border-[#E6E8EC] py-3">
                  <div className="flex justify-between text-[12px]">
                    <span className="font-medium text-[#0069C7]">{t.id}</span>
                    <span className="text-[#5B6472]">{t.status}</span>
                  </div>
                  <div className="mt-1 text-[13px]">{t.title}</div>
                </div>
              ))}
            </>
          )}
          {tickets.length === 0 && (
            <p className="text-[13px] text-[#5B6472]">
              Nenhum chamado para esta conversa.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ user: User | null }>("/api/auth")
      .then((x) => setUser(x.user))
      .finally(() => setLoading(false));
  }, []);
  async function logout() {
    await api("/api/auth", "DELETE");
    setUser(null);
  }
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Carregando Nexo Assist...
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  return user.role === "analyst" ? (
    <Analyst user={user} onLogout={logout} />
  ) : (
    <Employee user={user} onLogout={logout} />
  );
}
