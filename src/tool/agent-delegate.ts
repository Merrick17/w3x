import { tool } from "ai";
import { z } from "zod/v4";

export const agentTool = tool({
  description:
    "Launch a sub-agent to handle complex, multi-step tasks. Available types: 'general' (default, max 20 steps), 'explorer' (for codebase exploration, max 15), 'reviewer' (for code review, max 10). Sub-agents run in read-only mode.",
  inputSchema: z.object({
    description: z.string().describe("Short (3-5 word) description of the sub-agent's task"),
    prompt: z
      .string()
      .describe(
        "The task for the sub-agent. Include context, requirements, and expected output format.",
      ),
    subagentType: z
      .enum(["general", "explorer", "reviewer"])
      .optional()
      .describe("Type of sub-agent. Default: general"),
  }),
  execute: async ({ description, prompt, subagentType: _type }) => {
    // Delegation is actually handled by the main agent loop intercepting
    // tool calls. This returns a structured delegation request.
    return {
      delegated: true,
      agentType: _type ?? "general",
      description,
      prompt: prompt.slice(0, 500) + (prompt.length > 500 ? "..." : ""),
      message: `Task delegated to ${_type ?? "general"} sub-agent`,
    };
  },
});
