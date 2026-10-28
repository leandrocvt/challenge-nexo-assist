import { NextResponse, type NextRequest } from "next/server";

import { isResponse, requireEmployee, toErrorResponse } from "../../../../../http/guard";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  const { id } = await context.params;
  try {
    const tickets = await access.app.attendance.ticketsFor(access.employee, id);
    return NextResponse.json({ tickets });
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
