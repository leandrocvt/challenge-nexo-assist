import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, isResponse, requireEmployee, toErrorResponse } from "../../../../../http/guard";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "analista") {
    return errorResponse(403, "Quem encerra a conversa é o analista.");
  }

  const { id } = await context.params;
  try {
    const conversation = await access.app.attendance.close(access.employee.id, id);
    return NextResponse.json({ conversation });
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
