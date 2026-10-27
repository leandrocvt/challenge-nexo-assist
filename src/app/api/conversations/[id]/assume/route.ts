import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, isResponse, requireEmployee, toErrorResponse } from "../../../../../http/guard";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await analyst(request);
  if (access instanceof NextResponse) {
    return access;
  }
  const { id } = await context.params;
  try {
    const conversation = await access.app.attendance.assume(access.employee.id, id);
    return NextResponse.json({ conversation });
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}

async function analyst(request: NextRequest) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "analista") {
    return errorResponse(403, "Quem assume a conversa é o analista.");
  }
  return access;
}
