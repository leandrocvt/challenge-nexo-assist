import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, isResponse, requireEmployee } from "../../../http/guard";
import type { Ticket } from "../../../tickets";

export async function GET(request: NextRequest) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "funcionario") {
    return errorResponse(403, "A lista de chamados desta rota é do funcionário.");
  }

  const tickets = await access.app.tickets.listByOwner(access.employee.id);
  return NextResponse.json({ tickets: tickets.map(toJson) });
}

function toJson(ticket: Ticket) {
  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    type: ticket.type,
    category: ticket.category,
    subjectDetail: ticket.subjectDetail,
    priority: ticket.priority,
    status: ticket.status,
    slaDueAt: ticket.slaDueAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    overdue: ticket.overdue,
  };
}
