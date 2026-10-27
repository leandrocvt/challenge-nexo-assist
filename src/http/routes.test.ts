import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as getConversation } from "../app/api/conversations/[id]/route";
import { POST as login } from "../app/api/login/route";
import { GET as listTickets } from "../app/api/tickets/route";
import { closeApp } from "../server/app";
import { SESSION_COOKIE } from "../session/token";

const directories: string[] = [];

beforeEach(() => {
  process.env.SESSION_SECRET = "segredo-de-teste-com-16";
  const directory = mkdtempSync(path.join(tmpdir(), "nexo-session-"));
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

describe("login", () => {
  it("entra com senhas diferentes e recusa e-mail desconhecido ou senha vazia", async () => {
    const first = await login(post({ email: "ana.souza@nexo.com.br", password: "qualquer" }));
    const second = await login(post({ email: "Ana.Souza@nexo.com.br", password: "outra" }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(cookie(first)).toContain("HttpOnly");
    expect(cookie(second)).toContain("HttpOnly");

    const analyst = await login(
      post({ email: "rafael.lima@nexo.com.br", password: "senha-diferente", remember: true }),
    );
    expect(analyst.status).toBe(200);
    const analystBody = (await analyst.json()) as { conversation: unknown; employee: { role: string } };
    expect(analystBody.employee.role).toBe("analista");
    expect(analystBody.conversation).toBeNull();
    expect(cookie(analyst)).toContain("Max-Age=2592000");

    const unknown = await login(post({ email: "visitante@nexo.com.br", password: "qualquer" }));
    expect(unknown.status).toBe(401);
    expect(unknown.headers.getSetCookie()).toHaveLength(0);

    const empty = await login(post({ email: "ana.souza@nexo.com.br", password: "   " }));
    expect(empty.status).toBe(400);
    expect(empty.headers.getSetCookie()).toHaveLength(0);
  });

  it("devolve a mesma conversa no segundo login", async () => {
    const first = await login(post({ email: "ana.souza@nexo.com.br", password: "um" }));
    const second = await login(post({ email: "ana.souza@nexo.com.br", password: "dois" }));
    const firstBody = (await first.json()) as { conversation: { id: string } };
    const secondBody = (await second.json()) as { conversation: { id: string } };
    expect(secondBody.conversation.id).toBe(firstBody.conversation.id);
  });
});

describe("isolamento", () => {
  it("sem cookie ou com cookie adulterado não lista chamados", async () => {
    const missing = await listTickets(get("/api/tickets"));
    expect(missing.status).toBe(401);

    const logged = await login(post({ email: "ana.souza@nexo.com.br", password: "qualquer" }));
    const tampered = `${sessionPair(logged)}x`;
    const rejected = await listTickets(get("/api/tickets", tampered));
    expect(rejected.status).toBe(401);
  });

  it("a Ana vê os próprios chamados e a conversa do Bruno responde 404", async () => {
    const ana = await login(post({ email: "ana.souza@nexo.com.br", password: "qualquer" }));
    const bruno = await login(post({ email: "bruno.tavares@nexo.com.br", password: "qualquer" }));
    const brunoBody = (await bruno.json()) as { conversation: { id: string } };

    const tickets = await listTickets(get("/api/tickets", sessionPair(ana)));
    expect(tickets.status).toBe(200);
    const body = (await tickets.json()) as { tickets: Array<{ id: string }> };
    const ids = body.tickets.map((ticket) => ticket.id);
    expect(ids).toContain("INC-20311");
    expect(ids).not.toContain("INC-20400");

    const foreign = await getConversation(get(`/api/conversations/${brunoBody.conversation.id}`, sessionPair(ana)), {
      params: Promise.resolve({ id: brunoBody.conversation.id }),
    });
    expect(foreign.status).toBe(404);
  });

  it("o analista não usa a lista de chamados do funcionário", async () => {
    const rafael = await login(post({ email: "rafael.lima@nexo.com.br", password: "qualquer" }));
    const tickets = await listTickets(get("/api/tickets", sessionPair(rafael)));
    expect(tickets.status).toBe(403);
  });
});

describe("reinício", () => {
  it("o mesmo cookie devolve a mesma conversa e o mesmo estado depois de fechar o arquivo", async () => {
    const logged = await login(post({ email: "ana.souza@nexo.com.br", password: "qualquer" }));
    const before = (await logged.json()) as { conversation: { id: string; state: string } };
    const pair = sessionPair(logged);
    closeApp();

    const again = await getConversation(get(`/api/conversations/${before.conversation.id}`, pair), {
      params: Promise.resolve({ id: before.conversation.id }),
    });
    expect(again.status).toBe(200);
    const after = (await again.json()) as { conversation: { id: string; state: string } };
    expect(after.conversation).toEqual(before.conversation);
  });
});

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(pathname: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: cookie ? { cookie } : {},
  });
}

function cookie(response: Response): string {
  const header = response.headers.getSetCookie().find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  if (!header) {
    throw new Error("Resposta sem cookie de sessão.");
  }
  return header;
}

function sessionPair(response: Response): string {
  const header = cookie(response);
  const pair = header.split(";")[0];
  if (!pair) {
    throw new Error("Cookie sem valor.");
  }
  return pair;
}
