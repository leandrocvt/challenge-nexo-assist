import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, isResponse, requireEmployee } from "../../../../http/guard";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }

  const { id } = await context.params;
  const conversation = await access.app.conversations.findOwned(access.employee.id, id);
  if (!conversation) {
    return errorResponse(404, "Conversa não encontrada.");
  }
  return NextResponse.json({ conversation });
}
