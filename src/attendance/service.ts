import { randomUUID } from "node:crypto";

import type { Client, Row, Transaction } from "@libsql/client";
import { z } from "zod";

import type { Conversation, ConversationState } from "../conversations/store";
import { canAcceptSessionMessage, classifyPriority, SESSION_MESSAGE_LIMIT, slaDueAt } from "../policy";
import { TicketNotFoundError, type Ticket, type TicketService } from "../tickets";
import { categorySchema, ticketTypeSchema } from "../tickets/types";

import { decisionSchema, type Agent, type Decision, type TransferReason } from "./decision";
import { AttendanceError } from "./errors";
import { applyGate, type DraftPlan, type GateResult } from "./gate";

const payloadSchema = z.object({
  operation: z.enum(["create", "update", "reopen"]),
  title: z.string().min(1),
  description: z.string().min(1),
  type: ticketTypeSchema,
  category: categorySchema,
  targetTicketId: z.string().nullable(),
  impact: z.enum(["pessoa", "equipe", "empresa"]),
  urgency: z.enum(["parado", "impede_trabalho", "compromisso_hoje", "ha_alternativa", "sem_urgencia"]),
  priority: z.enum(["critica", "alta", "media", "baixa"]),
  slaDueAt: z.string().min(1),
  handoff: z.boolean(),
});

type DraftRecord = {
  id: string;
  publicCode: string;
  conversationId: string;
  employeeId: string;
  status: "pending" | "executed" | "cancelled";
  idempotencyKey: string;
  ticketId: string | null;
  payload: DraftPlan;
};

export type Turn = {
  agentCalled: boolean;
  paused: boolean;
  reply: string | null;
  conversation: {
    id: string;
    state: ConversationState;
    transferReason: string | null;
    transferSummary: string | null;
  };
  session: { messageCount: number; limit: number };
  visibleActions: string[];
  options: string[];
  trace: {
    intent: Decision["intent"];
    evidence: Decision["evidence"];
    citedRule: string;
    appliedRule: string;
    proposedAction: Decision["proposedAction"];
    takenAction: Decision["proposedAction"];
    confidence: Decision["confidence"];
    policyRefused: boolean;
    transferReason: TransferReason | null;
    priority: string | null;
    slaDueAt: string | null;
  } | null;
  draft: DraftCard | null;
};

export type DraftCard = {
  id: string;
  publicCode: string;
  status: DraftRecord["status"];
  operation: DraftPlan["operation"];
  title: string;
  description: string;
  type: DraftPlan["type"];
  category: DraftPlan["category"];
  priority: DraftPlan["priority"];
  slaDueAt: string;
  targetTicketId: string | null;
};

export class Attendance {
  constructor(
    private readonly client: Client,
    private readonly tickets: TicketService,
    private readonly conversations: {
      findOwned(employeeId: string, conversationId: string): Promise<Conversation | null>;
      findById(conversationId: string): Promise<Conversation | null>;
    },
  ) {}

  async sendEmployeeMessage(input: {
    employeeId: string;
    conversationId: string;
    text: string;
    agent: Agent;
    now?: Date;
  }): Promise<Turn> {
    const now = input.now ?? new Date();
    const conversation = await this.owned(input.employeeId, input.conversationId);
    if (conversation.state === "encerrada") {
      throw new AttendanceError("Esta conversa está encerrada.", 409);
    }

    const session = await this.sessionOf(conversation, now);
    if (!canAcceptSessionMessage(session.messageCount)) {
      throw new AttendanceError("Limite de 30 mensagens nesta sessão.", 422);
    }

    if (conversation.state !== "com_agent") {
      const messageCount = await this.persistEmployeeOnly(conversation, session.id, input.text, now);
      return this.turn(await this.reload(conversation.id), messageCount, {
        agentCalled: false,
        paused: true,
        reply: null,
      });
    }

    if (!canAcceptSessionMessage(session.messageCount + 1)) {
      const messageCount = await this.persistEmployeeOnly(conversation, session.id, input.text, now);
      return this.turn(await this.reload(conversation.id), messageCount, {
        agentCalled: false,
        paused: false,
        reply: "A sessão chegou em 30 mensagens. O agent não foi chamado.",
      });
    }

    const decision = decisionSchema.parse(
      input.agent.decide({
        message: input.text,
        employeeId: input.employeeId,
        conversationId: input.conversationId,
      }),
    );
    const ownedTickets = await this.tickets.listByOwner(input.employeeId, now);
    const gate = applyGate(decision, ownedTickets, now);
    const saved = await this.persistAgentTurn(conversation, session.id, input.text, decision, gate, now);
    return this.turn(saved.conversation, saved.messageCount, {
      agentCalled: true,
      paused: false,
      reply: gate.reply,
      visibleActions: gate.visibleActions,
      options: gate.options,
      trace: traceOf(decision, gate),
      draft: saved.draft,
    });
  }

  async confirmDraft(employeeId: string, draftId: string, now = new Date()): Promise<{ draft: DraftCard; ticket: Ticket }> {
    const draft = await this.ownedDraft(employeeId, draftId);
    if (draft.status === "executed" && draft.ticketId) {
      const ticket = await this.tickets.findByNumber(employeeId, draft.ticketId, now);
      if (!ticket) {
        throw new AttendanceError("Chamado não encontrado.", 404);
      }
      return { draft: cardOf(draft), ticket };
    }
    if (draft.status !== "pending") {
      throw new AttendanceError("Esse rascunho não está pendente.", 409);
    }

    const ticket = await this.writeTicket(employeeId, draft, now);
    const executed = await this.markDraft(draft.id, "executed", ticket.id, now);
    return { draft: cardOf(executed), ticket };
  }

  async editDraft(
    employeeId: string,
    draftId: string,
    input: { title?: string; description: string },
    now = new Date(),
  ): Promise<DraftCard> {
    const draft = await this.pendingDraft(employeeId, draftId);
    const priority = classifyPriority({ impact: draft.payload.impact, urgency: draft.payload.urgency });
    if (priority.kind !== "decided") {
      throw new AttendanceError("O rascunho está sem impacto ou urgência.", 409);
    }
    const next: DraftPlan = {
      ...draft.payload,
      title: input.title?.trim() || draft.payload.title,
      description: input.description,
      priority: priority.priority,
      slaDueAt: slaDueAt(priority.priority, now).toISOString(),
    };
    await this.client.execute({
      sql: `UPDATE drafts SET payload = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
      args: [JSON.stringify(next), now.toISOString(), draft.id],
    });
    return cardOf({ ...draft, payload: next });
  }

  async cancelDraft(employeeId: string, draftId: string, now = new Date()): Promise<DraftCard> {
    const draft = await this.pendingDraft(employeeId, draftId);
    const cancelled = await this.markDraft(draft.id, "cancelled", null, now);
    return cardOf(cancelled);
  }

  async assume(analystId: string, conversationId: string, now = new Date()): Promise<Conversation> {
    const conversation = await this.existing(conversationId);
    if (conversation.state !== "aguardando_analista") {
      throw new AttendanceError("Só dá para assumir uma conversa que está aguardando analista.", 409);
    }
    await this.client.execute({
      sql: `UPDATE conversations SET state = 'em_atendimento', analyst_id = ?, updated_at = ? WHERE id = ?`,
      args: [analystId, now.toISOString(), conversationId],
    });
    return this.existing(conversationId);
  }

  async returnToAgent(
    analystId: string,
    conversationId: string,
    note: string | null,
    now = new Date(),
  ): Promise<Conversation> {
    const conversation = await this.existing(conversationId);
    if (conversation.state !== "aguardando_analista" && conversation.state !== "em_atendimento") {
      throw new AttendanceError("Só dá para devolver uma conversa que está com a fila ou em atendimento.", 409);
    }
    if (conversation.state === "em_atendimento" && conversation.analystId !== analystId) {
      throw new AttendanceError("Outro analista está neste atendimento.", 409);
    }
    const summary = note?.trim()
      ? `${conversation.transferSummary ?? ""}\nOrientação do analista: ${note.trim()}`.trim()
      : conversation.transferSummary;
    await this.client.execute({
      sql: `UPDATE conversations
            SET state = 'com_agent', analyst_id = NULL, transfer_summary = ?, updated_at = ?
            WHERE id = ?`,
      args: [summary, now.toISOString(), conversationId],
    });
    return this.existing(conversationId);
  }

  async close(analystId: string, conversationId: string, now = new Date()): Promise<Conversation> {
    const conversation = await this.existing(conversationId);
    if (conversation.state !== "em_atendimento") {
      throw new AttendanceError("Encerre depois de assumir o atendimento.", 409);
    }
    if (conversation.analystId !== analystId) {
      throw new AttendanceError("Outro analista está neste atendimento.", 409);
    }
    await this.client.execute({
      sql: `UPDATE conversations SET state = 'encerrada', updated_at = ? WHERE id = ?`,
      args: [now.toISOString(), conversationId],
    });
    return this.existing(conversationId);
  }

  private async writeTicket(employeeId: string, draft: DraftRecord, now: Date): Promise<Ticket> {
    const payload = draft.payload;
    const ticket =
      payload.operation === "create"
        ? await this.tickets.create(
            {
              ownerId: employeeId,
              type: payload.type,
              category: payload.category,
              title: payload.title,
              description: payload.description,
              impact: payload.impact,
              urgency: payload.urgency,
            },
            draft.idempotencyKey,
            now,
          )
        : payload.operation === "update"
          ? await this.tickets.update(
              {
                ownerId: employeeId,
                ticketId: payload.targetTicketId ?? "",
                description: payload.description,
              },
              draft.idempotencyKey,
              now,
            )
          : await this.tickets.reopen(employeeId, payload.targetTicketId ?? "", draft.idempotencyKey, now);

    if (!payload.handoff) {
      return ticket;
    }
    try {
      return await this.tickets.transfer(employeeId, ticket.id, `${draft.idempotencyKey}:transfer`, now);
    } catch (error) {
      if (error instanceof TicketNotFoundError) {
        throw new AttendanceError("Chamado não encontrado.", 404);
      }
      throw error;
    }
  }

  private async persistEmployeeOnly(
    conversation: Conversation,
    sessionId: string,
    text: string,
    now: Date,
  ): Promise<number> {
    const tx = await this.client.transaction("write");
    try {
      await insertMessage(tx, sessionId, "employee", text, null, now, true);
      const messageCount = await bumpSession(tx, sessionId, 1);
      await touch(tx, conversation.id, now);
      await tx.commit();
      return messageCount;
    } catch (error) {
      if (!tx.closed) {
        await tx.rollback();
      }
      throw error;
    }
  }

  private async persistAgentTurn(
    conversation: Conversation,
    sessionId: string,
    text: string,
    decision: Decision,
    gate: GateResult,
    now: Date,
  ): Promise<{ conversation: Conversation; messageCount: number; draft: DraftCard | null }> {
    const tx = await this.client.transaction("write");
    try {
      await insertMessage(tx, sessionId, "employee", text, null, now, true);
      const agentMessageId = await insertMessage(tx, sessionId, "agent", gate.reply, JSON.stringify({
        visibleActions: gate.visibleActions,
        options: gate.options,
      }), now, true);
      await insertTrace(tx, agentMessageId, decision, gate, now);
      const draft = gate.draft ? await insertDraft(tx, conversation, gate.draft, now) : null;
      const messageCount = await bumpSession(tx, sessionId, 2);
      if (gate.transferReason) {
        await tx.execute({
          sql: `UPDATE conversations
                SET state = 'aguardando_analista', transfer_summary = ?, transfer_reason = ?, updated_at = ?
                WHERE id = ?`,
          args: [buildSummary(text, decision, gate), gate.transferReason, now.toISOString(), conversation.id],
        });
      } else {
        await touch(tx, conversation.id, now);
      }
      await tx.commit();
      return { conversation: await this.reload(conversation.id), messageCount, draft: draft ? cardOf(draft) : null };
    } catch (error) {
      if (!tx.closed) {
        await tx.rollback();
      }
      throw error;
    }
  }

  private async owned(employeeId: string, conversationId: string): Promise<Conversation> {
    const conversation = await this.conversations.findOwned(employeeId, conversationId);
    if (!conversation) {
      throw new AttendanceError("Conversa não encontrada.", 404);
    }
    return conversation;
  }

  private async existing(conversationId: string): Promise<Conversation> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) {
      throw new AttendanceError("Conversa não encontrada.", 404);
    }
    return conversation;
  }

  private async reload(conversationId: string): Promise<Conversation> {
    return this.existing(conversationId);
  }

  private async sessionOf(conversation: Conversation, now: Date): Promise<{ id: string; messageCount: number }> {
    if (conversation.activeSessionId) {
      const found = await this.client.execute({
        sql: `SELECT id, message_count FROM sessions WHERE id = ?`,
        args: [conversation.activeSessionId],
      });
      const row = found.rows[0];
      if (row) {
        return { id: text(row, "id"), messageCount: integer(row, "message_count") };
      }
    }
    const id = randomUUID();
    await this.client.execute({
      sql: `INSERT INTO sessions (
        id, conversation_id, message_count, summary_of_previous, opened_at, closed_at
      ) VALUES (?, ?, 0, NULL, ?, NULL)`,
      args: [id, conversation.id, now.toISOString()],
    });
    await this.client.execute({
      sql: `UPDATE conversations SET active_session_id = ? WHERE id = ?`,
      args: [id, conversation.id],
    });
    return { id, messageCount: 0 };
  }

  private async ownedDraft(employeeId: string, draftId: string): Promise<DraftRecord> {
    const result = await this.client.execute({
      sql: `SELECT id, public_code, conversation_id, employee_id, operation, payload, idempotency_key, status, ticket_id
            FROM drafts WHERE id = ? AND employee_id = ?`,
      args: [draftId, employeeId],
    });
    const row = result.rows[0];
    if (!row) {
      throw new AttendanceError("Rascunho não encontrado.", 404);
    }
    return toDraft(row);
  }

  private async pendingDraft(employeeId: string, draftId: string): Promise<DraftRecord> {
    const draft = await this.ownedDraft(employeeId, draftId);
    if (draft.status !== "pending") {
      throw new AttendanceError("Esse rascunho não está pendente.", 409);
    }
    return draft;
  }

  private async markDraft(
    draftId: string,
    status: DraftRecord["status"],
    ticketId: string | null,
    now: Date,
  ): Promise<DraftRecord> {
    await this.client.execute({
      sql: `UPDATE drafts SET status = ?, ticket_id = ?, updated_at = ? WHERE id = ?`,
      args: [status, ticketId, now.toISOString(), draftId],
    });
    const result = await this.client.execute({
      sql: `SELECT id, public_code, conversation_id, employee_id, operation, payload, idempotency_key, status, ticket_id
            FROM drafts WHERE id = ?`,
      args: [draftId],
    });
    const row = result.rows[0];
    if (!row) {
      throw new AttendanceError("Rascunho não encontrado.", 404);
    }
    return toDraft(row);
  }

  private turn(
    conversation: Conversation,
    messageCount: number,
    extra: {
      agentCalled: boolean;
      paused: boolean;
      reply: string | null;
      visibleActions?: string[];
      options?: string[];
      trace?: Turn["trace"];
      draft?: DraftCard | null;
    },
  ): Turn {
    return {
      agentCalled: extra.agentCalled,
      paused: extra.paused,
      reply: extra.reply,
      conversation: {
        id: conversation.id,
        state: conversation.state,
        transferReason: conversation.transferReason,
        transferSummary: conversation.transferSummary,
      },
      session: { messageCount, limit: SESSION_MESSAGE_LIMIT },
      visibleActions: extra.visibleActions ?? [],
      options: extra.options ?? [],
      trace: extra.trace ?? null,
      draft: extra.draft ?? null,
    };
  }
}

async function insertMessage(
  tx: Transaction,
  sessionId: string,
  author: string,
  body: string,
  payload: string | null,
  now: Date,
  counts: boolean,
): Promise<string> {
  const id = randomUUID();
  await tx.execute({
    sql: `INSERT INTO messages (
      id, session_id, author, body, payload, created_at, counts_toward_limit
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, sessionId, author, body, payload, now.toISOString(), counts ? 1 : 0],
  });
  return id;
}

async function bumpSession(tx: Transaction, sessionId: string, delta: number): Promise<number> {
  const current = await tx.execute({
    sql: `SELECT message_count FROM sessions WHERE id = ?`,
    args: [sessionId],
  });
  const row = current.rows[0];
  if (!row) {
    throw new AttendanceError("Sessão não encontrada.", 404);
  }
  const messageCount = integer(row, "message_count") + delta;
  await tx.execute({
    sql: `UPDATE sessions SET message_count = ? WHERE id = ?`,
    args: [messageCount, sessionId],
  });
  return messageCount;
}

async function touch(tx: Transaction, conversationId: string, now: Date): Promise<void> {
  await tx.execute({
    sql: `UPDATE conversations SET updated_at = ? WHERE id = ?`,
    args: [now.toISOString(), conversationId],
  });
}

async function insertTrace(tx: Transaction, messageId: string, decision: Decision, gate: GateResult, now: Date): Promise<void> {
  await tx.execute({
    sql: `INSERT INTO decision_traces (
      id, message_id, intent, evidence, cited_rule, applied_rule, proposed_action, taken_action,
      confidence, priority, sla_due_at, policy_refused, transfer_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      messageId,
      decision.intent,
      JSON.stringify(decision.evidence),
      decision.rule,
      gate.appliedRule,
      decision.proposedAction,
      gate.takenAction,
      gate.confidence,
      gate.draft?.priority ?? null,
      gate.draft?.slaDueAt ?? null,
      gate.policyRefused ? 1 : 0,
      gate.transferReason,
      now.toISOString(),
    ],
  });
}

async function insertDraft(
  tx: Transaction,
  conversation: Conversation,
  plan: DraftPlan,
  now: Date,
): Promise<DraftRecord> {
  const count = await tx.execute("SELECT COUNT(*) AS total FROM drafts");
  const publicCode = `D-${String(Number(count.rows[0]?.total ?? 0) + 1).padStart(3, "0")}`;
  const draft: DraftRecord = {
    id: randomUUID(),
    publicCode,
    conversationId: conversation.id,
    employeeId: conversation.employeeId,
    status: "pending",
    idempotencyKey: randomUUID(),
    ticketId: null,
    payload: plan,
  };
  const instant = now.toISOString();
  await tx.execute({
    sql: `INSERT INTO drafts (
      id, public_code, conversation_id, employee_id, operation, payload, idempotency_key, status, ticket_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`,
    args: [
      draft.id,
      draft.publicCode,
      draft.conversationId,
      draft.employeeId,
      plan.operation,
      JSON.stringify(plan),
      draft.idempotencyKey,
      instant,
      instant,
    ],
  });
  return draft;
}

function buildSummary(text: string, decision: Decision, gate: GateResult): string {
  const cited = decision.evidence.filter((item) => item.source === "chamado").map((item) => item.id);
  if (gate.draft?.targetTicketId && !cited.includes(gate.draft.targetTicketId)) {
    cited.push(gate.draft.targetTicketId);
  }
  return [
    `Pedido: ${text}`,
    `Chamados: ${cited.join(", ") || "nenhum"}`,
    `Decisão: ${decision.intent} / ${gate.takenAction}`,
    `Prioridade: ${gate.draft?.priority ?? "nenhuma"}`,
    `Motivo: ${gate.transferReason}`,
  ].join("\n");
}

function traceOf(decision: Decision, gate: GateResult): Turn["trace"] {
  return {
    intent: decision.intent,
    evidence: decision.evidence,
    citedRule: decision.rule,
    appliedRule: gate.appliedRule,
    proposedAction: decision.proposedAction,
    takenAction: gate.takenAction,
    confidence: gate.confidence,
    policyRefused: gate.policyRefused,
    transferReason: gate.transferReason,
    priority: gate.draft?.priority ?? null,
    slaDueAt: gate.draft?.slaDueAt ?? null,
  };
}

function cardOf(draft: DraftRecord): DraftCard {
  return {
    id: draft.id,
    publicCode: draft.publicCode,
    status: draft.status,
    operation: draft.payload.operation,
    title: draft.payload.title,
    description: draft.payload.description,
    type: draft.payload.type,
    category: draft.payload.category,
    priority: draft.payload.priority,
    slaDueAt: draft.payload.slaDueAt,
    targetTicketId: draft.payload.targetTicketId,
  };
}

function toDraft(row: Row): DraftRecord {
  const payload = payloadSchema.parse(JSON.parse(text(row, "payload")));
  return {
    id: text(row, "id"),
    publicCode: text(row, "public_code"),
    conversationId: text(row, "conversation_id"),
    employeeId: text(row, "employee_id"),
    status: z.enum(["pending", "executed", "cancelled"]).parse(text(row, "status")),
    idempotencyKey: text(row, "idempotency_key"),
    ticketId: row.ticket_id === null ? null : text(row, "ticket_id"),
    payload,
  };
}

function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`Coluna ${column} sem texto.`);
  }
  return value;
}

function integer(row: Row, column: string): number {
  const value = row[column];
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new Error(`Coluna ${column} sem inteiro.`);
}
