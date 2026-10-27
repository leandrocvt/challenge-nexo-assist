import type { Agent, Decision } from "./decision";

/** Substituto do modelo nesta etapa. A frase escolhe uma decisão fixa; a política continua no código. */
export const scriptedAgent: Agent = {
  decide({ message }) {
    return { decision: decideFromText(message), toolUses: [] };
  },
};

export function decideFromText(message: string): Decision {
  const text = message.toLowerCase();
  if (includes(text, ["analista", "atendente", "humano"])) {
    return decision({
      intent: "falar_com_analista",
      proposedAction: "transferir",
      reply: "Vou chamar um analista.",
    });
  }
  if (includes(text, [" rh", "rh ", "férias", "ferias", "financeiro", "facilities"])) {
    return decision({
      intent: "fora_de_ti",
      proposedAction: "redirecionar",
      reply: "Esse assunto não é da TI.",
    });
  }
  if (includes(text, ["não sei", "nao sei", "baixa confiança", "baixa confianca"])) {
    return decision({
      intent: "incerto",
      confidence: "baixo",
      proposedAction: "responder",
      reply: "Acho que sei, mas não tenho certeza.",
    });
  }
  if (includes(text, ["empresa", "todo mundo"]) && includes(text, ["parad", "parada", "parou"])) {
    return decision({
      intent: "abertura",
      proposedAction: "propor_rascunho",
      impact: "empresa",
      urgency: "parado",
      draft: {
        title: "Serviço parado para a empresa",
        description: message,
        type: "INC",
        category: "Outros",
        targetTicketId: null,
      },
      reply: "Isso parece crítico.",
    });
  }
  if (includes(text, ["notebook", "20311", "vencido"])) {
    return decision({
      intent: "consulta",
      proposedAction: "responder",
      evidence: [{ source: "chamado", id: "INC-20311", note: "notebook lento" }],
      reply: "Encontrei o INC-20311.",
    });
  }
  if (includes(text, ["sharepoint", "atualizar", "complement"])) {
    return decision({
      intent: "complemento",
      proposedAction: "propor_rascunho",
      impact: "pessoa",
      urgency: "ha_alternativa",
      draft: {
        title: "Acesso à pasta Financeiro no SharePoint",
        description: message,
        type: "INC",
        category: "Acesso",
        targetTicketId: "INC-20298",
      },
      reply: "Posso complementar o chamado que já está aberto.",
    });
  }
  if (includes(text, ["reabrir", "sap"])) {
    return decision({
      intent: "abertura",
      proposedAction: "propor_rascunho",
      impact: "pessoa",
      urgency: "ha_alternativa",
      draft: {
        title: "Senha do SAP bloqueada",
        description: message,
        type: "INC",
        category: "Acesso",
        targetTicketId: "INC-20150",
      },
      reply: "O SAP foi resolvido há poucos dias. Posso reabrir.",
    });
  }
  if (includes(text, ["abrir", "vpn", "chamado"])) {
    return decision({
      intent: "abertura",
      proposedAction: "propor_rascunho",
      impact: "pessoa",
      urgency: "ha_alternativa",
      draft: {
        title: "VPN não conecta",
        description: message,
        type: "INC",
        category: "Rede e VPN",
        targetTicketId: null,
      },
      reply: "Montei um rascunho de chamado. Ele só é gravado se você confirmar.",
    });
  }
  return decision({
    intent: "duvida",
    proposedAction: "responder",
    reply: "Posso consultar chamados ou montar um rascunho. Diga o que aconteceu.",
  });
}

function includes(text: string, parts: string[]): boolean {
  return parts.some((part) => text.includes(part));
}

function decision(patch: Partial<Decision> & Pick<Decision, "intent" | "proposedAction" | "reply">): Decision {
  return {
    confidence: "alto",
    evidence: [],
    rule: "nenhuma",
    impact: null,
    urgency: null,
    draft: null,
    options: [],
    ...patch,
  };
}
