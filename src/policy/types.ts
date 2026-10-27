import { z } from "zod";

export const impactSchema = z.enum(["pessoa", "equipe", "empresa"]);
export const urgencySchema = z.enum([
  "parado",
  "impede_trabalho",
  "compromisso_hoje",
  "ha_alternativa",
  "sem_urgencia",
]);
export const prioritySchema = z.enum(["critica", "alta", "media", "baixa"]);
export const ticketStatusSchema = z.enum([
  "em_andamento",
  "aguardando_analista",
  "em_atendimento",
  "aprovado",
  "resolvido",
]);

export const priorityInputSchema = z.object({
  impact: impactSchema.nullable(),
  urgency: urgencySchema.nullable(),
});

export type Impact = z.infer<typeof impactSchema>;
export type Urgency = z.infer<typeof urgencySchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type PriorityInput = z.infer<typeof priorityInputSchema>;

export type PriorityDecision =
  | { kind: "incomplete" }
  | {
      kind: "decided";
      priority: Priority;
      confidenceMayBeHigh: boolean;
    };
