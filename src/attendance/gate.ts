import { classifyPriority, canReopen, slaDueAt, type Priority } from "../policy";
import type { Ticket } from "../tickets/types";

import type { Confidence, Decision, TransferReason } from "./decision";

export type DraftPlan = {
  operation: "create" | "update" | "reopen";
  title: string;
  description: string;
  type: Ticket["type"];
  category: Ticket["category"];
  targetTicketId: string | null;
  impact: NonNullable<Decision["impact"]>;
  urgency: NonNullable<Decision["urgency"]>;
  priority: Priority;
  slaDueAt: string;
  handoff: boolean;
};

export type GateResult = {
  takenAction: Decision["proposedAction"];
  transferReason: TransferReason | null;
  appliedRule: string;
  policyRefused: boolean;
  confidence: Confidence;
  reply: string;
  visibleActions: string[];
  options: string[];
  draft: DraftPlan | null;
};

const ASK_OPTIONS = ["Só eu", "Minha equipe", "Toda a empresa", "Não sei"];

export function applyGate(decision: Decision, tickets: Ticket[], now: Date): GateResult {
  if (decision.intent === "fora_de_ti" || decision.proposedAction === "redirecionar") {
    return finish(decision, {
      takenAction: "redirecionar",
      transferReason: null,
      appliedRule: "fora_de_ti",
      policyRefused: decision.draft !== null || decision.proposedAction !== "redirecionar",
      reply: "Isso fica fora da TI. Não vou abrir chamado.",
      draft: null,
    });
  }

  const target = ownedTarget(decision, tickets);
  if (target.missing) {
    return finish(decision, {
      takenAction: "responder",
      transferReason: null,
      appliedRule: "chamado_alheio",
      policyRefused: true,
      reply: "Não encontrei esse chamado na sua lista.",
      draft: null,
    });
  }

  const priority = classifyPriority({ impact: decision.impact, urgency: decision.urgency });
  let confidence = decision.confidence;
  let clamped = false;
  if (priority.kind === "decided" && !priority.confidenceMayBeHigh && confidence === "alto") {
    confidence = "medio";
    clamped = true;
  }

  if (confidence === "baixo") {
    return finish(decision, {
      takenAction: "transferir",
      transferReason: "seguranca_baixa",
      appliedRule: "confianca_baixa",
      policyRefused: decision.proposedAction !== "transferir",
      confidence,
      reply: "Não tenho segurança para resolver. Vou passar para um analista e pausar o agent.",
      draft: null,
    });
  }

  if (decision.intent === "falar_com_analista" || decision.proposedAction === "transferir") {
    return finish(decision, {
      takenAction: "transferir",
      transferReason: "pedido",
      appliedRule: "pedido_de_analista",
      policyRefused: decision.proposedAction !== "transferir",
      confidence,
      reply: "Vou transferir esta conversa para um analista. O agent fica pausado.",
      draft: null,
    });
  }

  if (decision.proposedAction === "propor_rascunho") {
    return draftResult(decision, tickets, target.ticket, priority, confidence, clamped, now);
  }

  const overdue = overdueTicket(decision, tickets);
  if (overdue) {
    return finish(decision, {
      takenAction: "transferir",
      transferReason: "vencido",
      appliedRule: "chamado_vencido",
      policyRefused: true,
      confidence,
      reply: `O ${overdue.id} está com o prazo vencido. Vou passar para um analista e pausar o agent.`,
      visibleActions: ["calculou o prazo"],
      draft: null,
    });
  }

  return finish(decision, {
    takenAction: decision.proposedAction,
    transferReason: null,
    appliedRule: decision.rule,
    policyRefused: clamped,
    confidence,
    reply: decision.reply,
    draft: null,
  });
}

function draftResult(
  decision: Decision,
  tickets: Ticket[],
  target: Ticket | null,
  priority: ReturnType<typeof classifyPriority>,
  confidence: Confidence,
  clamped: boolean,
  now: Date,
): GateResult {
  if (!decision.draft || priority.kind !== "decided" || !decision.impact || !decision.urgency) {
    return finish(decision, {
      takenAction: "perguntar",
      transferReason: null,
      appliedRule: "prioridade_incompleta",
      policyRefused: true,
      confidence,
      reply: "Preciso saber quem foi afetado e qual é a urgência antes de classificar.",
      options: decision.options.length > 0 ? decision.options : ASK_OPTIONS,
      draft: null,
    });
  }

  if (target?.status === "aprovado") {
    return finish(decision, {
      takenAction: "responder",
      transferReason: null,
      appliedRule: "requisicao_aprovada",
      policyRefused: true,
      confidence,
      reply: "Essa requisição já foi aprovada.",
      draft: null,
    });
  }

  if (target?.status === "resolvido") {
    if (!target.resolvedAt || !canReopen(target.resolvedAt, now)) {
      return finish(decision, {
        takenAction: "responder",
        transferReason: null,
        appliedRule: "reabertura_expirada",
        policyRefused: true,
        confidence,
        reply: "Esse chamado foi resolvido há mais de 7 dias. Dá para abrir outro, com confirmação.",
        draft: null,
      });
    }
  }

  const operation = !target ? "create" : target.status === "resolvido" ? "reopen" : "update";
  const overdue = overdueTicket(decision, tickets);
  const transferReason: TransferReason | null =
    priority.priority === "critica" ? "critico" : overdue ? "vencido" : null;
  const dueAt = slaDueAt(priority.priority, now).toISOString();
  const draft: DraftPlan = {
    operation,
    title: decision.draft.title,
    description: decision.draft.description,
    type: decision.draft.type,
    category: decision.draft.category,
    targetTicketId: target?.id ?? null,
    impact: decision.impact,
    urgency: decision.urgency,
    priority: priority.priority,
    slaDueAt: dueAt,
    handoff: transferReason !== null,
  };

  return finish(decision, {
    takenAction: "propor_rascunho",
    transferReason,
    appliedRule: transferReason === "critico" ? "prioridade_critica" : transferReason === "vencido" ? "chamado_vencido" : `prioridade_${priority.priority}`,
    policyRefused: clamped,
    confidence,
    reply:
      transferReason === null
        ? decision.reply
        : "Montei um rascunho e transferi a conversa. O chamado só é gravado quando você confirmar.",
    visibleActions: ["classificou a prioridade", "consultou o SLA", "calculou o prazo", "montou o rascunho"],
    draft,
  });
}

function ownedTarget(
  decision: Decision,
  tickets: Ticket[],
): { missing: boolean; ticket: Ticket | null } {
  const id = decision.draft?.targetTicketId;
  if (!id) {
    return { missing: false, ticket: null };
  }
  const ticket = tickets.find((item) => item.id === id) ?? null;
  return { missing: ticket === null, ticket };
}

function overdueTicket(decision: Decision, tickets: Ticket[]): Ticket | null {
  const ids = [
    decision.draft?.targetTicketId,
    ...decision.evidence.filter((item) => item.source === "chamado").map((item) => item.id),
  ];
  for (const id of ids) {
    if (!id) {
      continue;
    }
    const ticket = tickets.find((item) => item.id === id);
    if (ticket?.overdue) {
      return ticket;
    }
  }
  return null;
}

function finish(
  decision: Decision,
  patch: Partial<GateResult> & Pick<GateResult, "takenAction" | "transferReason" | "appliedRule" | "policyRefused" | "reply" | "draft">,
): GateResult {
  return {
    confidence: patch.confidence ?? decision.confidence,
    visibleActions: patch.visibleActions ?? [],
    options: patch.options ?? (patch.takenAction === "perguntar" ? decision.options : []),
    ...patch,
  };
}
