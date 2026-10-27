import type { Client, Row, Transaction } from "@libsql/client";

import {
  canReopen,
  classifyPriority,
  isOverdue,
  slaDueAt,
  ticketStatusSchema,
  type Priority,
} from "../policy";

import { migrate, openDatabase } from "./db";
import { seed as seedDatabase } from "./seed";
import { TicketNotFoundError, TicketRuleError, TicketUnavailableError } from "./errors";
import {
  categorySchema,
  createTicketSchema,
  ticketTypeSchema,
  updateTicketSchema,
  type CreateTicketInput,
  type FailureMode,
  type Ticket,
  type UpdateTicketInput,
} from "./types";

const TICKET_COLUMNS = `id, owner_id, type, category, subject_detail, impact, urgency,
  priority, title, description, status, sla_due_at, created_at, updated_at, resolved_at`;

export class TicketService {
  private failure: FailureMode = "none";

  private constructor(private readonly client: Client) {}

  static async open(filePath: string): Promise<TicketService> {
    const client = openDatabase(filePath);
    await migrate(client);
    return new TicketService(client);
  }

  setFailure(mode: FailureMode): void {
    this.failure = mode;
  }

  async seed(now: Date): Promise<void> {
    await seedDatabase(this.client, now);
  }

  async countArticles(): Promise<number> {
    const result = await this.client.execute("SELECT COUNT(*) AS total FROM articles");
    return Number(result.rows[0]?.total ?? 0);
  }

  close(): void {
    this.client.close();
  }

  async listByOwner(ownerId: string, now = new Date()): Promise<Ticket[]> {
    const result = await this.client.execute({
      sql: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE owner_id = ? ORDER BY updated_at DESC`,
      args: [ownerId],
    });
    return result.rows.map((row) => toTicket(row, now));
  }

  async findByNumber(
    ownerId: string,
    ticketId: string,
    now = new Date(),
  ): Promise<Ticket | null> {
    const result = await this.client.execute({
      sql: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = ? AND owner_id = ?`,
      args: [ticketId, ownerId],
    });
    const row = result.rows[0];
    return row ? toTicket(row, now) : null;
  }

  async create(
    input: CreateTicketInput,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<Ticket> {
    const data = createTicketSchema.parse(input);
    const decision = classifyPriority({
      impact: data.impact,
      urgency: data.urgency,
    });
    if (decision.kind !== "decided") {
      throw new TicketRuleError("Impacto e urgência são obrigatórios para abrir chamado.");
    }

    return this.write(async (tx) => {
      const existing = await this.ticketByKey(tx, idempotencyKey, now);
      if (existing) {
        return existing;
      }

      const id = await nextTicketId(tx, data.type);
      const dueAt = slaDueAt(decision.priority, now);
      await tx.execute({
        sql: `INSERT INTO tickets (
          id, owner_id, type, category, subject_detail, impact, urgency, priority,
          title, description, status, sla_due_at, created_at, updated_at, resolved_at,
          idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'em_andamento', ?, ?, ?, NULL, ?)`,
        args: [
          id,
          data.ownerId,
          data.type,
          data.category,
          data.subjectDetail ?? null,
          data.impact,
          data.urgency,
          decision.priority,
          data.title,
          data.description,
          dueAt.toISOString(),
          now.toISOString(),
          now.toISOString(),
          idempotencyKey,
        ],
      });
      await recordOperation(tx, idempotencyKey, id, "create", now);
      return readOwned(tx, data.ownerId, id, now);
    });
  }

  async update(
    input: UpdateTicketInput,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<Ticket> {
    const data = updateTicketSchema.parse(input);
    return this.write(async (tx) => {
      const existing = await this.ticketByKey(tx, idempotencyKey, now);
      if (existing) {
        return existing;
      }

      const current = await readOwned(tx, data.ownerId, data.ticketId, now);
      if (current.status === "resolvido" || current.status === "aprovado") {
        throw new TicketRuleError("Chamado encerrado se atualiza por reabertura, não por complemento.");
      }
      const dueAt = slaDueAt(current.priority, now);
      await tx.execute({
        sql: `UPDATE tickets
              SET description = ?, updated_at = ?, sla_due_at = ?
              WHERE id = ? AND owner_id = ?`,
        args: [
          data.description,
          now.toISOString(),
          dueAt.toISOString(),
          data.ticketId,
          data.ownerId,
        ],
      });
      await recordOperation(tx, idempotencyKey, data.ticketId, "update", now);
      return readOwned(tx, data.ownerId, data.ticketId, now);
    });
  }

  async reopen(
    ownerId: string,
    ticketId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<Ticket> {
    return this.write(async (tx) => {
      const existing = await this.ticketByKey(tx, idempotencyKey, now);
      if (existing) {
        return existing;
      }

      const current = await readOwned(tx, ownerId, ticketId, now);
      if (current.status !== "resolvido" || !current.resolvedAt) {
        throw new TicketRuleError("Só um chamado resolvido pode ser reaberto.");
      }
      if (!canReopen(current.resolvedAt, now)) {
        throw new TicketRuleError("O chamado foi resolvido há mais de 7 dias.");
      }

      const dueAt = slaDueAt(current.priority, now);
      await tx.execute({
        sql: `UPDATE tickets
              SET status = 'em_andamento', resolved_at = NULL, updated_at = ?, sla_due_at = ?
              WHERE id = ? AND owner_id = ?`,
        args: [now.toISOString(), dueAt.toISOString(), ticketId, ownerId],
      });
      await recordOperation(tx, idempotencyKey, ticketId, "reopen", now);
      return readOwned(tx, ownerId, ticketId, now);
    });
  }

  async transfer(
    ownerId: string,
    ticketId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<Ticket> {
    return this.write(async (tx) => {
      const existing = await this.ticketByKey(tx, idempotencyKey, now);
      if (existing) {
        return existing;
      }

      await readOwned(tx, ownerId, ticketId, now);
      await tx.execute({
        sql: `UPDATE tickets
              SET status = 'aguardando_analista', updated_at = ?
              WHERE id = ? AND owner_id = ?`,
        args: [now.toISOString(), ticketId, ownerId],
      });
      await recordOperation(tx, idempotencyKey, ticketId, "transfer", now);
      return readOwned(tx, ownerId, ticketId, now);
    });
  }

  private async write(work: (tx: Transaction) => Promise<Ticket>): Promise<Ticket> {
    const tx = await this.client.transaction("write");
    try {
      const ticket = await work(tx);
      if (this.failure === "before-commit") {
        throw new TicketUnavailableError();
      }
      await tx.commit();
      if (this.failure === "after-commit") {
        throw new TicketUnavailableError();
      }
      return ticket;
    } catch (error) {
      if (!tx.closed) {
        await tx.rollback();
      }
      throw error;
    }
  }

  private async ticketByKey(
    tx: Transaction,
    idempotencyKey: string,
    now: Date,
  ): Promise<Ticket | null> {
    const result = await tx.execute({
      sql: `SELECT ticket_id FROM operations WHERE idempotency_key = ?`,
      args: [idempotencyKey],
    });
    const ticketId = result.rows[0]?.ticket_id;
    if (typeof ticketId !== "string") {
      return null;
    }
    const ticket = await tx.execute({
      sql: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = ?`,
      args: [ticketId],
    });
    const row = ticket.rows[0];
    return row ? toTicket(row, now) : null;
  }
}

async function recordOperation(
  tx: Transaction,
  idempotencyKey: string,
  ticketId: string,
  kind: string,
  now: Date,
): Promise<void> {
  await tx.execute({
    sql: `INSERT INTO operations (idempotency_key, ticket_id, kind, created_at) VALUES (?, ?, ?, ?)`,
    args: [idempotencyKey, ticketId, kind, now.toISOString()],
  });
}

async function readOwned(
  tx: Transaction,
  ownerId: string,
  ticketId: string,
  now: Date,
): Promise<Ticket> {
  const result = await tx.execute({
    sql: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = ? AND owner_id = ?`,
    args: [ticketId, ownerId],
  });
  const row = result.rows[0];
  if (!row) {
    throw new TicketNotFoundError();
  }
  return toTicket(row, now);
}

async function nextTicketId(tx: Transaction, type: "INC" | "REQ"): Promise<string> {
  const result = await tx.execute({
    sql: `SELECT id FROM tickets WHERE id LIKE ?`,
    args: [`${type}-%`],
  });
  let max = 0;
  for (const row of result.rows) {
    const id = row.id;
    if (typeof id !== "string") {
      continue;
    }
    const number = Number(id.slice(type.length + 1));
    if (Number.isInteger(number) && number > max) {
      max = number;
    }
  }
  return `${type}-${String(max + 1).padStart(5, "0")}`;
}

function toTicket(row: Row, now: Date): Ticket {
  const status = ticketStatusSchema.parse(text(row, "status"));
  const priority = text(row, "priority") as Priority;
  const dueAt = new Date(text(row, "sla_due_at"));
  return {
    id: text(row, "id"),
    ownerId: text(row, "owner_id"),
    type: ticketTypeSchema.parse(text(row, "type")),
    category: categorySchema.parse(text(row, "category")),
    subjectDetail: textOrNull(row, "subject_detail"),
    impact: text(row, "impact") as Ticket["impact"],
    urgency: text(row, "urgency") as Ticket["urgency"],
    priority,
    title: text(row, "title"),
    description: text(row, "description"),
    status,
    slaDueAt: dueAt,
    createdAt: new Date(text(row, "created_at")),
    updatedAt: new Date(text(row, "updated_at")),
    resolvedAt: dateOrNull(row, "resolved_at"),
    overdue: isOverdue(status, dueAt, now),
  };
}

function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`Coluna ${column} sem texto.`);
  }
  return value;
}

function textOrNull(row: Row, column: string): string | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Coluna ${column} inválida.`);
  }
  return value;
}

function dateOrNull(row: Row, column: string): Date | null {
  const value = textOrNull(row, column);
  return value ? new Date(value) : null;
}
