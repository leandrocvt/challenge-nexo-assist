import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { RequestContext } from "@mastra/core/request-context";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeApp } from "../server/app";
import { deskAgent } from "./desk";
import { listTicketsTool, searchArticlesTool } from "./tools";

const directories: string[] = [];

beforeEach(() => {
  const directory = mkdtempSync(path.join(tmpdir(), "nexo-agent-"));
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

describe("tools de leitura", () => {
  it("sem employeeId no contexto não devolve chamado", async () => {
    const result = await runTickets({}, { query: null, employeeId: "ana" });
    expect(result).toMatchObject({ error: true });
    expect(result).not.toHaveProperty("tickets");
  });

  it("ignora o employeeId do argumento e não mostra o chamado do Bruno", async () => {
    const result = await runTickets({ employeeId: "ana" }, { query: null, employeeId: "bruno" });
    expect(result).toMatchObject({ error: false });
    const tickets = ticketsOf(result);
    expect(tickets.map((ticket) => ticket.id)).toContain("INC-20311");
    expect(tickets.map((ticket) => ticket.id)).not.toContain("INC-20400");

    const foreign = await runTickets({ employeeId: "ana" }, { query: "INC-20400", employeeId: "bruno" });
    expect(ticketsOf(foreign)).toEqual([]);
  });

  it("busca o artigo da VPN sem abrir chamado", async () => {
    const execute = searchArticlesTool.execute;
    if (!execute) {
      throw new Error("Tool sem execute.");
    }
    const requestContext = new RequestContext<{ employeeId: string }>();
    requestContext.set("employeeId", "ana");
    const result = await execute({ query: "erro 809" }, { requestContext } as never);
    expect(result).toMatchObject({ error: false });
    if (!result || typeof result !== "object" || !("articles" in result) || !Array.isArray(result.articles)) {
      throw new Error("Resposta sem artigos.");
    }
    expect(result.articles.map((article) => article.id)).toContain("art-vpn-809");
  });
});

describe("agent", () => {
  it("recusa gerar sem employeeId antes de chamar o modelo", async () => {
    const requestContext = new RequestContext();
    await expect(deskAgent.generate("A VPN caiu.", { requestContext })).rejects.toThrow(
      /employeeId|Request context/i,
    );
  });
});

async function runTickets(
  values: { employeeId?: string },
  input: { query: string | null; employeeId?: string },
) {
  const execute = listTicketsTool.execute;
  if (!execute) {
    throw new Error("Tool sem execute.");
  }
  const requestContext = new RequestContext<{ employeeId: string }>();
  if (values.employeeId) {
    requestContext.set("employeeId", values.employeeId);
  }
  return execute(input, { requestContext } as never);
}

function ticketsOf(result: unknown): Array<{ id: string }> {
  if (!result || typeof result !== "object" || !("tickets" in result) || !Array.isArray(result.tickets)) {
    throw new Error("Resposta sem lista de chamados.");
  }
  return result.tickets.filter((ticket): ticket is { id: string } => {
    return typeof ticket === "object" && ticket !== null && "id" in ticket && typeof ticket.id === "string";
  });
}
