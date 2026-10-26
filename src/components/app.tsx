"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Headphones,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Send,
  ShieldCheck,
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
function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 font-semibold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white">
        <LifeBuoy size={18} />
      </span>
      Nexo Assist
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("ana.paula@nexo.com"),
    [password, setPassword] = useState("demo"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ user: User }>("/api/auth", "POST", {
        email,
        password,
      });
      onLogin(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-[#101b2f] p-8 text-white lg:p-14">
        <Logo dark />
        <div className="max-w-lg pb-16">
          <div className="mb-7 inline-flex rounded-full border border-slate-600 px-3 py-1 text-xs text-blue-200">
            SERVICE DESK INTELIGENTE
          </div>
          <h1 className="text-4xl font-semibold leading-tight lg:text-6xl">
            Seu problema de TI, resolvido em uma conversa.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-7 text-slate-300">
            Tire dúvidas, acompanhe chamados e receba ajuda de um analista
            quando precisar.
          </p>
          <div className="mt-10 rounded-xl border border-slate-600 bg-white/5 p-5 text-sm text-slate-200">
            <p>“Meu notebook ficou lento depois da atualização.”</p>
            <p className="mt-3 rounded-lg bg-blue-600/30 p-3">
              Entendi. Vou consultar seus chamados e preparar os próximos
              passos.
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-400">Nexo · Tecnologia para pessoas</p>
      </section>
      <section className="flex items-center justify-center bg-white p-8">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-3xl font-semibold">Entrar</h2>
          <p className="mt-2 text-sm text-slate-500">
            Acesse com seu e-mail corporativo.
          </p>
          <label className="mt-8 block text-sm font-medium">
            E-mail corporativo
            <input
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="mt-5 block text-sm font-medium">
            Senha
            <input
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {error}
            </p>
          )}
          <Button className="mt-7 w-full" size="lg" disabled={busy}>
            {busy ? "Entrando..." : "Entrar"}
            <ArrowRight size={16} />
          </Button>
          <p className="mt-5 text-xs leading-5 text-slate-500">
            Demonstração: Ana Paula ou João Martins. Qualquer senha não vazia.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs text-blue-600 underline"
              onClick={() => setEmail("ana.paula@nexo.com")}
            >
              Funcionária
            </button>
            <button
              type="button"
              className="text-xs text-blue-600 underline"
              onClick={() => setEmail("joao.martins@nexo.com")}
            >
              Analista
            </button>
          </div>
        </form>
      </section>
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
  const rows = [
    ["Intenção", t.intent],
    ["Tipo e categoria", [t.type, t.category].filter(Boolean).join(" · ")],
    ["Impacto e urgência", [t.impact, t.urgency].filter(Boolean).join(" · ")],
    ["Prioridade", t.priority],
    [
      "Confiança",
      typeof t.confidence === "number"
        ? `${Math.round(t.confidence * 100)}%`
        : null,
    ],
    ["Ferramentas", ((t.tools as string[]) || []).join(", ") || "Nenhuma"],
    ["Resultados", ((t.results as string[]) || []).join("; ") || "Nenhum"],
    ["Regras", ((t.rules as string[]) || []).join("; ") || "Nenhuma"],
    ["Justificativa", t.reason],
    ["Tempo", typeof t.executionMs === "number" ? `${t.executionMs} ms` : null],
    ["Erros", ((t.errors as string[]) || []).join("; ") || "Nenhum"],
  ].filter(([, v]) => v);
  return (
    <details className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <summary className="flex items-center gap-2 font-medium">
        <ShieldCheck size={14} /> Ações e decisões do agente{" "}
        <ChevronDown size={13} />
      </summary>
      <dl className="mt-3 grid gap-2 border-t border-amber-200 pt-3 sm:grid-cols-2">
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
function Message({ m }: { m: Msg }) {
  const own = m.sender === "employee";
  return (
    <div className={"flex " + (own ? "justify-end" : "justify-start")}>
      <div className={"max-w-[85%] sm:max-w-[75%] " + (own ? "" : "w-full")}>
        <div
          className={
            "mb-1 text-[11px] text-slate-400 " + (own ? "text-right" : "")
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
        {m.sender === "agent" && <Trace raw={m.trace} />}
        <div
          className={
            "whitespace-pre-line rounded-xl px-4 py-3 text-sm leading-6 " +
            (own
              ? "bg-slate-800 text-white"
              : m.sender === "system"
                ? "bg-slate-100 text-slate-600"
                : "border border-slate-200 bg-white text-slate-700")
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
  children,
}: {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#f9fbfd]">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-5 md:flex">
        <Logo />
        <div className="mt-12 space-y-2">
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
            {user.role === "analyst" ? "Conversas" : "Meu chat"}
          </div>
          <div className="px-3 py-2 text-sm text-slate-500">
            {user.role === "analyst" ? "Console do analista" : "Service desk"}
          </div>
        </div>
        <div className="mt-auto border-t border-slate-100 pt-5">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="mt-1 truncate text-xs text-slate-500">
            {user.email}
          </div>
          <Button onClick={onLogout} variant="ghost" size="sm" className="mt-3">
            <LogOut size={14} /> Sair
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
function Employee({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [state, setState] = useState<ChatState | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try {
      setState(await api<ChatState>("/api/chat"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const start = setTimeout(load, 0);
    const i = setInterval(load, 4000);
    return () => {
      clearTimeout(start);
      clearInterval(i);
    };
  }, [load]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.messages.length]);
  async function act(
    action: "send" | "confirm" | "cancel" | "select" | "transfer",
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
  return (
    <Shell user={user} onLogout={onLogout}>
      <div className="flex h-screen flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5">
          <div>
            <div className="font-semibold">Nexo Assist</div>
            <div className="text-xs text-slate-500">
              {c?.status === "agent"
                ? "● Agente disponível"
                : c?.status === "waiting"
                  ? "● Aguardando analista"
                  : "● Em atendimento humano"}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => act("transfer")}
            disabled={busy || c?.status !== "agent"}
          >
            <Headphones size={15} /> Falar com analista
          </Button>
        </header>
        {state?.demo && (
          <div className="border-b border-blue-100 bg-blue-50 px-5 py-2 text-center text-xs text-blue-800">
            Modo de demonstração determinístico. Configure OPENAI_API_KEY para
            usar o agente Mastra com IA.
          </div>
        )}
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-8">
            {!state && (
              <div className="text-center text-slate-500">
                Carregando conversa...
              </div>
            )}
            {state?.messages.length === 0 && (
              <div className="mx-auto max-w-md py-14 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <MessageCircle />
                </div>
                <h1 className="mt-5 text-2xl font-semibold">
                  Como posso ajudar, {user.name.split(" ")[0]}?
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Descreva seu problema de TI ou escolha uma opção para começar.
                </p>
                <div className="mt-7 grid gap-2 sm:grid-cols-2">
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
                      onClick={() => act("send", undefined, q)}
                      disabled={busy}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {state?.messages.map((m) => (
              <Message key={m.id} m={m} />
            ))}
            {state && state.tickets.length > 0 && state.messages.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {state.tickets.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    onClick={() => act("select", t.id)}
                  />
                ))}
              </div>
            )}
            {c?.draft && c.status === "agent" && (
              <div className="flex gap-2">
                <Button onClick={() => act("confirm")} disabled={busy}>
                  <Check size={15} /> Confirmar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => act("cancel")}
                  disabled={busy}
                >
                  <X size={15} /> Cancelar
                </Button>
              </div>
            )}
            {busy && (
              <div className="text-sm text-slate-500">
                O Nexo Assist está analisando...
              </div>
            )}
            <div ref={bottom} />
          </div>
          <div className="border-t border-slate-200 bg-white px-5 py-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) act("send");
              }}
              className="flex gap-2"
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy || (c?.messageCount || 0) >= 30}
                placeholder={
                  c?.status !== "agent"
                    ? "Mensagem para o analista..."
                    : "Descreva sua dúvida ou problema de TI..."
                }
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm"
              />
              <Button
                type="submit"
                size="icon"
                disabled={busy || !text.trim()}
                aria-label="Enviar mensagem"
              >
                <Send size={16} />
              </Button>
            </form>
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <span>
                {error && (
                  <span role="alert" className="text-red-600">
                    {error}
                  </span>
                )}
              </span>
              <span>{c?.messageCount || 0}/30 mensagens</span>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
function Analyst({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [list, setList] = useState<(Conversation & { employee: string })[]>([]),
    [id, setId] = useState<string | null>(null),
    [detail, setDetail] = useState<
      (ChatState & { conversation: Conversation & { employee: string } }) | null
    >(null),
    [filter, setFilter] = useState("all"),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const v = await api<{
        conversations: (Conversation & { employee: string })[];
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
    const start = setTimeout(load, 0);
    const i = setInterval(load, 4000);
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
  const filtered = list.filter((x) => filter === "all" || x.status === filter);
  return (
    <Shell user={user} onLogout={onLogout}>
      <div className="flex h-screen flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5">
          <div>
            <h1 className="font-semibold">Conversas</h1>
            <p className="text-xs text-slate-500">
              Console do analista ·{" "}
              {list.filter((x) => x.status === "waiting").length} aguardando
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            Atualizar
          </Button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_260px]">
          <aside className="overflow-y-auto border-r border-slate-200 bg-white">
            <div className="p-3">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm"
              >
                <option value="all">Todas</option>
                <option value="waiting">Aguardando</option>
                <option value="analyst">Em atendimento</option>
                <option value="agent">Com agente</option>
                <option value="closed">Encerradas</option>
              </select>
            </div>
            {filtered.length === 0 && (
              <p className="p-4 text-sm text-slate-500">
                Nenhuma conversa neste filtro.
              </p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setId(c.id)}
                className={
                  "w-full border-b border-slate-100 p-4 text-left hover:bg-blue-50 " +
                  (id === c.id ? "bg-blue-50" : "")
                }
              >
                <div className="font-medium">{c.employee}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {c.status === "waiting"
                    ? "Aguardando analista"
                    : c.status === "analyst"
                      ? "Em atendimento"
                      : c.status === "agent"
                        ? "Com agente"
                        : "Encerrada"}
                </div>
              </button>
            ))}
          </aside>
          <section className="flex min-h-0 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {!id && (
                <div className="pt-20 text-center text-slate-500">
                  Selecione uma conversa para começar.
                </div>
              )}
              {detail?.messages.map((m) => (
                <Message key={m.id} m={m} />
              ))}
            </div>
            {detail && (
              <div className="border-t border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {detail.conversation.status === "waiting" && (
                    <Button onClick={() => act("assume")} disabled={busy}>
                      <Headphones size={15} /> Assumir conversa
                    </Button>
                  )}
                  {detail.conversation.status === "analyst" &&
                    detail.conversation.analystId === user.id && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => act("return")}
                          disabled={busy}
                        >
                          <ArrowLeft size={15} /> Devolver ao agente
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => act("close")}
                          disabled={busy}
                        >
                          Encerrar atendimento
                        </Button>
                      </>
                    )}
                </div>
                {detail.conversation.status === "analyst" &&
                  detail.conversation.analystId === user.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        act("reply");
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Responder como analista..."
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <Button type="submit" disabled={!text.trim() || busy}>
                        <Send size={15} />
                      </Button>
                    </form>
                  )}
                {error && (
                  <p role="alert" className="mt-2 text-xs text-red-600">
                    {error}
                  </p>
                )}
              </div>
            )}
          </section>
          <aside className="hidden overflow-y-auto border-l border-slate-200 bg-white p-4 lg:block">
            <h2 className="font-semibold">Chamados do funcionário</h2>
            <p className="mt-1 text-xs text-slate-500">Contexto da conversa</p>
            <div className="mt-5 space-y-2">
              {detail?.tickets.map((t) => (
                <TicketCard key={t.id} ticket={t} />
              ))}
              {detail?.tickets.length === 0 && (
                <p className="text-sm text-slate-500">Nenhum chamado.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </Shell>
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
