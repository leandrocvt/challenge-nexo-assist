"use client";

import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react";

import { ApiError, api, confidenceLabel, daysAgo, hourInSaoPaulo, openedAtLabel, priorityLabel } from "./api";
import { EmployeeShell } from "./employee-shell";
import type { DraftCard, History, HistoryMessage, TicketCard } from "./types";
import { useEmployee } from "./use-employee";

const AFFECTED: Record<string, string> = {
  pessoa: "Somente você",
  equipe: "Sua equipe",
  empresa: "Toda a empresa",
};

const OPERATION: Record<DraftCard["operation"], string> = {
  create: "Novo chamado",
  update: "Complemento",
  reopen: "Reabertura",
};

const STATUS: Record<string, string> = {
  em_andamento: "Em andamento",
  aguardando_analista: "Aguardando analista",
  em_atendimento: "Em atendimento",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
};

export function ChatScreen() {
  const { employee, loading } = useEmployee("funcionario");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [tickets, setTickets] = useState<TicketCard[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTrace, setOpenTrace] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");

  const load = useCallback(async (id: string) => {
    const [nextHistory, nextTickets] = await Promise.all([
      api<History>(`/api/conversations/${id}/messages`),
      api<{ tickets: TicketCard[] }>("/api/tickets"),
    ]);
    setHistory(nextHistory);
    setTickets(nextTickets.tickets);
    if (nextHistory.draft) {
      setDraftText(nextHistory.draft.description);
    }
  }, []);

  useEffect(() => {
    if (!employee) {
      return;
    }
    let active = true;
    api<{ conversations: Array<{ id: string; state: string }> }>("/api/conversations")
      .then(async (body) => {
        const open = body.conversations.find((item) => item.state !== "encerrada") ?? body.conversations[0];
        if (!open || !active) {
          return;
        }
        setConversationId(open.id);
        await load(open.id);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Não foi possível abrir a conversa.");
        }
      });
    return () => {
      active = false;
    };
  }, [employee, load]);

  async function send(value: string) {
    if (!conversationId || value.trim() === "") {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: value.trim() }),
      });
      setText("");
      setEditing(false);
      await load(conversationId);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDraft() {
    if (!history?.draft || !conversationId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/drafts/${history.draft.id}/confirm`, { method: "POST" });
      setEditing(false);
      await load(conversationId);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "O chamado não foi gravado.");
      await load(conversationId);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!history?.draft || !conversationId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/drafts/${history.draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ description: draftText }),
      });
      setEditing(false);
      await load(conversationId);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível editar o rascunho.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelDraft() {
    if (!history?.draft || !conversationId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/drafts/${history.draft.id}/cancel`, { method: "POST" });
      setEditing(false);
      await load(conversationId);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível cancelar o rascunho.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && history?.draft) {
      event.preventDefault();
      void confirmDraft();
    }
  }

  if (loading || !employee) {
    return <p className="p-8 text-[13.5px] text-ink-3">Carregando a conversa…</p>;
  }

  const count = history?.session.messageCount ?? 0;
  const limit = history?.session.limit ?? 30;

  return (
    <EmployeeShell employee={employee} active="atendimento">
      <header data-region="topbar" className="flex h-16 items-center gap-4 border-b border-rule px-8">
        <p className="flex flex-1 items-center gap-2 text-[13.5px]">
          <span className="text-ink-3">Service desk de TI</span>
          <Chevron />
          <span className="font-semibold">Atendimento</span>
        </p>
        <p className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12.5px] font-semibold text-success-text">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Assistente online
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col justify-end gap-5 overflow-auto px-8 py-7 xl:px-[200px]">
          {history?.messages.map((message) => (
            <MessageBlock
              key={message.id}
              message={message}
              tickets={tickets}
              open={openTrace === message.id}
              onToggle={() => setOpenTrace((current) => (current === message.id ? null : message.id))}
              onChoose={(option) => void send(option)}
              busy={busy}
            />
          ))}
          {history?.draft ? (
            <DraftCardView
              draft={history.draft}
              editing={editing}
              draftText={draftText}
              onDraftText={setDraftText}
              onConfirm={() => void confirmDraft()}
              onEdit={() => {
                setDraftText(history.draft?.description ?? "");
                setEditing(true);
              }}
              onSave={() => void saveDraft()}
              onCancelEdit={() => setEditing(false)}
              onCancel={() => void cancelDraft()}
            />
          ) : null}
          {busy ? <p className="text-[13.5px] text-ink-3">Carregando a resposta…</p> : null}
          {error ? (
            <p role="alert" className="text-[13.5px] text-danger-text">
              {error}
            </p>
          ) : null}
        </div>
        <form
          data-region="compositor"
          className="flex flex-col gap-1.5 px-8 pt-2.5 pb-[18px] xl:px-[200px]"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void send(text);
          }}
        >
          <div className="flex h-12 items-center gap-2 rounded-xl border border-[#1B24311F] pr-1.5 pl-4">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escreva para o Nexo…"
              rows={1}
              disabled={busy}
              className="h-6 w-full resize-none bg-transparent text-[14.5px] outline-none placeholder:text-ink-3"
            />
            <button type="submit" className="flex h-9 items-center gap-1.5 rounded-md bg-cta px-3 text-[13.5px] font-semibold text-white" disabled={busy}>
              <SendIcon />
              Enviar
            </button>
          </div>
          <p className="text-right text-[12.5px] text-ink-3">
            {count}/{limit} mensagens nesta sessão
          </p>
        </form>
      </div>
    </EmployeeShell>
  );
}

function MessageBlock({
  message,
  tickets,
  open,
  onToggle,
  onChoose,
  busy,
}: {
  message: HistoryMessage;
  tickets: TicketCard[];
  open: boolean;
  onToggle: () => void;
  onChoose: (option: string) => void;
  busy: boolean;
}) {
  if (message.author === "employee") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[520px] rounded-[12px_12px_4px_12px] bg-ink px-4 py-[11px] text-[14.5px] leading-[1.45] text-white">
          {message.body}
        </p>
      </div>
    );
  }

  const evidence = Array.isArray(message.trace?.evidence) ? message.trace.evidence : [];
  const cited = evidence
    .filter((item) => item.source === "chamado")
    .map((item) => tickets.find((ticket) => ticket.id === item.id))
    .filter((ticket): ticket is TicketCard => Boolean(ticket));

  return (
    <article className="flex max-w-[640px] flex-col gap-1.5">
      {message.author === "agent" ? (
        <div data-region="acoes" className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <p className="font-semibold">Nexo Assist</p>
          {message.visibleActions.map((action) => (
            <p key={action} className="flex items-center gap-1 text-ink-3">
              <Check />
              {action}
            </p>
          ))}
          {message.trace ? (
            <button type="button" className="text-ink-3 underline-offset-2 hover:underline" onClick={onToggle}>
              {open ? "Ocultar decisão" : "Ver decisão"}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-[12.5px] font-semibold text-ink-2">Analista</p>
      )}
      {open && message.trace ? (
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 rounded-lg bg-desk p-3 text-[13px]">
          <dt className="text-ink-3">Intenção</dt>
          <dd>{message.trace.intent}</dd>
          <dt className="text-ink-3">Evidências</dt>
          <dd>
            {message.trace.evidence.length === 0
              ? "nenhuma"
              : message.trace.evidence.map((item) => `${item.source} ${item.id}`).join(", ")}
          </dd>
          <dt className="text-ink-3">Regra</dt>
          <dd>{message.trace.appliedRule}</dd>
          <dt className="text-ink-3">Ação</dt>
          <dd>{message.trace.takenAction}</dd>
          <dt className="text-ink-3">Segurança</dt>
          <dd>{confidenceLabel(message.trace.confidence)}</dd>
        </dl>
      ) : null}
      {cited.map((ticket) => (
        <TicketDetail key={ticket.id} ticket={ticket} />
      ))}
      <div className="flex max-w-[600px] flex-col gap-3 rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3">
        <p className="text-[14.5px] leading-[1.5]">{message.body}</p>
        {message.options.length > 0 ? (
          <div data-region="opcoes" className="flex flex-wrap gap-1.5">
            {message.options.map((option, index) => (
              <button
                key={option}
                type="button"
                disabled={busy}
                onClick={() => onChoose(option)}
                className="flex items-center gap-1.5 rounded-lg border border-rule px-3 py-1.5 text-[13.5px] font-medium"
              >
                <span className="grid h-4 w-4 place-items-center rounded-md bg-desk text-[12.5px] text-ink-3">{index + 1}</span>
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function TicketDetail({ ticket }: { ticket: TicketCard }) {
  return (
    <article data-region="chamado" className="overflow-hidden rounded-2xl border border-[#1B243117] bg-paper">
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <span className="font-medium">Chamado</span>
          <span className="h-[3px] w-[3px] rounded-full bg-rule" />
          <span>{ticket.id}</span>
          <span className="ml-auto flex items-center gap-1.5 font-medium text-warning-text">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            {STATUS[ticket.status] ?? ticket.status}
          </span>
        </div>
        <h3 className="text-[18px] leading-tight font-semibold tracking-[-0.2px]">{ticket.title}</h3>
        <p className="text-[13.5px] leading-normal text-ink-2">{ticket.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule px-[18px] py-3">
        <Field label="Categoria" value={`${ticket.category}${ticket.subjectDetail ? ` › ${ticket.subjectDetail}` : ""}`} />
        <Field label="Prioridade" value={priorityLabel(ticket.priority)} />
        {ticket.createdAt ? <Field label="Aberto em" value={openedAtLabel(ticket.createdAt)} /> : null}
        {ticket.updatedAt ? (
          <div>
            <p className="text-[12.5px] text-ink-3">Última atualização</p>
            <p className="text-[14.5px] font-medium">
              <span className={ticket.overdue ? "text-warning-text" : ""}>{daysAgo(ticket.updatedAt)}</span>
              {ticket.overdue ? <span className="font-normal text-ink-3"> · prazo vencido</span> : null}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12.5px] text-ink-3">{label}</p>
      <p className="text-[14.5px] font-medium">{value}</p>
    </div>
  );
}

function DraftCardView({
  draft,
  editing,
  draftText,
  onDraftText,
  onConfirm,
  onEdit,
  onSave,
  onCancelEdit,
  onCancel,
}: {
  draft: DraftCard;
  editing: boolean;
  draftText: string;
  onDraftText: (value: string) => void;
  onConfirm: () => void;
  onEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <article data-region="rascunho" className="overflow-hidden rounded-2xl border border-[#1B243117] bg-paper">
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <span className="font-medium">{OPERATION[draft.operation]}</span>
          <span className="h-[3px] w-[3px] rounded-full bg-rule" />
          <span>Rascunho {draft.publicCode}</span>
          <span className="ml-auto flex items-center gap-1.5 font-medium text-warning-text">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            Aguardando confirmação
          </span>
        </div>
        <h3 className="text-[18px] leading-tight font-semibold tracking-[-0.2px]">{draft.title}</h3>
        {editing ? (
          <textarea
            className="mt-1 w-full rounded-lg border border-rule px-3 py-2 text-[13.5px]"
            value={draftText}
            onChange={(event) => onDraftText(event.target.value)}
          />
        ) : (
          <p className="text-[13.5px] leading-normal text-ink-2">{draft.description}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-6 border-t border-rule px-[18px] py-3">
        <Field label="Categoria" value={draft.category} />
        <div>
          <p className="text-[12.5px] text-ink-3">Prioridade</p>
          <p className="text-[14.5px] font-medium">
            {priorityLabel(draft.priority)}
            <span className="font-normal text-ink-3"> · resposta até {hourInSaoPaulo(draft.slaDueAt)}</span>
          </p>
        </div>
        <Field label="Afetados" value={(draft.impact ? AFFECTED[draft.impact] : undefined) ?? "—"} />
      </div>
      <div className="flex items-center gap-1.5 border-t border-rule bg-desk px-2 py-2">
        {editing ? (
          <>
            <button type="button" className="h-9 rounded-lg bg-cta px-3.5 text-[13.5px] font-semibold text-white" onClick={onSave}>
              Salvar
            </button>
            <button type="button" className="h-9 rounded-lg px-3.5 text-[13.5px] font-medium text-ink-2" onClick={onCancelEdit}>
              Cancelar edição
            </button>
          </>
        ) : (
          <>
            <button type="button" className="flex h-9 items-center gap-2 rounded-lg bg-cta pr-2.5 pl-3.5 text-[13.5px] font-semibold text-white" onClick={onConfirm}>
              Confirmar
              <span className="rounded-md bg-white/20 px-1 text-[11.5px] font-normal text-white/80">Ctrl↵</span>
            </button>
            <button type="button" className="h-9 rounded-lg border border-[#1B24311F] bg-paper px-3.5 text-[13.5px] font-medium" onClick={onEdit}>
              Editar
            </button>
            <button type="button" className="h-9 rounded-lg px-3.5 text-[13.5px] font-medium text-ink-2" onClick={onCancel}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 12h11M12 6l6 6-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
