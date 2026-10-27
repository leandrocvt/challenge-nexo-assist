import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, isResponse, requireEmployee, toErrorResponse } from "../../../../../http/guard";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "funcionario") {
    return errorResponse(403, "Quem confirma o rascunho é o funcionário.");
  }

  const { id } = await context.params;
  try {
    const result = await access.app.attendance.confirmDraft(access.employee.id, id);
    return NextResponse.json(result);
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
