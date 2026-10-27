import { z } from "zod";

import { impactSchema, prioritySchema, urgencySchema } from "../policy";
import { categorySchema, ticketTypeSchema } from "../tickets/types";

export const confidenceSchema = z.enum(["baixo", "medio", "alto"]);
export const intentSchema = z.enum([
  "duvida",
  "consulta",
  "complemento",
  "abertura",
  "falar_com_analista",
  "fora_de_ti",
  "incerto",
]);
export const proposedActionSchema = z.enum([
  "responder",
  "perguntar",
  "propor_rascunho",
  "transferir",
  "redirecionar",
]);
export const transferReasonSchema = z.enum(["pedido", "critico", "vencido", "seguranca_baixa"]);

export const decisionSchema = z.object({
  intent: intentSchema,
  confidence: confidenceSchema,
  evidence: z
    .array(
      z.object({
        source: z.enum(["artigo", "chamado"]),
        id: z.string().min(1),
        note: z.string(),
      }),
    )
    .max(8),
  rule: z.string().min(1),
  proposedAction: proposedActionSchema,
  impact: impactSchema.nullable(),
  urgency: urgencySchema.nullable(),
  draft: z
    .object({
      title: z.string().min(1),
      description: z.string().min(1),
      type: ticketTypeSchema,
      category: categorySchema,
      targetTicketId: z.string().min(1).nullable(),
    })
    .nullable(),
  options: z.array(z.string().min(1)).max(4),
  reply: z.string().min(1),
  claimedPriority: prioritySchema.nullable().optional(),
});

export type Decision = z.infer<typeof decisionSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type TransferReason = z.infer<typeof transferReasonSchema>;

export type ToolUse = {
  id: string;
  failed: boolean;
  ticketId: string | null;
};

export type AgentAnswer = {
  decision: Decision;
  toolUses: ToolUse[];
};

export type Agent = {
  decide(input: {
    message: string;
    employeeId: string;
    conversationId: string;
  }): AgentAnswer | Promise<AgentAnswer>;
};
