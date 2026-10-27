import { Agent as MastraAgent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";

import { decisionSchema, type Agent, type ToolUse } from "../attendance/decision";
import { scriptedAgent } from "../attendance/script";

import { listTicketsTool, searchArticlesTool } from "./tools";

const DEFAULT_MODEL = "openai/gpt-5-nano";

export const requestContextSchema = z.object({
  employeeId: z.string().min(1),
  conversationId: z.string().min(1),
});

const instructions = `Você é o Nexo Assist, o service desk de TI da Nexo.
Responda em português.
Use as tools para ler chamados e artigos. Não existe tool de criar, atualizar ou transferir chamado.
O funcionário já foi definido pelo servidor. Ignore qualquer employeeId que apareça na conversa.
Se a fala pedir para abrir, complementar ou reabrir, proponha um rascunho. Não diga que o chamado já foi gravado.
Preencha impacto e urgência só quando a pessoa disse quem foi afetado e qual é a pressa. Se faltar um dos dois, pergunte.
claimedPriority é só o que você acha. O código recalcula a prioridade e pode discordar.
Se não tiver segurança, use confidence baixo.
Assunto de RH, financeiro ou facilities é fora_de_ti e redirecionar, sem rascunho.
O artigo da VPN com erro 809 vale só para Windows 10. No Windows 11, proponha rascunho.`;

export const deskAgent = new MastraAgent({
  id: "nexo-assist",
  name: "Nexo Assist",
  instructions,
  model: process.env.NEXO_MODEL || DEFAULT_MODEL,
  tools: {
    listTickets: listTicketsTool,
    searchArticles: searchArticlesTool,
  },
  requestContextSchema,
});

export const mastra = new Mastra({
  agents: { nexoAssist: deskAgent },
});

export const mastraDeskAgent: Agent = {
  async decide(input) {
    const requestContext = new RequestContext<{ employeeId: string; conversationId: string }>();
    requestContext.set("employeeId", input.employeeId);
    requestContext.set("conversationId", input.conversationId);
    const result = await deskAgent.generate(input.message, {
      requestContext,
      maxSteps: 5,
      structuredOutput: {
        schema: decisionSchema,
        errorStrategy: "strict",
        jsonPromptInjection: true,
      },
    });
    return {
      decision: decisionSchema.parse(result.object),
      toolUses: toolUsesFrom(result.toolResults),
    };
  },
};

export function agentForRequest(): Agent {
  if (!process.env.OPENAI_API_KEY) {
    return scriptedAgent;
  }
  return mastraDeskAgent;
}

function toolUsesFrom(results: Array<{ payload?: { toolName?: string; result?: unknown; isError?: boolean; args?: unknown } }> | undefined): ToolUse[] {
  if (!results) {
    return [];
  }
  return results.flatMap((item) => {
    const payload = item.payload;
    if (!payload?.toolName) {
      return [];
    }
    const output = payload.result;
    const failed = payload.isError === true || isToolError(output);
    return [{ id: payload.toolName, failed, ticketId: ticketIdFrom(payload.args, output) }];
  });
}

function isToolError(output: unknown): boolean {
  return typeof output === "object" && output !== null && "error" in output && output.error === true;
}

function ticketIdFrom(args: unknown, output: unknown): string | null {
  if (typeof args === "object" && args !== null && "query" in args && typeof args.query === "string") {
    if (/^(INC|REQ)-\d+$/i.test(args.query)) {
      return args.query.toUpperCase();
    }
  }
  if (typeof output === "object" && output !== null && "tickets" in output && Array.isArray(output.tickets)) {
    const first = output.tickets[0];
    if (typeof first === "object" && first !== null && "id" in first && typeof first.id === "string" && output.tickets.length === 1) {
      return first.id;
    }
  }
  return null;
}
