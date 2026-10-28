import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, isResponse, requireEmployee, toErrorResponse } from "../../../../http/guard";

const bodySchema = z.object({
  description: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "funcionario") {
    return errorResponse(403, "Quem edita o rascunho é o funcionário.");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Informe a descrição do rascunho.");
  }

  const { id } = await context.params;
  try {
    const draft = await access.app.attendance.editDraft(access.employee.id, id, parsed.data);
    return NextResponse.json({ draft });
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}