import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, isResponse, requireEmployee } from "../../../../http/guard";

const bodySchema = z.object({
  mode: z.enum(["none", "before-commit", "after-commit"]),
});

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return errorResponse(404, "Não encontrado.");
  }
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Informe o modo da falha.");
  }
  access.app.tickets.setFailure(parsed.data.mode);
  return NextResponse.json({ mode: parsed.data.mode });
}
