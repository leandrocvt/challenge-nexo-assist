import {
  priorityInputSchema,
  type PriorityDecision,
  type PriorityInput,
} from "./types";

export function classifyPriority(input: PriorityInput): PriorityDecision {
  const { impact, urgency } = priorityInputSchema.parse(input);
  if (impact === null || urgency === null) {
    return { kind: "incomplete" };
  }

  if (
    (impact === "equipe" || impact === "empresa") &&
    urgency === "parado"
  ) {
    return { kind: "decided", priority: "critica", confidenceMayBeHigh: true };
  }

  if (
    urgency === "impede_trabalho" ||
    urgency === "compromisso_hoje" ||
    (impact === "pessoa" && urgency === "parado")
  ) {
    return { kind: "decided", priority: "alta", confidenceMayBeHigh: true };
  }

  if (urgency === "ha_alternativa" && impact === "pessoa") {
    return { kind: "decided", priority: "media", confidenceMayBeHigh: true };
  }

  if (urgency === "sem_urgencia" && impact === "pessoa") {
    return { kind: "decided", priority: "baixa", confidenceMayBeHigh: true };
  }

  return { kind: "decided", priority: "media", confidenceMayBeHigh: false };
}
