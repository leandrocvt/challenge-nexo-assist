import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { scriptedAgent } from "../../../../../attendance/script";
import { errorResponse, isResponse, requireEmployee, toErrorResponse } from "../../../../../http/guard";

const bodySchema = z.object({
  text: z.string().trim().min(1),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "funcionario") {
    return errorResponse(403, "Quem envia a mensagem nesta rota é o funcionário.");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Escreva a mensagem.");
  }

  const { id } = await context.params;
  try {
    const turn = await access.app.attendance.sendEmployeeMessage({
      employeeId: access.employee.id,
      conversationId: id,
      text: parsed.data.text,
      agent: scriptedAgent,
    });
    return NextResponse.json(turn);
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
