import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, isResponse, requireEmployee } from "../../../http/guard";

export async function GET(request: NextRequest) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "funcionario") {
    return errorResponse(403, "A lista de conversas desta rota é do funcionário.");
  }
  const conversations = await access.app.attendance.listOwn(access.employee.id);
  return NextResponse.json({ conversations });
}
