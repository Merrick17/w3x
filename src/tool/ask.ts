import { tool } from "ai";
import { z } from "zod/v4";

export const askTool = tool({
  description:
    "Ask the user a question to clarify requirements, get preferences, or request approval. Use when the task is ambiguous or the user needs to make a decision.",
  inputSchema: z.object({
    question: z.string().describe("The question to ask the user"),
    options: z
      .array(z.string())
      .max(4)
      .min(2)
      .optional()
      .describe("Available choices (2-4 options). If omitted, user provides free-text response."),
  }),
  execute: async ({
    question,
    options,
  }: {
    question: string;
    options?: string[];
  }) => {
    return {
      question,
      options: options ?? [],
      awaitingResponse: true,
      message: `Question for user: ${question}`,
    };
  },
});
