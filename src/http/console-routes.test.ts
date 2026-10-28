import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { GET as listQueue } from "../app/api/console/conversations/route";
import { GET as listConversations } from "../app/api/conversations/route";
import { POST as closeConversation } from "../app/api/conversations/[id]/close/route";
import { GET as readHistory, POST as sendMessage } from "../app/api/conversations/[id]/messages/route";
import { POST as reply } from "../app/api/conversations/[id]/replies/route";
import { POST as assume } from "../app/api/conversations/[id]/assume/route";
import { POST as returnToAgent } from "../app/api/conversations/[id]/return/route";
import { GET as conversationTickets } from "../app/api/conversations/[id]/tickets/route";
import { POST as confirmDraft } from "../app/api/drafts/[id]/confirm/route";
import { POST as login } from "../app/api/login/route";
import { closeApp, getApp } from "../server/app";
import { SESSION_COOKIE } from "../session/token";

const directories: string[] = [];

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  process.env.SESSION_SECRET = "segredo-de-teste-com-16";
  const directory = mkdtempSync(path.join(tmpdir(), "nexo-console-"));
  directories.push(directory);
  process.env.NEXO_DB_PATH = path.join(directory, "nexo.db");
  closeApp();
});

afterEach(() => {
  closeApp();
  for (const directory of directories.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // No Windows o libSQL solta o arquivo só quando o processo termina.
    }
  }
});

it("lista a conversa, mostra o rastro e confirma o rascunho", async () => {
  const ana = await signIn("ana.souza@nexo.com.br");
  const listed = await listConversations(get("/api/conversations", ana.cookie));
  expect(listed.status).toBe(200);
  const conversations = (await listed.json()) as { conversations: Array<{ id: string }> };
  expect(conversations.conversations.map((item) => item.id)).toContain(ana.conversationId);

  const doubt = await postMessage(ana, "Qual o horário do service desk?");
  expect(doubt.agentCalled).toBe(true);
  expect(doubt.trace).toMatchObject({
    intent: "duvida",
    takenAction: "responder",
    confidence: "alto",
  });
  expect(doubt.trace?.appliedRule).toBeTruthy();
  expect(doubt.trace?.evidence).toEqual([]);

  const draftTurn = await postMessage(ana, "Quero abrir um chamado de VPN");
  const confirmed = await confirm(draftTurn.draft?.id ?? "", ana.cookie);
  expect(confirmed.status).toBe(200);

  const history = await readHistory(get(`/api/conversations/${ana.conversationId}/messages`, ana.cookie), {
    params: Promise.resolve({ id: ana.conversationId }),
  });
  expect(history.status).toBe(200);
  const body = (await history.json()) as { messages: Array<{ trace: { intent: string } | null }> };
  expect(body.messages.some((message) => message.trace?.intent === "duvida")).toBe(true);
  expect(body.messages.some((message) => message.trace?.intent === "abertura")).toBe(true);
});

it("percorre transferência, fila, pausa sem modelo, resposta do analista e isolamento", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  try {
    const ana = await signIn("ana.souza@nexo.com.br");
    const bruno = await signIn("bruno.tavares@nexo.com.br");
    const rafael = await signIn("rafael.lima@nexo.com.br");
    const transferred = await postMessage(ana, "Pode ver o notebook");
    expect(transferred.conversation.state).toBe("aguardando_analista");
    expect(transferred.trace?.appliedRule).toBe("chamado_vencido");

    const waiting = await queue(rafael.cookie, "para_voce");
    expect(waiting.map((item) => item.id)).toContain(ana.conversationId);
    expect(waiting.find((item) => item.id === ana.conversationId)?.unreadCount).toBe(1);
    const withAgent = await queue(rafael.cookie, "com_agent");
    expect(withAgent.map((item) => item.id)).not.toContain(ana.conversationId);
    const byTicket = await queue(rafael.cookie, "todas", "INC-20311");
    expect(byTicket.map((item) => item.id)).toContain(ana.conversationId);
    const brunoTicket = await queue(rafael.cookie, "todas", "INC-20400");
    expect(brunoTicket.map((item) => item.id)).not.toContain(ana.conversationId);

    const ownList = await listConversations(get("/api/conversations", ana.cookie));
    const ownIds = ((await ownList.json()) as { conversations: Array<{ id: string }> }).conversations.map(
      (item) => item.id,
    );
    expect(ownIds).toContain(ana.conversationId);
    expect(ownIds).not.toContain(bruno.conversationId);

    const tooSoon = await postReply(rafael.cookie, ana.conversationId, "Vou olhar.", "INC-20311");
    expect(tooSoon.status).toBe(409);

    const returned = await returnToAgent(
      post(`/api/conversations/${ana.conversationId}/return`, rafael.cookie, {}),
      params(ana.conversationId),
    );
    expect(returned.status).toBe(200);

    const resumed = await postMessage(ana, "voltei");
    expect(resumed.agentCalled).toBe(true);
    expect(info.mock.calls.some((call) => String(call[0]).includes("nexo: modelo chamado"))).toBe(true);

    await postMessage(ana, "Quero falar com um analista");
    const logged = info.mock.calls.length;
    const paused = await postMessage(ana, "ainda estou esperando");
    expect(paused.agentCalled).toBe(false);
    expect(info.mock.calls).toHaveLength(logged);

    const assumed = await assume(
      post(`/api/conversations/${ana.conversationId}/assume`, rafael.cookie),
      params(ana.conversationId),
    );
    expect(assumed.status).toBe(200);
    const duringService = await postMessage(ana, "consigo mandar mais detalhe");
    expect(duringService.agentCalled).toBe(false);
    expect(info.mock.calls).toHaveLength(logged);

    const answered = await postReply(rafael.cookie, ana.conversationId, "Vou olhar o notebook.", "INC-20311");
    expect(answered.status).toBe(200);
    const answer = (await answered.json()) as { agentCalled: boolean; ticket: { id: string; overdue: boolean } };
    expect(answer.agentCalled).toBe(false);
    expect(answer.ticket.overdue).toBe(false);

    const panel = await conversationTickets(
      get(`/api/conversations/${ana.conversationId}/tickets`, rafael.cookie),
      params(ana.conversationId),
    );
    const ids = ((await panel.json()) as { tickets: Array<{ id: string }> }).tickets.map((ticket) => ticket.id);
    expect(ids).toContain("INC-20311");
    expect(ids).not.toContain("INC-20400");

    const mine = await queue(rafael.cookie, "minhas");
    expect(mine.map((item) => item.id)).toContain(ana.conversationId);

    const closed = await closeConversation(
      post(`/api/conversations/${ana.conversationId}/close`, rafael.cookie),
      params(ana.conversationId),
    );
    expect(closed.status).toBe(200);
    const refused = await sendMessage(
      post(`/api/conversations/${ana.conversationId}/messages`, ana.cookie, { text: "depois de encerrar" }),
      params(ana.conversationId),
    );
    expect(refused.status).toBe(409);
  } finally {
    info.mockRestore();
  }
});

it("falha do legado devolve erro e o rascunho continua pendente", async () => {
  const ana = await signIn("ana.souza@nexo.com.br");
  const turn = await postMessage(ana, "Quero abrir um chamado de VPN");
  const app = await getApp();
  app.tickets.setFailure("before-commit");
  const failed = await confirm(turn.draft?.id ?? "", ana.cookie);
  expect(failed.status).toBe(503);

  const history = await readHistory(get(`/api/conversations/${ana.conversationId}/messages`, ana.cookie), {
    params: Promise.resolve({ id: ana.conversationId }),
  });
  const body = (await history.json()) as { draft: { status: string } | null };
  expect(body.draft?.status).toBe("pending");

  app.tickets.setFailure("none");
  const recovered = await confirm(turn.draft?.id ?? "", ana.cookie);
  expect(recovered.status).toBe(200);
});

type Session = { cookie: string; conversationId: string };

async function signIn(email: string): Promise<Session> {
  const response = await login(
    new NextRequest("http://localhost/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "qualquer" }),
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { conversation: { id: string } | null };
  return { cookie: sessionPair(response), conversationId: body.conversation?.id ?? "" };
}

async function postMessage(session: Session, text: string) {
  const response = await sendMessage(
    post(`/api/conversations/${session.conversationId}/messages`, session.cookie, { text }),
    params(session.conversationId),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    agentCalled: boolean;
    conversation: { state: string };
    trace: { intent: string; appliedRule: string; takenAction: string; confidence: string; evidence: unknown } | null;
    draft: { id: string } | null;
  };
}

function postReply(cookie: string, conversationId: string, text: string, ticketId: string) {
  return reply(post(`/api/conversations/${conversationId}/replies`, cookie, { text, ticketId }), params(conversationId));
}

async function queue(cookie: string, filter: string, q?: string) {
  const pathName = q
    ? `/api/console/conversations?filter=${filter}&q=${encodeURIComponent(q)}`
    : `/api/console/conversations?filter=${filter}`;
  const response = await listQueue(get(pathName, cookie));
  expect(response.status).toBe(200);
  return (
    (await response.json()) as { conversations: Array<{ id: string; unreadCount: number }> }
  ).conversations;
}

function confirm(draftId: string, cookie: string) {
  return confirmDraft(post(`/api/drafts/${draftId}/confirm`, cookie), params(draftId));
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function get(pathname: string, cookie: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { headers: { cookie } });
}

function post(pathname: string, cookie: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function sessionPair(response: Response): string {
  const header = response.headers.getSetCookie().find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  const pair = header?.split(";")[0];
  if (!pair) {
    throw new Error("Resposta sem cookie de sessão.");
  }
  return pair;
}
