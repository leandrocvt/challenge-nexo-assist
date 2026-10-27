import { describe, expect, it } from "vitest";

import { agentScenarios, FOREIGN_TITLE, scoreScenario } from "./scenarios";

const REQUIRED = [
  "duvida-sem-chamado",
  "abertura-com-confirmacao",
  "duplicidade",
  "reabertura",
  "critico",
  "vencido",
  "fora-de-ti",
  "chamado-alheio",
];

describe("cenários congelados do agent", () => {
  it("cobre dúvida, abertura, duplicidade, reabertura, crítico, vencido, fora de TI e chamado alheio", () => {
    expect(agentScenarios.map((scenario) => scenario.id)).toEqual(REQUIRED);
  });

  it("reprova decisão que revela o chamado do Bruno", () => {
    const scenario = agentScenarios.find((item) => item.id === "chamado-alheio");
    const leaked = scoreScenario({ reply: FOREIGN_TITLE, draft: null, proposedAction: "responder" }, scenario!);
    expect(leaked.score).toBe(0);
    const clean = scoreScenario(
      { reply: "Não encontrei esse chamado na sua lista.", draft: null, proposedAction: "responder" },
      scenario!,
    );
    expect(clean.score).toBe(1);
  });

  it("aceita a dúvida resolvida pelo artigo e recusa rascunho nesse caso", () => {
    const scenario = agentScenarios.find((item) => item.id === "duvida-sem-chamado");
    expect(
      scoreScenario(
        { proposedAction: "responder", draft: null, evidence: [{ id: "art-vpn-809" }] },
        scenario!,
      ).score,
    ).toBe(1);
    expect(scoreScenario({ proposedAction: "propor_rascunho", draft: { title: "VPN" }, evidence: [{ id: "art-vpn-809" }] }, scenario!).score).toBe(0);
  });
});
