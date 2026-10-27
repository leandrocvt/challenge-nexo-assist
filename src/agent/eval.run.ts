import { createScorer, runEvals } from "@mastra/core/evals";
import { RequestContext } from "@mastra/core/request-context";

import { decisionSchema } from "../attendance/decision";
import { mastra } from "./desk";
import { agentScenarios, scoreScenario, type ScenarioCheck } from "./scenarios";

const decisionGate = createScorer({
  id: "cenario",
  description: "A decisão estruturada cumpre o cenário congelado, sem vazar chamado alheio.",
  type: "agent",
}).generateScore(({ run }) => {
  const check = run.groundTruth as ScenarioCheck;
  return scoreScenario(run.output, check).score;
});

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Defina OPENAI_API_KEY. npm run eval chama o modelo e não faz parte do npm test.");
}

const failures: string[] = [];

const result = await runEvals({
  target: mastra.getAgent("nexoAssist"),
  data: agentScenarios.map((scenario) => ({
    input: scenario.input,
    groundTruth: scenario,
    requestContext: anaContext(),
  })),
  gates: [decisionGate],
  concurrency: 1,
  onItemComplete: ({ item, targetResult }) => {
    const check = item.groundTruth as ScenarioCheck;
    const verdict = scoreScenario(targetResult.scoringData?.output, check);
    if (verdict.score < 1) {
      failures.push(`${check.id}: ${verdict.missing.join("; ")}`);
    }
  },
  targetOptions: {
    maxSteps: 5,
    structuredOutput: {
      schema: decisionSchema,
      errorStrategy: "strict",
      jsonPromptInjection: true,
    },
  },
});

if (failures.length > 0) {
  throw new Error(`Avaliação do agent falhou.\n${failures.join("\n")}`);
}

if (result.verdict === "failed" || result.summary.totalItems !== agentScenarios.length) {
  throw new Error("A avaliação do agent não passou.");
}

function anaContext() {
  const requestContext = new RequestContext();
  requestContext.set("employeeId", "ana");
  requestContext.set("conversationId", "eval-ana");
  return requestContext;
}
