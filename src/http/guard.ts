import { NextResponse, type NextRequest } from "next/server";

import type { Employee } from "../session/directory";
import { readSession, SESSION_COOKIE, sessionSecret } from "../session/token";
import { getApp, type App } from "../server/app";

export function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function requireEmployee(
  request: NextRequest,
): Promise<{ employee: Employee; app: App } | NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return errorResponse(401, "Faça login para continuar.");
  }

  const session = readSession(token, sessionSecret(), new Date());
  if (!session) {
    return errorResponse(401, "Sessão inválida.");
  }

  const app = await getApp();
  const employee = await app.directory.findById(session.employeeId);
  if (!employee) {
    return errorResponse(401, "Sessão inválida.");
  }
  return { employee, app };
}

export function isResponse(value: { employee: Employee; app: App } | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
