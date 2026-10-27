import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, isResponse, requireEmployee, toErrorResponse } from "../../../../../http/guard";

const bodySchema = z.object({
  note: z.string().trim().optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "analista") {
    return errorResponse(403, "Quem devolve a conversa é o analista.");
  }

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return errorResponse(400, "A orientação precisa ser texto.");
  }

  const { id } = await context.params;
  try {
    const conversation = await access.app.attendance.returnToAgent(
      access.employee.id,
      id,
      parsed.data.note ?? null,
    );
    return NextResponse.json({ conversation });
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
