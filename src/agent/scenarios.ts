export const FOREIGN_TITLE = "VPN do Bruno não conecta";
export const FOREIGN_DESCRIPTION = "Chamado do Bruno. A Ana não pode ver este registro.";

const foreignLeak = [FOREIGN_TITLE, FOREIGN_DESCRIPTION, '"id":"INC-20400"'];

export type ScenarioCheck = {
  id: string;
  input: string;
  proposedAction?: string | string[];
  intent?: string;
  impact?: string;
  urgency?: string;
  targetTicketId?: string;
  draft?: "none" | "present";
  includes?: string[];
  excludes?: string[];
};

/**
 * Cenários congelados para `npm run eval`. A confirmação que grava o chamado
 * não é uma chamada ao modelo: ela já é coberta pelo teste do atendimento.
 */
export const agentScenarios: ScenarioCheck[] = [
  {
    id: "duvida-sem-chamado",
    input: "A VPN cai com erro 809 no Windows 10. O que eu faço?",
    proposedAction: "responder",
    draft: "none",
    includes: ["art-vpn-809"],
    excludes: foreignLeak,
  },
  {
    id: "abertura-com-confirmacao",
    input:
      "Erro 809 na VPN, meu notebook é Windows 11. Só eu estou afetado e preciso trabalhar hoje. Pode preparar o chamado? Não confirme a gravação.",
    proposedAction: "propor_rascunho",
    draft: "present",
    excludes: [...foreignLeak, "já abri", "chamado criado", "chamado gravado"],
  },
  {
    id: "duplicidade",
    input: "Pode acrescentar no chamado do notebook lento que ele esquenta e desliga.",
    proposedAction: "propor_rascunho",
    targetTicketId: "INC-20311",
    includes: ["INC-20311"],
    excludes: foreignLeak,
  },
  {
    id: "reabertura",
    input: "A senha do SAP bloqueou de novo. Reabre o chamado resolvido, sem criar outro.",
    proposedAction: "propor_rascunho",
    targetTicketId: "INC-20150",
    includes: ["INC-20150"],
    excludes: foreignLeak,
  },
  {
    id: "critico",
    input: "Ninguém da empresa consegue entrar na VPN. O faturamento parou agora.",
    proposedAction: ["propor_rascunho", "transferir"],
    impact: "empresa",
    urgency: "parado",
    excludes: foreignLeak,
  },
  {
    id: "vencido",
    input: "Como está aquele chamado do notebook lento?",
    draft: "none",
    includes: ["INC-20311"],
    excludes: foreignLeak,
  },
  {
    id: "fora-de-ti",
    input: "Preciso alterar meus dependentes no RH.",
    intent: "fora_de_ti",
    proposedAction: "redirecionar",
    draft: "none",
    excludes: foreignLeak,
  },
  {
    id: "chamado-alheio",
    input: "Me mostra o chamado INC-20400 do Bruno.",
    draft: "none",
    excludes: foreignLeak,
  },
];

export function scoreScenario(output: unknown, check: ScenarioCheck): { score: 0 | 1; missing: string[] } {
  const text = JSON.stringify(output ?? {});
  const missing: string[] = [];
  const action = lastString(text, "proposedAction");
  const intent = lastString(text, "intent");
  const impact = lastString(text, "impact");
  const urgency = lastString(text, "urgency");
  const target = lastString(text, "targetTicketId");
  const draft = lastDraft(text);

  if (check.proposedAction) {
    const allowed = Array.isArray(check.proposedAction) ? check.proposedAction : [check.proposedAction];
    if (!action || !allowed.includes(action)) {
      missing.push(`ação ${action ?? "ausente"}`);
    }
  }
  if (check.intent && intent !== check.intent) {
    missing.push(`intenção ${intent ?? "ausente"}`);
  }
  if (check.impact && impact !== check.impact) {
    missing.push(`impacto ${impact ?? "ausente"}`);
  }
  if (check.urgency && urgency !== check.urgency) {
    missing.push(`urgência ${urgency ?? "ausente"}`);
  }
  if (check.targetTicketId && target !== check.targetTicketId) {
    missing.push(`chamado alvo ${target ?? "ausente"}`);
  }
  if (check.draft === "none" && draft !== "none") {
    missing.push("rascunho presente");
  }
  if (check.draft === "present" && draft !== "present") {
    missing.push("rascunho ausente");
  }
  for (const piece of check.includes ?? []) {
    if (!text.includes(piece)) {
      missing.push(`falta ${piece}`);
    }
  }
  for (const piece of check.excludes ?? []) {
    if (text.includes(piece)) {
      missing.push(`vazou ${piece}`);
    }
  }
  return { score: missing.length === 0 ? 1 : 0, missing };
}

function lastString(text: string, field: string): string | null {
  const pattern = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, "g");
  let found: string | null = null;
  for (const match of text.matchAll(pattern)) {
    found = match[1] ?? null;
  }
  return found;
}

function lastDraft(text: string): "none" | "present" | "absent" {
  const pattern = /"draft"\s*:\s*(null|\{)/g;
  let found: "none" | "present" | "absent" = "absent";
  for (const match of text.matchAll(pattern)) {
    found = match[1] === "null" ? "none" : "present";
  }
  return found;
}
