import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it } from "vitest";

import { POST as confirmDraft } from "../app/api/drafts/[id]/confirm/route";
import { POST as sendMessage } from "../app/api/conversations/[id]/messages/route";
import { POST as login } from "../app/api/login/route";
import { GET as listTickets } from "../app/api/tickets/route";
import { closeApp } from "../server/app";
import { SESSION_COOKIE } from "../session/token";

const directories: string[] = [];

beforeEach(() => {
  process.env.SESSION_SECRET = "segredo-de-teste-com-16";
  const directory = mkdtempSync(path.join(tmpdir(), "nexo-attendance-"));
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

it("confirma o rascunho pela rota e a repetição não cria outro chamado", async () => {
  const logged = await login(
    new NextRequest("http://localhost/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ana.souza@nexo.com.br", password: "qualquer" }),
    }),
  );
  const cookie = sessionPair(logged);
  const body = (await logged.json()) as { conversation: { id: string } };

  const turnResponse = await sendMessage(
    new NextRequest("http://localhost/api/conversations/id/messages", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ text: "Quero abrir um chamado de VPN" }),
    }),
    { params: Promise.resolve({ id: body.conversation.id }) },
  );
  expect(turnResponse.status).toBe(200);
  const turn = (await turnResponse.json()) as { draft: { id: string } | null };
  expect(turn.draft?.id).toBeTruthy();

  const before = await listTickets(new NextRequest("http://localhost/api/tickets", { headers: { cookie } }));
  const beforeCount = ((await before.json()) as { tickets: unknown[] }).tickets.length;

  const first = await confirm(turn.draft?.id ?? "", cookie);
  const second = await confirm(turn.draft?.id ?? "", cookie);
  expect(second.ticket.id).toBe(first.ticket.id);

  const after = await listTickets(new NextRequest("http://localhost/api/tickets", { headers: { cookie } }));
  const ids = ((await after.json()) as { tickets: Array<{ id: string }> }).tickets.map((ticket) => ticket.id);
  expect(ids.filter((id) => id === first.ticket.id)).toHaveLength(1);
  expect(ids).toHaveLength(beforeCount + 1);
});

async function confirm(draftId: string, cookie: string) {
  const response = await confirmDraft(
    new NextRequest(`http://localhost/api/drafts/${draftId}/confirm`, {
      method: "POST",
      headers: { cookie },
    }),
    { params: Promise.resolve({ id: draftId }) },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { ticket: { id: string } };
}

function sessionPair(response: Response): string {
  const header = response.headers.getSetCookie().find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  const pair = header?.split(";")[0];
  if (!pair) {
    throw new Error("Resposta sem cookie de sessão.");
  }
  return pair;
}
