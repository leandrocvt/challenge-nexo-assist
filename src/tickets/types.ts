import { z } from "zod";

import {
  impactSchema,
  urgencySchema,
  type Impact,
  type Priority,
  type TicketStatus,
  type Urgency,
} from "../policy";

export const ticketTypeSchema = z.enum(["INC", "REQ"]);
export const categorySchema = z.enum([
  "Acesso",
  "Rede e VPN",
  "Hardware",
  "Software",
  "E-mail",
  "Outros",
]);

export const createTicketSchema = z.object({
  ownerId: z.string().min(1),
  type: ticketTypeSchema,
  category: categorySchema,
  subjectDetail: z.string().min(1).nullable().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  impact: impactSchema,
  urgency: urgencySchema,
});

export const updateTicketSchema = z.object({
  ownerId: z.string().min(1),
  ticketId: z.string().min(1),
  description: z.string().min(1),
});

export type TicketType = z.infer<typeof ticketTypeSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export type Ticket = {
  id: string;
  ownerId: string;
  type: TicketType;
  category: Category;
  subjectDetail: string | null;
  impact: Impact;
  urgency: Urgency;
  priority: Priority;
  title: string;
  description: string;
  status: TicketStatus;
  slaDueAt: Date;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  overdue: boolean;
};

export type FailureMode = "none" | "before-commit" | "after-commit";
