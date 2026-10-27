import type { ModelMessage } from "../attendance/decision";

/** Falas recentes enviadas ao modelo. A sessão guarda até 30; o restante não entra na chamada. */
export const MODEL_MESSAGE_WINDOW = 6;

export type SpokenMessage = {
  author: "employee" | "agent" | "analyst";
  body: string;
};

export function modelWindow(prior: SpokenMessage[], current: string, limit = MODEL_MESSAGE_WINDOW): {
  omitted: number;
  messages: ModelMessage[];
} {
  const spoken = prior.filter((message) => message.body.trim().length > 0);
  const kept = spoken.slice(Math.max(0, spoken.length - limit));
  const omitted = spoken.length - kept.length;
  const messages: ModelMessage[] = [];
  if (omitted > 0) {
    messages.push({
      role: "user",
      content: `Há ${omitted} mensagens anteriores desta conversa que não entram nesta chamada.`,
    });
  }
  for (const message of kept) {
    messages.push(toModelMessage(message));
  }
  messages.push({ role: "user", content: current });
  return { omitted, messages };
}

function toModelMessage(message: SpokenMessage): ModelMessage {
  if (message.author === "employee") {
    return { role: "user", content: message.body };
  }
  if (message.author === "analyst") {
    return { role: "assistant", content: `Analista: ${message.body}` };
  }
  return { role: "assistant", content: message.body };
}
