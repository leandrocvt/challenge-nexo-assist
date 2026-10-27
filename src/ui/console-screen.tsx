"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { ApiError, api, hourInSaoPaulo, initials, priorityLabel } from "./api";
import { Mark } from "./mark";
import type { History, HistoryMessage, QueueItem, TicketCard } from "./types";
import { useEmployee } from "./use-employee";

const FILTERS = [
  { id: "todas", label: "Todas" },
  { id: "para_voce", label: "Para você" },
  { id: "com_agent", label: "Com o agent" },
  { id: "minhas", label: "Minhas" },
] as const;

const AVATAR_FILL = ["#DCE9F7", "#F6E3D3", "#E6E1F7", "#DDF0E6", "#F7E1E6", "#E5E8EC", "#FBEFD0"];
const AVATAR_INK = ["#0062C4", "#9A4A12", "#5B3FC4", "#1E7A4C", "#A3324F", "#3D4656", "#8A6100"];

export function ConsoleScreen() {
  const router = useRouter();
  const { employee, loading } = useEmployee("analista");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("para_voce");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [tickets, setTickets] = useState<TicketCard[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const loadCounts = useCallback(async (analystId: string) => {
    const body = await api<{ conversations: QueueItem[] }>("/api/console/conversations?filter=todas");
    setCounts({
      todas: body.conversations.length,
      para_voce: body.conversations.filter((row) => row.state === "aguardando_analista" && !row.analystId).length,
      com_agent: body.conversations.filter((row) => row.state === "com_agent").length,
      minhas: body.conversations.filter((row) => row.state === "em_atendimento" && row.analystId === analystId).length,
    });
  }, []);

  const loadQueue = useCallback(async (nextFilter: string, nextQuery: string) => {
    setListLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ filter: nextFilter });
      if (nextQuery.trim()) {
        params.set("q", nextQuery.trim());
      }
      const body = await api<{ conversations: QueueItem[] }>(`/api/console/conversations?${params.toString()}`);
      setRows(body.conversations);
      return body.conversations;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível carregar a fila.");
      return [];
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const [nextHistory, nextTickets] = await Promise.all([
      api<History>(`/api/conversations/${id}/messages`),
      api<{ tickets: TicketCard[] }>(`/api/conversations/${id}/tickets`),
    ]);
    setHistory(nextHistory);
    setTickets(nextTickets.tickets);
  }, []);

  useEffect(() => {
    if (!employee) {
      return;
    }
    let active = true;
    const params = new URLSearchParams({ filter });
    api<{ conversations: QueueItem[] }>(`/api/console/conversations?${params.toString()}`)
      .then((body) => {
        if (!active) {
          return;
        }
        setRows(body.conversations);
        setListLoading(false);
        const first = body.conversations[0];
        if (first) {
          setSelectedId(first.id);
          void loadConversation(first.id);
        } else {
          setSelectedId(null);
          setHistory(null);
          setTickets([]);
        }
      })
      .catch((caught: unknown) => {
        if (!active) {
          return;
        }
        setListLoading(false);
        setError(caught instanceof ApiError ? caught.message : "Não foi possível carregar a fila.");
      });
    api<{ conversations: QueueItem[] }>("/api/console/conversations?filter=todas")
      .then((body) => {
        if (!active) {
          return;
        }
        setCounts({
          todas: body.conversations.length,
          para_voce: body.conversations.filter((row) => row.state === "aguardando_analista" && !row.analystId).length,
          com_agent: body.conversations.filter((row) => row.state === "com_agent").length,
          minhas: body.conversations.filter((row) => row.state === "em_atendimento" && row.analystId === employee.id).length,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [employee, filter, loadConversation]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const assumed = selected?.state === "em_atendimento" && selected.analystId === employee?.id;
  const waiting = selected?.state === "aguardando_analista";

  async function act(path: string, body?: unknown, nextFilter = filter) {
    if (!selected || !employee) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
      if (nextFilter !== filter) {
        setFilter(nextFilter);
      }
      const conversations = await loadQueue(nextFilter, query);
      await loadCounts(employee.id);
      const still = conversations.find((row) => row.id === selected.id) ?? conversations[0];
      if (still) {
        setSelectedId(still.id);
        await loadConversation(still.id);
      } else {
        setSelectedId(null);
        setHistory(null);
        setTickets([]);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !employee) {
    return <p className="p-8 text-[13.5px] text-ink-3">Carregando a fila…</p>;
  }

  const cited = citedIds(history);
  const here = tickets.filter((ticket) => cited.has(ticket.id));
  const others = tickets.filter((ticket) => !cited.has(ticket.id));
  const openCount = tickets.filter((ticket) => ticket.status !== "resolvido" && ticket.status !== "aprovado").length;
  const closedCount = tickets.length - openCount;
  const firstName = selected?.employeeName.split(" ")[0] ?? "A pessoa";
  const focusTicket = here[0] ?? null;

  return (
    <div className="grid h-screen min-w-[1440px] grid-cols-[64px_380px_minmax(0,1fr)_340px] bg-paper text-ink">
      <aside data-region="trilho" className="flex flex-col items-center gap-1.5 border-r border-rule bg-desk py-4">
        <div className="grid h-10 w-10 place-items-center pb-2">
          <Mark className="h-[22px] w-[22px]" color="#037AF6" />
        </div>
        <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-paper">
          <ChatIcon />
          {counts.para_voce ? (
            <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-cta px-1 text-[10px] font-bold text-white">
              {counts.para_voce}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          title="Sair"
          className="relative mt-auto grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-[12.5px] font-bold text-primary-text"
          onClick={() => void logout(router)}
        >
          {initials(employee.name)}
          <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-desk bg-success" />
        </button>
      </aside>
      <section data-region="fila" className="flex min-h-0 flex-col border-r border-rule">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-2.5">
          <div className="flex items-center gap-2">
            <h1 className="flex-1 text-[20px] font-bold tracking-[-0.3px]">Conversas</h1>
            <p className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12.5px] font-semibold text-success-text">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Disponível
            </p>
          </div>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void loadQueue(filter, query);
            }}
          >
            <label className="flex h-9 items-center gap-2.5 rounded-full bg-desk px-3 text-ink-3">
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Pesquisar conversa ou chamado"
                className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
              />
            </label>
          </form>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((item) => {
              const selectedFilter = item.id === filter;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[12.5px] font-medium ${
                    selectedFilter ? "bg-primary-soft text-primary-text" : "bg-desk text-ink-2"
                  }`}
                  onClick={() => {
                    setListLoading(true);
                    setFilter(item.id);
                  }}
                >
                  {item.label}
                  <span className={selectedFilter ? "font-semibold" : "font-semibold text-ink-3"}>{counts[item.id] ?? ""}</span>
                </button>
              );
            })}
          </div>
        </div>
        {listLoading ? <p className="px-4 text-[13.5px] text-ink-3">Carregando conversas…</p> : null}
        <ul className="flex-1 overflow-auto px-2">
          {rows.map((row) => {
            const palette = avatarIndex(row.employeeName);
            const active = row.id === selectedId;
            const tag = tagStyle(row, employee.id);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left ${active ? "bg-desk" : ""}`}
                  onClick={() => {
                    setSelectedId(row.id);
                    void loadConversation(row.id).catch((caught: unknown) => {
                      setError(caught instanceof ApiError ? caught.message : "Não foi possível abrir a conversa.");
                    });
                  }}
                >
                  <span
                    className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full text-[15.5px] font-semibold"
                    style={{ background: AVATAR_FILL[palette], color: AVATAR_INK[palette] }}
                  >
                    {initials(row.employeeName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="flex-1 truncate text-[15.5px] font-semibold">{row.employeeName}</span>
                      <span className={`text-[12.5px] ${active ? "font-semibold text-cta" : "text-ink-3"}`}>
                        {hourInSaoPaulo(row.updatedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13.5px] text-ink-3">{row.lastMessage ?? "Sem mensagens"}</span>
                    <span className={`mt-0.5 flex items-center gap-1 text-[11.5px] font-medium ${tag.className}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${tag.dot}`} />
                      {tag.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section data-region="conversa" className="flex min-h-0 min-w-0 flex-col bg-thread">
        {selected ? (
          <>
            <header className="flex h-16 items-center gap-3 border-b border-rule bg-paper pr-4 pl-5">
              <Avatar name={selected.employeeName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15.5px] font-semibold">{selected.employeeName}</p>
                <p className="truncate text-[12.5px] text-ink-3">
                  online{focusTicket ? ` · ${focusTicket.id}` : ""}
                </p>
              </div>
              {waiting ? (
                <p className="flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1.5 text-[12.5px] font-semibold text-warning-text">
                  Aguardando atendente
                </p>
              ) : null}
              {assumed ? (
                <>
                  <button
                    type="button"
                    className="flex h-9 items-center rounded-lg border border-[#1B24311F] px-3 text-[13.5px] font-medium text-ink-2"
                    disabled={busy}
                    onClick={() => void act(`/api/conversations/${selected.id}/return`, {}, "com_agent")}
                  >
                    Devolver ao agent
                  </button>
                  <button
                    type="button"
                    className="flex h-9 items-center rounded-lg bg-danger-soft px-3 text-[13.5px] font-semibold text-danger-text"
                    disabled={busy}
                    onClick={() => void act(`/api/conversations/${selected.id}/close`)}
                  >
                    Encerrar atendimento
                  </button>
                </>
              ) : null}
            </header>
            <div className="flex flex-1 flex-col justify-end gap-1 overflow-auto px-10 py-5">
              {history?.messages.some((message) => isToday(message.createdAt)) ? (
                <p className="mx-auto mb-1 rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-medium text-ink-3">Hoje</p>
              ) : null}
              {history?.messages.map((message) => (
                <ConsoleMessage key={message.id} message={message} analyst={employee} />
              ))}
              {waiting || assumed ? (
                <p className="my-3 flex items-center gap-3 text-[12px] font-medium text-ink-3 before:h-px before:flex-1 before:bg-ink/10 after:h-px after:flex-1 after:bg-ink/10">
                  {waiting
                    ? `Transferida para Suporte ${employee.level ?? "N2"} · ${hourInSaoPaulo(selected.updatedAt)}`
                    : `${employee.name} assumiu · agent pausado · ${hourInSaoPaulo(selected.updatedAt)}`}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="text-[13.5px] text-danger-text">
                  {error}
                </p>
              ) : null}
              {busy ? <p className="text-[13.5px] text-ink-3">Carregando…</p> : null}
            </div>
            <div className="flex flex-col gap-2.5 border-t border-rule bg-paper px-5 pt-3 pb-3.5">
              {waiting ? (
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-warning-soft text-[12px] font-semibold text-warning-text">
                    !
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold">{firstName} espera um atendente</p>
                    <p className="text-[12.5px] text-ink-3">Agent pausado</p>
                  </div>
                  <button
                    type="button"
                    className="flex h-9 items-center rounded-lg border border-[#1B24311F] px-3.5 text-[13.5px] font-medium text-ink-2"
                    disabled={busy}
                    onClick={() => void act(`/api/conversations/${selected.id}/return`, {}, "com_agent")}
                  >
                    Devolver ao agent
                  </button>
                  <button
                    type="button"
                    className="flex h-9 items-center rounded-lg bg-cta px-4 text-[13.5px] font-semibold text-white"
                    disabled={busy}
                    onClick={() => void act(`/api/conversations/${selected.id}/assume`, undefined, "minhas")}
                  >
                    Assumir atendimento
                  </button>
                </div>
              ) : null}
              <form
                className="flex items-center gap-3"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (!assumed) {
                    return;
                  }
                  const ticketId = [...cited][0] ?? null;
                  void act(`/api/conversations/${selected.id}/replies`, { text: reply, ticketId }).then(() => setReply(""));
                }}
              >
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  disabled={!assumed || busy}
                  placeholder={assumed ? "Escreva para a pessoa…" : "Assuma o atendimento para responder"}
                  className="h-11 flex-1 rounded-xl bg-desk px-3.5 text-[14.5px] outline-none placeholder:text-ink-3 disabled:text-ink-3"
                />
                {assumed ? (
                  <button type="submit" className="grid h-11 w-11 place-items-center rounded-full bg-cta text-white" disabled={busy} aria-label="Enviar">
                    <SendIcon />
                  </button>
                ) : null}
              </form>
            </div>
          </>
        ) : (
          <p className="p-6 text-[13.5px] text-ink-3">Nenhuma conversa neste filtro.</p>
        )}
      </section>
      <aside data-region="painel" className="flex min-h-0 flex-col border-l border-rule bg-paper">
        <header className="flex h-16 items-center border-b border-rule px-5">
          <div>
            <h2 className="text-[15.5px] font-semibold">Chamados {selected ? `de ${firstName}` : ""}</h2>
            <p className="text-[12.5px] text-ink-3">
              {openCount} abertos · {closedCount} encerrados
            </p>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-8 overflow-auto px-5 py-6">
          <div className="flex flex-col gap-3">
            <h3 className="text-[12.5px] font-semibold text-ink-3">Desta conversa</h3>
            {here.length === 0 ? <p className="text-[13.5px] text-ink-3">Nenhum</p> : here.map((ticket) => <FocusTicket key={ticket.id} ticket={ticket} />)}
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="mb-1 text-[12.5px] font-semibold text-ink-3">Outros chamados</h3>
            {others.length === 0 ? <p className="text-[13.5px] text-ink-3">Nenhum</p> : others.map((ticket) => <OtherTicket key={ticket.id} ticket={ticket} />)}
          </div>
        </div>
        {selected ? (
          <div className="border-t border-rule px-4 py-3">
            <p className="flex h-9 items-center justify-center rounded-lg border border-[#1B24311F] text-[13.5px] font-medium text-ink-2">
              Ver todos os chamados de {firstName}
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function ConsoleMessage({ message, analyst }: { message: HistoryMessage; analyst: { name: string; level: string | null } }) {
  const time = hourInSaoPaulo(message.createdAt);
  if (message.author === "employee") {
    return (
      <div className="mt-4 flex">
        <p className="flex items-end gap-2.5 rounded-[4px_12px_12px_12px] bg-paper px-3 py-2 text-[14.5px] leading-[1.45]">
          {message.body}
          <span className="text-[11px] text-ink-3">{time}</span>
        </p>
      </div>
    );
  }
  const analystMessage = message.author === "analyst";
  return (
    <div className="mt-4 flex flex-col items-end gap-1">
      <p className="flex items-center gap-1.5 px-1 text-[12px] font-semibold text-ink-2">
        {analystMessage ? analyst.name : "Nexo Assist"}
        <span className={`rounded-md px-1.5 py-px text-[11px] font-semibold ${analystMessage ? "bg-success-soft text-success-text" : "bg-primary-soft text-primary-text"}`}>
          {analystMessage ? `Suporte ${analyst.level ?? "N2"}` : "IA"}
        </span>
      </p>
      <p className={`flex max-w-[420px] items-end gap-2.5 rounded-[12px_4px_12px_12px] px-3 py-2 text-[14.5px] leading-[1.45] ${analystMessage ? "bg-human-bubble" : "bg-agent-bubble"}`}>
        {message.body}
        <span className="text-[11px] text-ink-3">{time}</span>
      </p>
    </div>
  );
}

function FocusTicket({ ticket }: { ticket: TicketCard }) {
  return (
    <article className="flex flex-col gap-3.5 rounded-xl bg-desk p-4">
      <div>
        <div className="flex items-center">
          <p className="flex-1 text-[12.5px] font-medium text-ink-3">{ticket.id}</p>
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warning-text">
            <span className={`h-1.5 w-1.5 rounded-full ${dotClass(ticket.status)}`} />
            {statusLabel(ticket.status)}
          </p>
        </div>
        <p className="mt-1.5 text-[15.5px] leading-snug font-semibold">{ticket.title}</p>
        <p className="mt-1.5 text-[13.5px] text-ink-3">
          {ticket.category} · prioridade {priorityLabel(ticket.priority).toLowerCase()}
          {ticket.overdue ? " · prazo vencido" : ""}
        </p>
      </div>
    </article>
  );
}

function OtherTicket({ ticket }: { ticket: TicketCard }) {
  return (
    <div className="flex items-center gap-3 border-b border-rule py-3 last:border-0">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass(ticket.status)}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-medium">{ticket.title}</p>
        <p className="text-[12.5px] text-ink-3">
          {ticket.id} · {statusLabel(ticket.status)}
        </p>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const palette = avatarIndex(name);
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14.5px] font-semibold"
      style={{ background: AVATAR_FILL[palette], color: AVATAR_INK[palette] }}
    >
      {initials(name)}
    </span>
  );
}

function citedIds(history: History | null): Set<string> {
  const cited = new Set<string>();
  for (const message of history?.messages ?? []) {
    const evidence = message.trace?.evidence;
    if (!Array.isArray(evidence)) {
      continue;
    }
    for (const item of evidence) {
      if (item.source === "chamado") {
        cited.add(item.id);
      }
    }
  }
  if (history?.draft?.targetTicketId) {
    cited.add(history.draft.targetTicketId);
  }
  return cited;
}

function avatarIndex(name: string): number {
  const total = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return total % AVATAR_FILL.length;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    em_andamento: "Em andamento",
    aguardando_analista: "Aguardando analista",
    em_atendimento: "Em atendimento",
    aprovado: "Aprovado",
    resolvido: "Resolvido",
  };
  return labels[status] ?? status;
}

function dotClass(status: string): string {
  if (status === "aguardando_analista") {
    return "bg-warning";
  }
  if (status === "em_andamento" || status === "em_atendimento") {
    return "bg-primary";
  }
  if (status === "aprovado") {
    return "bg-success";
  }
  return "bg-ink/25";
}

function tagStyle(row: QueueItem, analystId: string): { label: string; className: string; dot: string } {
  if (row.state === "em_atendimento" && row.analystId === analystId) {
    return { label: "Você está atendendo", className: "text-primary-text", dot: "bg-cta" };
  }
  if (row.state === "aguardando_analista" && row.transferReason === "seguranca_baixa") {
    return { label: "Agent pediu ajuda · confiança 41%", className: "text-warning-text", dot: "bg-warning" };
  }
  if (row.state === "aguardando_analista") {
    return { label: "Transferida", className: "text-danger-text", dot: "bg-danger" };
  }
  if (row.state === "com_agent") {
    return { label: "Agent atendendo", className: "text-ink-3", dot: "bg-success" };
  }
  if (row.state === "encerrada") {
    return { label: "Resolvida pelo agent", className: "text-ink-3", dot: "bg-ink/30" };
  }
  return { label: row.state, className: "text-ink-3", dot: "bg-ink/30" };
}

function isToday(iso: string): boolean {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return format.format(new Date(iso)) === format.format(new Date());
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 1 1 18 0z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 12h16M13 5l7 7-7 7" />
    </svg>
  );
}

async function logout(router: ReturnType<typeof useRouter>) {
  await api("/api/logout", { method: "POST" });
  router.push("/");
}
