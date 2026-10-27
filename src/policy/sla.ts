import { addBusinessDays, addBusinessMinutes } from "./calendar";
import type { Priority, TicketStatus } from "./types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const TERMINAL_STATUS = new Set<TicketStatus>(["resolvido", "aprovado"]);

export function slaDueAt(priority: Priority, from: Date): Date {
  switch (priority) {
    case "critica":
      return new Date(from.getTime() + ONE_HOUR_MS);
    case "alta":
      return addBusinessMinutes(from, 4 * 60);
    case "media":
      return addBusinessDays(from, 3);
    case "baixa":
      return addBusinessDays(from, 5);
  }
}

export function isOverdue(
  status: TicketStatus,
  dueAt: Date,
  now: Date,
): boolean {
  if (TERMINAL_STATUS.has(status)) {
    return false;
  }
  return now.getTime() > dueAt.getTime();
}

export function canReopen(resolvedAt: Date, now: Date): boolean {
  const ageMs = now.getTime() - resolvedAt.getTime();
  return ageMs >= 0 && ageMs <= SEVEN_DAYS_MS;
}
