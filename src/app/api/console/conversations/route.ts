import { NextResponse, type NextRequest } from "next/server";

import { queueFilterSchema } from "../../../../attendance/inbox";
import { errorResponse, isResponse, requireEmployee } from "../../../../http/guard";

export async function GET(request: NextRequest) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  if (access.employee.role !== "analista") {
    return errorResponse(403, "A fila é do analista.");
  }

  const parsed = queueFilterSchema.safeParse(request.nextUrl.searchParams.get("filter") ?? "todas");
  if (!parsed.success) {
    return errorResponse(400, "Filtro inválido.");
  }
  const query = request.nextUrl.searchParams.get("q") ?? undefined;
  const conversations = await access.app.attendance.listQueue(access.employee.id, parsed.data, query);
  return NextResponse.json({ conversations });
}
