import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse } from "../../../http/guard";
import { getApp } from "../../../server/app";
import {
  REMEMBER_MAX_AGE_SECONDS,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionSecret,
  signSession,
} from "../../../session/token";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string(),
  remember: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Informe um e-mail válido.");
  }
  if (parsed.data.password.trim() === "") {
    return errorResponse(400, "Informe a senha.");
  }

  const secret = sessionSecret();
  const app = await getApp();
  const employee = await app.directory.findByEmail(parsed.data.email);
  if (!employee) {
    return errorResponse(401, "E-mail não cadastrado.");
  }

  const remember = parsed.data.remember === true;
  const maxAge = remember ? REMEMBER_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
  const token = signSession(employee.id, secret, new Date(), maxAge);
  const conversation =
    employee.role === "funcionario"
      ? await app.conversations.findOrCreate(employee.id, new Date())
      : null;

  const response = NextResponse.json({
    employee: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      level: employee.level,
    },
    conversation,
  });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  });
  return response;
}
