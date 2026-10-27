import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TicketRuleError, TicketUnavailableError } from "./errors";
import { TicketService } from "./service";

const directories: string[] = [];

function tempFile(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "nexo-tickets-"));
  directories.push(directory);
  return path.join(directory, "nexo.db");
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // No Windows o libSQL solta o arquivo só quando o processo termina.
    }
  }
});

const NOW = new Date("2026-10-27T15:00:00.000Z");

const NEW_TICKET = {
  ownerId: "ana",
  type: "INC" as const,
  category: "Rede e VPN" as const,
  title: "VPN parada para a empresa",
  description: "Ninguém consegue conectar.",
  impact: "empresa" as const,
  urgency: "parado" as const,
};

describe("isolamento", () => {
  it("a Ana não vê o chamado do Bruno, nem pelo número", async () => {
    const service = await seeded();
    const ids = (await service.listByOwner("ana", NOW)).map((ticket) => ticket.id);
    expect(ids).toContain("INC-20311");
    expect(ids).not.toContain("INC-20400");
    expect(await service.findByNumber("ana", "INC-20400", NOW)).toBeNull();
    expect((await service.findByNumber("bruno", "INC-20400", NOW))?.title).toBe(
      "VPN do Bruno não conecta",
    );
    service.close();
  });
});

describe("seed", () => {
  it("traz os chamados do Anexo B, artigos e os casos de prazo", async () => {
    const service = await seeded();
    const total = await service.countArticles();
    expect(total).toBeGreaterThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(10);

    const ana = await service.listByOwner("ana", NOW);
    const byId = new Map(ana.map((ticket) => [ticket.id, ticket]));
    expect(byId.get("INC-20311")?.overdue).toBe(true);
    expect(byId.get("INC-20150")?.status).toBe("resolvido");
    expect(byId.get("REQ-10442")?.status).toBe("aprovado");
    expect(byId.get("INC-19877")?.status).toBe("resolvido");
    expect(byId.get("INC-19877")?.overdue).toBe(false);
    service.close();
  });
});

describe("idempotência", () => {
  it("falha antes do commit e a repetição cria um único chamado", async () => {
    const service = await seeded();
    const before = (await service.listByOwner("ana", NOW)).length;
    service.setFailure("before-commit");
    await expect(service.create(NEW_TICKET, "key-antes", NOW)).rejects.toBeInstanceOf(
      TicketUnavailableError,
    );
    expect(await service.listByOwner("ana", NOW)).toHaveLength(before);

    service.setFailure("none");
    const created = await service.create(NEW_TICKET, "key-antes", NOW);
    const repeated = await service.create(NEW_TICKET, "key-antes", NOW);
    expect(repeated.id).toBe(created.id);
    expect(created.priority).toBe("critica");
    expect(await service.listByOwner("ana", NOW)).toHaveLength(before + 1);
    service.close();
  });

  it("falha depois do commit e a repetição devolve o mesmo chamado", async () => {
    const service = await seeded();
    service.setFailure("after-commit");
    await expect(service.create(NEW_TICKET, "key-depois", NOW)).rejects.toBeInstanceOf(
      TicketUnavailableError,
    );

    service.setFailure("none");
    const recovered = await service.create(NEW_TICKET, "key-depois", NOW);
    const repeated = await service.create(NEW_TICKET, "key-depois", NOW);
    expect(repeated.id).toBe(recovered.id);
    const copies = (await service.listByOwner("ana", NOW)).filter(
      (ticket) => ticket.id === recovered.id,
    );
    expect(copies).toHaveLength(1);
    service.close();
  });
});

describe("regras de escrita", () => {
  it("reabre o chamado resolvido há 4 dias e recusa o resolvido há 40", async () => {
    const service = await seeded();
    const reopened = await service.reopen("ana", "INC-20150", "reopen-20150", NOW);
    expect(reopened.status).toBe("em_andamento");
    await expect(
      service.reopen("ana", "INC-19877", "reopen-19877", NOW),
    ).rejects.toBeInstanceOf(TicketRuleError);
    service.close();
  });

  it("atualiza o chamado aberto sem criar outro", async () => {
    const service = await seeded();
    const before = (await service.listByOwner("ana", NOW)).length;
    const updated = await service.update(
      {
        ownerId: "ana",
        ticketId: "INC-20298",
        description: "A pasta continua sem acesso. O dono da área já aprovou.",
      },
      "update-20298",
      NOW,
    );
    const again = await service.update(
      {
        ownerId: "ana",
        ticketId: "INC-20298",
        description: "texto que não pode gravar de novo",
      },
      "update-20298",
      NOW,
    );
    expect(again.description).toBe(updated.description);
    expect(await service.listByOwner("ana", NOW)).toHaveLength(before);
    service.close();
  });

  it("transferir marca o chamado como aguardando analista", async () => {
    const service = await seeded();
    const transferred = await service.transfer("ana", "INC-20298", "transfer-20298", NOW);
    expect(transferred.status).toBe("aguardando_analista");
    service.close();
  });
});

describe("arquivo", () => {
  it("o chamado continua no arquivo depois de fechar o cliente", async () => {
    const file = tempFile();
    const first = await TicketService.open(file);
    await first.seed(NOW);
    const created = await first.create(NEW_TICKET, "key-arquivo", NOW);
    first.close();

    const second = await TicketService.open(file);
    const found = await second.findByNumber("ana", created.id, NOW);
    expect(found?.title).toBe(NEW_TICKET.title);
    second.close();
  });
});

async function seeded(): Promise<TicketService> {
  const service = await TicketService.open(":memory:");
  await service.seed(NOW);
  return service;
}
