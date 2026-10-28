import { describe, expect, it } from "vitest";

import { unreadForAnalyst } from "./inbox";

describe("mensagens novas para o analista", () => {
  it("conta as falas do funcionário depois da última resposta do agent", () => {
    expect(unreadForAnalyst(["employee", "agent", "employee", "employee", "agent"])).toBe(2);
    expect(unreadForAnalyst(["agent", "employee"])).toBe(1);
  });

  it("zera quando o analista já respondeu por último", () => {
    expect(unreadForAnalyst(["employee", "agent", "employee", "analyst"])).toBe(0);
  });
});
