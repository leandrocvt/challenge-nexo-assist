import type { Client, Row } from "@libsql/client";
import { z } from "zod";

import { conversationStateSchema, type ConversationState } from "../conversations/store";

export const queueFilterSchema = z.enum(["todas", "para_voce", "com_agent", "minhas"]);

export type QueueFilter = z.infer<typeof queueFilterSchema>;

export type ConversationRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  state: ConversationState;
  analystId: string | null;
  transferReason: string | null;
  transferSummary: string | null;
  lastMessage: string | null;
  updatedAt: string;
};

export type HistoryMessage = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  countsTowardLimit: boolean;
  visibleActions: string[];
  options: string[];
  trace: {
    intent: string;
    evidence: unknown;
    citedRule: string;
    appliedRule: string;
    proposedAction: string;
    takenAction: string;
    confidence: string;
    policyRefused: boolean;
    transferReason: string | null;
    priority: string | null;
    slaDueAt: string | null;
  } | null;
};

const draftCardSchema = z.object({
  operation: z.enum(["create", "update", "reopen"]),
  title: z.string(),
  description: z.string(),
  type: z.string(),
  category: z.string(),
  priority: z.string(),
  slaDueAt: z.string(),
  targetTicketId: z.string().nullable(),
  impact: z.enum(["pessoa", "equipe", "empresa"]).optional(),
});

export async function listConversations(
  client: Client,
  input: { employeeId?: string; analystId?: string; filter?: QueueFilter; query?: string },
): Promise<ConversationRow[]> {
  const clauses = ["1 = 1"];
  const args: Array<string> = [];
  if (input.employeeId) {
    clauses.push("c.employee_id = ?");
    args.push(input.employeeId);
  }
  if (input.filter === "para_voce") {
    clauses.push("c.state = 'aguardando_analista' AND c.analyst_id IS NULL");
  }
  if (input.filter === "com_agent") {
    clauses.push("c.state = 'com_agent'");
  }
  if (input.filter === "minhas") {
    clauses.push("c.state = 'em_atendimento' AND c.analyst_id = ?");
    args.push(input.analystId ?? "");
  }
  const query = input.query?.trim() ?? "";
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    clauses.push(`(
      e.name LIKE ? ESCAPE '\\'
      OR IFNULL(c.transfer_summary, '') LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE s.conversation_id = c.id AND m.body LIKE ? ESCAPE '\\'
      )
    )`);
    args.push(pattern, pattern, pattern);
  }

  const result = await client.execute({
    sql: `SELECT
      c.id, c.employee_id, e.name AS employee_name, c.state, c.analyst_id,
      c.transfer_reason, c.transfer_summary, c.updated_at,
      (
        SELECT m.body FROM messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE s.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message
    FROM conversations c
    JOIN employees e ON e.id = c.employee_id
    WHERE ${clauses.join(" AND ")}
    ORDER BY c.updated_at DESC`,
    args,
  });
  return result.rows.map(toRow);
}

export async function readHistory(client: Client, conversationId: string) {
  const messages = await client.execute({
    sql: `SELECT
      m.id, m.author, m.body, m.payload, m.created_at, m.counts_toward_limit,
      t.intent, t.evidence, t.cited_rule, t.applied_rule, t.proposed_action, t.taken_action,
      t.confidence, t.priority, t.sla_due_at, t.policy_refused, t.transfer_reason
    FROM messages m
    JOIN sessions s ON s.id = m.session_id
    LEFT JOIN decision_traces t ON t.message_id = m.id
    WHERE s.conversation_id = ?
    ORDER BY m.created_at ASC`,
    args: [conversationId],
  });
  const session = await client.execute({
    sql: `SELECT message_count FROM sessions
          WHERE id = (SELECT active_session_id FROM conversations WHERE id = ?)`,
    args: [conversationId],
  });
  const draft = await client.execute({
    sql: `SELECT id, public_code, status, payload FROM drafts
          WHERE conversation_id = ? AND status = 'pending'
          ORDER BY created_at DESC LIMIT 1`,
    args: [conversationId],
  });
  return {
    messages: messages.rows.map(toMessage),
    draft: draft.rows[0] ? toDraftCard(draft.rows[0]) : null,
    session: {
      messageCount: session.rows[0] ? integer(session.rows[0], "message_count") : 0,
      limit: 30,
    },
  };
}

function toRow(row: Row): ConversationRow {
  return {
    id: text(row, "id"),
    employeeId: text(row, "employee_id"),
    employeeName: text(row, "employee_name"),
    state: conversationStateSchema.parse(text(row, "state")),
    analystId: optionalText(row, "analyst_id"),
    transferReason: optionalText(row, "transfer_reason"),
    transferSummary: optionalText(row, "transfer_summary"),
    lastMessage: optionalText(row, "last_message"),
    updatedAt: text(row, "updated_at"),
  };
}

function toMessage(row: Row): HistoryMessage {
  const payload = parsePayload(row.payload);
  const hasTrace = row.intent !== null && row.intent !== undefined;
  return {
    id: text(row, "id"),
    author: text(row, "author"),
    body: text(row, "body"),
    createdAt: text(row, "created_at"),
    countsTowardLimit: integer(row, "counts_toward_limit") === 1,
    visibleActions: payload.visibleActions,
    options: payload.options,
    trace: hasTrace
      ? {
          intent: text(row, "intent"),
          evidence: parseEvidence(row.evidence),
          citedRule: text(row, "cited_rule"),
          appliedRule: text(row, "applied_rule"),
          proposedAction: text(row, "proposed_action"),
          takenAction: text(row, "taken_action"),
          confidence: text(row, "confidence"),
          policyRefused: integer(row, "policy_refused") === 1,
          transferReason: optionalText(row, "transfer_reason"),
          priority: optionalText(row, "priority"),
          slaDueAt: optionalText(row, "sla_due_at"),
        }
      : null,
  };
}

function toDraftCard(row: Row) {
  const payload = draftCardSchema.parse(JSON.parse(text(row, "payload")));
  return {
    id: text(row, "id"),
    publicCode: text(row, "public_code"),
    status: text(row, "status"),
    ...payload,
  };
}

function parsePayload(value: unknown): { visibleActions: string[]; options: string[] } {
  if (typeof value !== "string") {
    return { visibleActions: [], options: [] };
  }
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null) {
    return { visibleActions: [], options: [] };
  }
  return {
    visibleActions: stringList(parsed, "visibleActions"),
    options: stringList(parsed, "options"),
  };
}

function stringList(value: object, key: string): string[] {
  const list = (value as Record<string, unknown>)[key];
  return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
}

function parseEvidence(value: unknown): unknown {
  if (typeof value !== "string") {
    return [];
  }
  return JSON.parse(value);
}

function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`Coluna ${column} sem texto.`);
  }
  return value;
}

function optionalText(row: Row, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Coluna ${column} inválida.`);
  }
  return value;
}

function integer(row: Row, column: string): number {
  const value = row[column];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new Error(`Coluna ${column} sem inteiro.`);
}
