import { tool } from "ai";
import { z } from "zod/v4";

export interface CronJob {
  id: string;
  cron: string;
  prompt: string;
  recurring: boolean;
  createdAt: number;
}

const jobs = new Map<string, CronJob>();
let nextJobId = 1;

export const cronTools = {
  cronCreate: tool({
    description:
      "Schedule a recurring or one-shot task. Uses standard 5-field cron syntax (minute hour day-of-month month day-of-week).",
    inputSchema: z.object({
      cron: z
        .string()
        .describe(
          "5-field cron expression (e.g., '*/5 * * * *' = every 5 min, '0 9 * * 1-5' = weekdays 9am)",
        ),
      prompt: z.string().describe("The prompt to execute at each fire time"),
      recurring: z
        .boolean()
        .default(true)
        .describe("Repeat on schedule (true) or fire once (false)"),
    }),
    execute: async ({
      cron,
      prompt,
      recurring,
    }: {
      cron: string;
      prompt: string;
      recurring: boolean;
    }) => {
      const id = `cron-${nextJobId++}`;
      const job: CronJob = { id, cron, prompt, recurring, createdAt: Date.now() };
      jobs.set(id, job);
      return {
        jobId: id,
        cron,
        recurring,
        message: `Cron job ${id} scheduled: ${cron}`,
      };
    },
  }),

  cronDelete: tool({
    description: "Cancel a previously scheduled cron job.",
    inputSchema: z.object({
      id: z.string().describe("Job ID returned by cronCreate"),
    }),
    execute: async ({ id }: { id: string }) => {
      const deleted = jobs.delete(id);
      return {
        success: deleted,
        message: deleted ? `Deleted cron job ${id}` : `Job ${id} not found`,
      };
    },
  }),

  cronList: tool({
    description: "List all scheduled cron jobs.",
    inputSchema: z.object({}),
    execute: async () => {
      const all = Array.from(jobs.values());
      return {
        jobs: all,
        count: all.length,
      };
    },
  }),
};
