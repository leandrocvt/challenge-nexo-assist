import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

export const SESSION_COOKIE = "nexo_session";

/** Hipótese: sem “manter conectado”, a sessão dura um expediente. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/** Hipótese: “manter conectado” só alonga o cookie. Não muda o que a sessão autoriza. */
export const REMEMBER_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const payloadSchema = z.object({
  employeeId: z.string().min(1),
  exp: z.number().int(),
});

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("Defina SESSION_SECRET no .env com pelo menos 16 caracteres.");
  }
  return secret;
}

export function signSession(
  employeeId: string,
  secret: string,
  now: Date,
  maxAgeSeconds: number,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      employeeId,
      exp: Math.floor(now.getTime() / 1000) + maxAgeSeconds,
    }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readSession(
  token: string,
  secret: string,
  now: Date,
): { employeeId: string } | null {
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) {
    return null;
  }
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const received = Buffer.from(signature);
  const valid = Buffer.from(expected);
  if (received.length !== valid.length || !timingSafeEqual(received, valid)) {
    return null;
  }

  try {
    const parsed = payloadSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (parsed.exp <= Math.floor(now.getTime() / 1000)) {
      return null;
    }
    return { employeeId: parsed.employeeId };
  } catch {
    return null;
  }
}
