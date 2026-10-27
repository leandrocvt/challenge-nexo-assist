import { describe, expect, it } from "vitest";

import { instantFromCivil, type CivilTime } from "./calendar";
import { classifyPriority } from "./priority";
import { canAcceptSessionMessage } from "./session";
import { canReopen, isOverdue, slaDueAt } from "./sla";

function atSaoPaulo(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  const civil: CivilTime = {
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
    millisecond: 0,
  };
  return instantFromCivil(civil);
}

describe("prioridade", () => {
  it("serviço parado para a empresa é crítica", () => {
    expect(
      classifyPriority({ impact: "empresa", urgency: "parado" }),
    ).toEqual({
      kind: "decided",
      priority: "critica",
      confidenceMayBeHigh: true,
    });
  });

  it("serviço parado para uma equipe é crítica", () => {
    expect(classifyPriority({ impact: "equipe", urgency: "parado" })).toMatchObject(
      { priority: "critica" },
    );
  });

  it("uma pessoa impedida de trabalhar é alta", () => {
    expect(
      classifyPriority({ impact: "pessoa", urgency: "impede_trabalho" }),
    ).toMatchObject({ priority: "alta", confidenceMayBeHigh: true });
  });

  it("compromisso no mesmo dia é alta", () => {
    expect(
      classifyPriority({ impact: "pessoa", urgency: "compromisso_hoje" }),
    ).toMatchObject({ priority: "alta" });
  });

  it("algo parado só para uma pessoa é alta, não crítica", () => {
    expect(
      classifyPriority({ impact: "pessoa", urgency: "parado" }),
    ).toMatchObject({ priority: "alta" });
  });

  it("atrapalha e há alternativa é média", () => {
    expect(
      classifyPriority({ impact: "pessoa", urgency: "ha_alternativa" }),
    ).toEqual({
      kind: "decided",
      priority: "media",
      confidenceMayBeHigh: true,
    });
  });

  it("pedido sem urgência é baixa", () => {
    expect(
      classifyPriority({ impact: "pessoa", urgency: "sem_urgencia" }),
    ).toEqual({
      kind: "decided",
      priority: "baixa",
      confidenceMayBeHigh: true,
    });
  });

  it("equipe afetada com alternativa não autoriza segurança alta", () => {
    expect(
      classifyPriority({ impact: "equipe", urgency: "ha_alternativa" }),
    ).toEqual({
      kind: "decided",
      priority: "media",
      confidenceMayBeHigh: false,
    });
  });

  it("sem impacto ou sem urgência não inventa prioridade", () => {
    expect(classifyPriority({ impact: null, urgency: "parado" })).toEqual({
      kind: "incomplete",
    });
    expect(classifyPriority({ impact: "pessoa", urgency: null })).toEqual({
      kind: "incomplete",
    });
  });
});

describe("prazo", () => {
  it("crítica conta 1 hora corrida, inclusive de madrugada no sábado", () => {
    const from = atSaoPaulo(2026, 10, 24, 1);
    expect(slaDueAt("critica", from).getTime()).toBe(
      atSaoPaulo(2026, 10, 24, 2).getTime(),
    );
  });

  it("alta na sexta às 17h atravessa a noite e o fim de semana", () => {
    const from = atSaoPaulo(2026, 10, 23, 17);
    expect(slaDueAt("alta", from).getTime()).toBe(
      atSaoPaulo(2026, 10, 26, 11).getTime(),
    );
  });

  it("alta na quinta às 17h atravessa a noite e vence na sexta às 11h", () => {
    const from = atSaoPaulo(2026, 10, 22, 17);
    expect(slaDueAt("alta", from).getTime()).toBe(
      atSaoPaulo(2026, 10, 23, 11).getTime(),
    );
  });

  it("média soma 3 dias úteis e preserva o horário", () => {
    const from = atSaoPaulo(2026, 10, 22, 10);
    expect(slaDueAt("media", from).getTime()).toBe(
      atSaoPaulo(2026, 10, 27, 10).getTime(),
    );
  });

  it("baixa soma 5 dias úteis", () => {
    const from = atSaoPaulo(2026, 10, 27, 10);
    expect(slaDueAt("baixa", from).getTime()).toBe(
      atSaoPaulo(2026, 11, 3, 10).getTime(),
    );
  });

  it("vencido é o relógio depois do prazo, e chamado resolvido ou aprovado não vence", () => {
    const due = atSaoPaulo(2026, 10, 27, 12);
    const after = atSaoPaulo(2026, 10, 27, 12, 1);
    expect(isOverdue("em_andamento", due, after)).toBe(true);
    expect(isOverdue("em_andamento", due, due)).toBe(false);
    expect(isOverdue("resolvido", due, after)).toBe(false);
    expect(isOverdue("aprovado", due, after)).toBe(false);
  });
});

describe("reabertura", () => {
  const now = atSaoPaulo(2026, 10, 27, 15);

  it("resolvido há 4 dias reabre", () => {
    const resolvedAt = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    expect(canReopen(resolvedAt, now)).toBe(true);
  });

  it("resolvido há exatamente 7 dias reabre", () => {
    const resolvedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(canReopen(resolvedAt, now)).toBe(true);
  });

  it("resolvido há 8 dias não reabre", () => {
    const resolvedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    expect(canReopen(resolvedAt, now)).toBe(false);
  });
});

describe("sessão", () => {
  it("a 30ª mensagem ainda entra e a 31ª não", () => {
    expect(canAcceptSessionMessage(29)).toBe(true);
    expect(canAcceptSessionMessage(30)).toBe(false);
  });
});
