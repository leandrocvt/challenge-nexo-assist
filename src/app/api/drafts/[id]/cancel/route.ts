import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, isResponse, requireEmployee, toErrorResponse } from "../../../../../http/guard";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "funcionario") {
    return errorResponse(403, "Quem cancela o rascunho é o funcionário.");
  }

  const { id } = await context.params;
  try {
    const draft = await access.app.attendance.cancelDraft(access.employee.id, id);
    return NextResponse.json({ draft });
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
