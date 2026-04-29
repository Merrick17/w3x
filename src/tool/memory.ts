import { tool } from "ai";
import { z } from "zod";
import * as fs from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";
import fg from "fast-glob";
import { saveMemoryEntry, type MemoryType } from "../memory/memory-md";

const WS = cwd();

export const memoryTools = {
  saveMemory: tool({
    description:
      "Save a key-value note to persistent memory. Use this to remember important context across sessions. For structured memories, use memorySaveMd instead.",
    inputSchema: z.object({
      key: z.string().describe('Memory key (e.g. "project:architecture")'),
      value: z.string().describe("Memory value to save"),
    }),
    execute: async ({ key, value }: { key: string; value: string }) => {
      const memDir = resolve(WS, ".w3x", "memory");
      await fs.mkdir(memDir, { recursive: true });
      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
      await fs.writeFile(
        resolve(memDir, `${safeKey}.json`),
        JSON.stringify({ key, value, savedAt: new Date().toISOString() }, null, 2),
        "utf-8",
      );
      return { success: true, message: `Saved memory: ${key}` };
    },
  }),

  recallMemory: tool({
    description: "Recall a saved memory by key, or list all memories if no key given.",
    inputSchema: z.object({
      key: z.string().optional().describe("Memory key to recall (omit to list all)"),
    }),
    execute: async ({ key }: { key?: string }) => {
      const memDir = resolve(WS, ".w3x", "memory");
      try {
        if (key) {
          const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
          const content = await fs.readFile(resolve(memDir, `${safeKey}.json`), "utf-8");
          return JSON.parse(content);
        }
        const files = await fg("*.json", { cwd: memDir, absolute: false });
        const memories = await Promise.all(
          files.map(async (f) => {
            try {
              return JSON.parse(await fs.readFile(resolve(memDir, f), "utf-8"));
            } catch {
              return null;
            }
          }),
        );
        return {
          memories: memories.filter(Boolean),
          count: memories.filter(Boolean).length,
        };
      } catch {
        return {
          memories: [],
          count: 0,
          message: key ? `Memory "${key}" not found` : "No memories saved",
        };
      }
    },
  }),

  memorySaveMd: tool({
    description:
      "Save a structured memory entry to MEMORY.md. Supports types: user (about the user), feedback (preferences/corrections), project (work context), reference (external resources).",
    inputSchema: z.object({
      title: z.string().describe("Memory name/title"),
      description: z.string().describe("One-line description"),
      type: z
        .enum(["user", "feedback", "project", "reference"])
        .describe("Memory type: user, feedback, project, or reference"),
      body: z
        .string()
        .describe(
          "Memory content. For feedback/project types, structure as: rule/fact, then Why: and How to apply: lines.",
        ),
      target: z
        .enum(["project", "local"])
        .optional()
        .describe(
          "Save to project (.w3x/MEMORY.md) or local (.w3x/MEMORY.local.md). Default: project.",
        ),
    }),
    execute: async ({
      title,
      description,
      type,
      body,
      target,
    }: {
      title: string;
      description: string;
      type: MemoryType;
      body: string;
      target?: "project" | "local";
    }) => {
      const path = await saveMemoryEntry({ title, description, type, body }, target || "project");
      return {
        success: true,
        path,
        message: `Memory "${title}" saved to ${target || "project"} MEMORY.md`,
      };
    },
  }),
};
