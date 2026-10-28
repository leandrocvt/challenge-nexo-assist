import { describe, expect, it } from "vitest";

import { MODEL_MESSAGE_WINDOW, modelWindow, type SpokenMessage } from "./window";

describe("janela do modelo", () => {
  it("manda só a fala atual quando a conversa ainda não tem histórico", () => {
    const window = modelWindow([], "A VPN caiu");
    expect(window.omitted).toBe(0);
    expect(window.messages).toEqual([{ role: "user", content: "A VPN caiu" }]);
  });

  it("corta o que passa da janela e conserva a fala nova", () => {
    const prior = Array.from({ length: MODEL_MESSAGE_WINDOW + 2 }, (_, index): SpokenMessage => ({
      author: index % 2 === 0 ? "employee" : "agent",
      body: `fala ${index}`,
    }));
    const window = modelWindow(prior, "fala nova");
    expect(window.omitted).toBe(2);
    expect(window.messages[0]).toEqual({
      role: "user",
      content: "Há 2 mensagens anteriores desta conversa que não entram nesta chamada.",
    });
    expect(window.messages.at(-1)).toEqual({ role: "user", content: "fala nova" });
    expect(window.messages.some((message) => message.content === "fala 0")).toBe(false);
    expect(window.messages.some((message) => message.content === "fala 1")).toBe(false);
    expect(window.messages.some((message) => message.content === "fala 2")).toBe(true);
  });

  it("marca a fala do analista e ignora texto vazio", () => {
    const window = modelWindow(
      [
        { author: "analyst", body: "Pode reiniciar." },
        { author: "employee", body: "   " },
      ],
      "Reiniciei.",
    );
    expect(window.messages).toEqual([
      { role: "assistant", content: "Analista: Pode reiniciar." },
      { role: "user", content: "Reiniciei." },
    ]);
  });
});
