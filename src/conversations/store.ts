import { randomUUID } from "node:crypto";

import type { Client, Row, Transaction } from "@libsql/client";
import { z } from "zod";

export const conversationStateSchema = z.enum([
  "com_agent",
  "aguardando_analista",
  "em_atendimento",
  "encerrada",
]);

export type ConversationState = z.infer<typeof conversationStateSchema>;

export type Conversation = {
  id: string;
  employeeId: string;
  state: ConversationState;
};

const COLUMNS = "id, employee_id, state";

export class ConversationStore {
  constructor(private readonly client: Client) {}

  async findOrCreate(employeeId: string, now: Date): Promise<Conversation> {
    const tx = await this.client.transaction("write");
    try {
      const existing = await tx.execute({
        sql: `SELECT ${COLUMNS} FROM conversations
              WHERE employee_id = ? AND state != 'encerrada'
              ORDER BY updated_at DESC
              LIMIT 1`,
        args: [employeeId],
      });
      const row = existing.rows[0];
      if (row) {
        await tx.commit();
        return toConversation(row);
      }

      const created = await insertConversation(tx, employeeId, now);
      await tx.commit();
      return created;
    } catch (error) {
      if (!tx.closed) {
        await tx.rollback();
      }
      throw error;
    }
  }

  async findOwned(employeeId: string, conversationId: string): Promise<Conversation | null> {
    const result = await this.client.execute({
      sql: `SELECT ${COLUMNS} FROM conversations WHERE id = ? AND employee_id = ?`,
      args: [conversationId, employeeId],
    });
    const row = result.rows[0];
    return row ? toConversation(row) : null;
  }
}

async function insertConversation(
  tx: Transaction,
  employeeId: string,
  now: Date,
): Promise<Conversation> {
  const id = randomUUID();
  const instant = now.toISOString();
  await tx.execute({
    sql: `INSERT INTO conversations (
      id, employee_id, state, analyst_id, active_session_id,
      transfer_summary, transfer_reason, created_at, updated_at
    ) VALUES (?, ?, 'com_agent', NULL, NULL, NULL, NULL, ?, ?)`,
    args: [id, employeeId, instant, instant],
  });
  return { id, employeeId, state: "com_agent" };
}

function toConversation(row: Row): Conversation {
  return {
    id: text(row, "id"),
    employeeId: text(row, "employee_id"),
    state: conversationStateSchema.parse(text(row, "state")),
  };
}

function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`Coluna ${column} sem texto.`);
  }
  return value;
}
