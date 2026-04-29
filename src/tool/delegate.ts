import { tool } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import { SubAgent, SUB_AGENT_TYPES } from "../agent/sub-agent";

let _currentModel: LanguageModel | null = null;

export function setDelegationModel(model: LanguageModel) {
  _currentModel = model;
}

export const delegateTool = {
  delegateTask: tool({
    description:
      "Spawn a read-only sub-agent to handle complex, multi-step research or exploration tasks independently. Sub-agents can read files, search code, and explore the codebase but cannot modify anything.",
    inputSchema: z.object({
      task: z.string().describe("Detailed description of what the sub-agent should investigate"),
      agentType: z
        .enum(["general", "explorer", "reviewer"])
        .optional()
        .describe("Type of sub-agent to spawn (default: general)"),
    }),
    execute: async ({
      task,
      agentType,
    }: {
      task: string;
      agentType?: "general" | "explorer" | "reviewer";
    }) => {
      if (!_currentModel)
        return { success: false, error: "No model available for sub-agent delegation" };
      const config = SUB_AGENT_TYPES[agentType ?? "general"];
      const agent = new SubAgent(_currentModel, config);
      const result = await agent.execute(task);
      return {
        success: result.success,
        result: result.success
          ? `[Sub-agent: ${agentType ?? "general"}]\n${result.text}\n\n(Tools called: ${result.toolCalls}, Steps: ${result.stepCount})`
          : `[Sub-agent: ${agentType ?? "general"}] Error: ${result.error}`,
      };
    },
  }),
};
