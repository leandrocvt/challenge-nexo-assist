import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getApp } from "../server/app";

const contextSchema = z.object({
  employeeId: z.string().min(1),
});

const ticketInputSchema = z.object({
  query: z.string().nullable().optional(),
  employeeId: z.string().optional(),
});

export const listTicketsTool = createTool({
  id: "list-tickets",
  description:
    "Lista os chamados do funcionário da sessão. O employeeId do argumento é ignorado: o servidor já definiu de quem são os chamados.",
  inputSchema: ticketInputSchema,
  requestContextSchema: contextSchema,
  execute: async (input, context) => {
    const employeeId = context.requestContext.get("employeeId");
    if (typeof employeeId !== "string" || employeeId.length === 0) {
      return { error: true as const, message: "Falta o funcionário no contexto do servidor." };
    }

    const app = await getApp();
    const query = input.query?.trim() ?? "";
    if (/^(INC|REQ)-\d+$/i.test(query)) {
      const ticket = await app.tickets.findByNumber(employeeId, query.toUpperCase());
      return { error: false as const, tickets: ticket ? [publicTicket(ticket)] : [] };
    }

    const tickets = await app.tickets.listByOwner(employeeId);
    const needle = query.toLowerCase();
    const matched = needle
      ? tickets.filter((ticket) =>
          `${ticket.id} ${ticket.title} ${ticket.description}`.toLowerCase().includes(needle),
        )
      : tickets;
    return { error: false as const, tickets: matched.map(publicTicket) };
  },
});

export const searchArticlesTool = createTool({
  id: "search-articles",
  description: "Busca artigos curtos da central de ajuda. Não abre chamado.",
  inputSchema: z.object({
    query: z.string(),
    employeeId: z.string().optional(),
  }),
  requestContextSchema: contextSchema,
  execute: async (input, context) => {
    const employeeId = context.requestContext.get("employeeId");
    if (typeof employeeId !== "string" || employeeId.length === 0) {
      return { error: true as const, message: "Falta o funcionário no contexto do servidor." };
    }

    const query = input.query.trim().toLowerCase();
    if (!query) {
      return { error: false as const, articles: [] };
    }

    const app = await getApp();
    const result = await app.client.execute(
      "SELECT id, title, body, category, applies_when FROM articles",
    );
    const articles = result.rows
      .map((row) => ({
        id: text(row, "id"),
        title: text(row, "title"),
        body: text(row, "body"),
        category: row.category === null ? null : text(row, "category"),
        appliesWhen: row.applies_when === null ? null : text(row, "applies_when"),
      }))
      .filter((article) => `${article.title} ${article.body}`.toLowerCase().includes(query))
      .slice(0, 5);
    return { error: false as const, articles };
  },
});

function publicTicket(ticket: {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  overdue: boolean;
}) {
  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    overdue: ticket.overdue,
  };
}

function text(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`Coluna ${column} sem texto.`);
  }
  return value;
}
