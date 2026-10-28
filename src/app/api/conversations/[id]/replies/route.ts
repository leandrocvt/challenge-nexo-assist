import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, isResponse, requireEmployee, toErrorResponse } from "../../../../../http/guard";

const bodySchema = z.object({
  text: z.string().trim().min(1),
  ticketId: z.string().trim().min(1).nullable().optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "analista") {
    return errorResponse(403, "Quem responde nesta rota é o analista.");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Escreva a resposta.");
  }

  const { id } = await context.params;
  try {
    const result = await access.app.attendance.replyAsAnalyst({
      analystId: access.employee.id,
      conversationId: id,
      text: parsed.data.text,
      ticketId: parsed.data.ticketId ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}