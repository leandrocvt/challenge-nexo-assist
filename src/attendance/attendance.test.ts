import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openApp, type App } from "../server/app";
import { TicketUnavailableError } from "../tickets/errors";
import { AttendanceError } from "./errors";
import { decisionSchema, type Agent, type Decision } from "./decision";

let app: App;

beforeEach(async () => {
  app = await openApp(":memory:");
});

afterEach(() => {
  app.close();
});

describe("rascunho", () => {
  it("abre rascunho sem gravar e a confirmação repetida cria um chamado", async () => {
    const ana = await conversation("ana");
    const before = await countTickets("ana");
    const turn = await send(ana.id, agent(opening("VPN não conecta")));
    expect(turn.draft?.status).toBe("pending");
    expect(turn.conversation.state).toBe("com_agent");
    expect(await countTickets("ana")).toBe(before);

    const confirmed = await app.attendance.confirmDraft("ana", turn.draft?.id ?? "");
    const repeated = await app.attendance.confirmDraft("ana", turn.draft?.id ?? "");
    expect(repeated.ticket.id).toBe(confirmed.ticket.id);
    expect(confirmed.ticket.priority).toBe("media");
    expect(confirmed.ticket.status).toBe("em_andamento");
    expect(await countTickets("ana")).toBe(before + 1);
  });

  it("complemento do chamado aberto não cria outro", async () => {
    const ana = await conversation("ana");
    const before = await countTickets("ana");
    const turn = await send(
      ana.id,
      agent(
        opening("A pasta continua sem acesso.", {
          intent: "complemento",
          targetTicketId: "INC-20298",
          title: "Acesso à pasta Financeiro no SharePoint",
          category: "Acesso",
        }),
      ),
    );
    expect(turn.draft?.operation).toBe("update");
    const confirmed = await app.attendance.confirmDraft("ana", turn.draft?.id ?? "");
    const repeated = await app.attendance.confirmDraft("ana", turn.draft?.id ?? "");
    expect(confirmed.ticket.id).toBe("INC-20298");
    expect(repeated.ticket.description).toBe("A pasta continua sem acesso.");
    expect(await countTickets("ana")).toBe(before);
  });

  it("editar ou cancelar não grava chamado", async () => {
    const ana = await conversation("ana");
    const before = await countTickets("ana");
    const turn = await send(ana.id, agent(opening("texto original")));
    const draftId = turn.draft?.id ?? "";
    const edited = await app.attendance.editDraft("ana", draftId, {
      description: "texto editado",
    });
    expect(edited.status).toBe("pending");
    expect(edited.description).toBe("texto editado");
    expect(await countTickets("ana")).toBe(before);

    const cancelled = await app.attendance.cancelDraft("ana", draftId);
    expect(cancelled.status).toBe("cancelled");
    await expect(app.attendance.confirmDraft("ana", draftId)).rejects.toBeInstanceOf(AttendanceError);
    expect(await countTickets("ana")).toBe(before);
  });

  it("falha antes do commit deixa o rascunho confirmável", async () => {
    const ana = await conversation("ana");
    const before = await countTickets("ana");
    const turn = await send(ana.id, agent(opening("VPN")));
    app.tickets.setFailure("before-commit");
    await expect(app.attendance.confirmDraft("ana", turn.draft?.id ?? "")).rejects.toBeInstanceOf(
      TicketUnavailableError,
    );
    expect(await countTickets("ana")).toBe(before);

    app.tickets.setFailure("none");
    const confirmed = await app.attendance.confirmDraft("ana", turn.draft?.id ?? "");
    expect(confirmed.ticket.title).toBe("VPN");
    expect(await countTickets("ana")).toBe(before + 1);
  });
});

describe("transferência", () => {
  it.each([
    ["pedido", requestAnalyst()],
    ["critico", opening("A empresa parou", { impact: "empresa", urgency: "parado", category: "Outros" })],
    ["vencido", consultOverdue()],
    ["seguranca_baixa", unsure()],
  ] as const)("motivo %s pausa o agent na fala seguinte", async (reason, decision) => {
    const ana = await conversation("ana");
    const fake = agent(decision);
    const turn = await send(ana.id, fake, "preciso de ajuda");
    expect(turn.conversation.state).toBe("aguardando_analista");
    expect(turn.conversation.transferReason).toBe(reason);
    expect(turn.conversation.transferSummary).toContain(`Motivo: ${reason}`);
    expect(fake.calls).toBe(1);

    const next = await send(ana.id, fake, "mais um detalhe");
    expect(next.agentCalled).toBe(false);
    expect(next.paused).toBe(true);
    expect(fake.calls).toBe(1);
  });

  it("crítico transfere a conversa e só grava o chamado na confirmação", async () => {
    const ana = await conversation("ana");
    const before = await countTickets("ana");
    const turn = await send(
      ana.id,
      agent(opening("A empresa parou", { impact: "empresa", urgency: "parado", category: "Outros" })),
    );
    expect(turn.draft?.status).toBe("pending");
    expect(await countTickets("ana")).toBe(before);
    const confirmed = await app.attendance.confirmDraft("ana", turn.draft?.id ?? "");
    expect(confirmed.ticket.priority).toBe("critica");
    expect(confirmed.ticket.status).toBe("aguardando_analista");
    expect(await countTickets("ana")).toBe(before + 1);
  });
});

describe("analista", () => {
  it("assume só na espera, devolve da espera e do atendimento, e encerrar na espera falha", async () => {
    const ana = await conversation("ana");
    await expect(app.attendance.assume("rafael", ana.id)).rejects.toBeInstanceOf(AttendanceError);

    const fake = agent(requestAnalyst());
    await send(ana.id, fake);
    await expect(app.attendance.close("rafael", ana.id)).rejects.toBeInstanceOf(AttendanceError);
    expect((await app.conversations.findById(ana.id))?.state).toBe("aguardando_analista");

    const returned = await app.attendance.returnToAgent("rafael", ana.id, "Pede o print.");
    expect(returned.state).toBe("com_agent");
    expect(returned.transferSummary).toContain("Pede o print.");
    await send(ana.id, fake, "voltei");
    expect(fake.calls).toBe(2);

    await send(ana.id, fake, "de novo");
    expect(fake.calls).toBe(2);
    await app.attendance.assume("rafael", ana.id);
    const back = await app.attendance.returnToAgent("rafael", ana.id, null);
    expect(back.state).toBe("com_agent");
    await send(ana.id, fake, "depois de assumir");
    expect(fake.calls).toBe(3);

    await send(ana.id, fake, "para encerrar");
    expect(fake.calls).toBe(3);
    await app.attendance.assume("rafael", ana.id);
    const closed = await app.attendance.close("rafael", ana.id);
    expect(closed.state).toBe("encerrada");
    await expect(send(ana.id, fake, "depois de encerrar")).rejects.toBeInstanceOf(AttendanceError);
    expect(fake.calls).toBe(3);
  });
});

describe("limite de sessão", () => {
  it("a 31ª fala não chama o agent", async () => {
    const ana = await conversation("ana");
    const fake = agent(reply("Segue orientação."));
    for (let count = 0; count < 15; count += 1) {
      await send(ana.id, fake, `fala ${count}`);
    }
    expect(fake.calls).toBe(15);
    await expect(send(ana.id, fake, "fala extra")).rejects.toBeInstanceOf(AttendanceError);
    expect(fake.calls).toBe(15);
  });

  it("a 30ª fala entra e não chama o agent quando não cabe a resposta", async () => {
    const ana = await conversation("ana");
    await app.client.execute({
      sql: `UPDATE sessions SET message_count = 29 WHERE conversation_id = ?`,
      args: [ana.id],
    });
    const fake = agent(reply("Não devo aparecer."));
    const turn = await send(ana.id, fake, "última");
    expect(fake.calls).toBe(0);
    expect(turn.agentCalled).toBe(false);
    expect(turn.session.messageCount).toBe(30);
    await expect(send(ana.id, fake, "mais uma")).rejects.toBeInstanceOf(AttendanceError);
    expect(fake.calls).toBe(0);
  });
});

describe("regras que o código vence", () => {
  it("não abre rascunho para chamado de outra pessoa nem para reabertura vencida", async () => {
    const ana = await conversation("ana");
    const before = await countTickets("ana");
    const foreign = await send(
      ana.id,
      agent(opening("VPN do Bruno", { targetTicketId: "INC-20400" })),
    );
    expect(foreign.draft).toBeNull();
    expect(foreign.trace?.policyRefused).toBe(true);
    expect(foreign.trace?.appliedRule).toBe("chamado_alheio");

    const expired = await send(
      ana.id,
      agent(opening("Outlook antigo", { targetTicketId: "INC-19877", category: "E-mail" })),
    );
    expect(expired.draft).toBeNull();
    expect(expired.trace?.appliedRule).toBe("reabertura_expirada");
    expect(await countTickets("ana")).toBe(before);
  });
});

async function conversation(employeeId: string) {
  return app.conversations.findOrCreate(employeeId, new Date());
}

async function countTickets(employeeId: string): Promise<number> {
  return (await app.tickets.listByOwner(employeeId)).length;
}

function send(conversationId: string, fake: Agent, text = "mensagem") {
  return app.attendance.sendEmployeeMessage({
    employeeId: "ana",
    conversationId,
    text,
    agent: fake,
  });
}

function agent(decision: Decision): Agent & { calls: number } {
  return {
    calls: 0,
    decide() {
      this.calls += 1;
      return decision;
    },
  };
}

function reply(text: string): Decision {
  return decisionSchema.parse({
    intent: "duvida",
    confidence: "alto",
    evidence: [],
    rule: "nenhuma",
    proposedAction: "responder",
    impact: null,
    urgency: null,
    draft: null,
    options: [],
    reply: text,
  });
}

function requestAnalyst(): Decision {
  return decisionSchema.parse({
    ...reply("Vou chamar alguém."),
    intent: "falar_com_analista",
    proposedAction: "transferir",
  });
}

function unsure(): Decision {
  return decisionSchema.parse({
    ...reply("Acho que sei."),
    intent: "incerto",
    confidence: "baixo",
  });
}

function consultOverdue(): Decision {
  return decisionSchema.parse({
    ...reply("Achei o notebook."),
    intent: "consulta",
    evidence: [{ source: "chamado", id: "INC-20311", note: "notebook" }],
  });
}

function opening(
  description: string,
  patch: {
    intent?: Decision["intent"];
    impact?: Decision["impact"];
    urgency?: Decision["urgency"];
    category?: "Rede e VPN" | "Acesso" | "Outros" | "E-mail";
    title?: string;
    targetTicketId?: string;
  } = {},
): Decision {
  return decisionSchema.parse({
    intent: patch.intent ?? "abertura",
    confidence: "alto",
    evidence: [],
    rule: "nenhuma",
    proposedAction: "propor_rascunho",
    impact: patch.impact ?? "pessoa",
    urgency: patch.urgency ?? "ha_alternativa",
    draft: {
      title: patch.title ?? description,
      description,
      type: "INC",
      category: patch.category ?? "Rede e VPN",
      targetTicketId: patch.targetTicketId ?? null,
    },
    options: [],
    reply: "Montei um rascunho.",
  });
}
