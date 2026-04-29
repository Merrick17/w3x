import { tool } from "ai";
import { z } from "zod";
import { execa } from "execa";
import { cwd } from "node:process";

const WS = cwd();

export const searchTools = {
  searchCodebase: tool({
    description:
      "Search for a text pattern across the whole codebase using git grep. Returns matching files, line numbers, and content.",
    inputSchema: z.object({
      query: z.string().describe("Text or regex pattern to search for"),
      filePattern: z.string().optional().describe('Glob pattern to filter files (e.g. "*.ts")'),
    }),
    execute: async ({ query, filePattern }: { query: string; filePattern?: string }) => {
      try {
        const args = ["grep", "--no-index", "-nI", "--color=never", query];
        if (filePattern) args.push("--", filePattern);
        else args.push("--", ".");
        const r = await execa("git", args, { cwd: WS, reject: false });
        if (r.exitCode !== 0 && r.stdout === "")
          return { results: [], count: 0, message: "No matches found" };
        const lines = r.stdout.split("\n").filter(Boolean).slice(0, 80);
        const results = lines.map((line) => {
          const firstColon = line.indexOf(":");
          const secondColon = line.indexOf(":", firstColon + 1);
          if (firstColon !== -1 && secondColon !== -1) {
            return {
              file: line.slice(0, firstColon),
              line: parseInt(line.slice(firstColon + 1, secondColon), 10),
              content: line.slice(secondColon + 1).trim(),
            };
          }
          return { file: "unknown", line: 0, content: line };
        });
        return { results, count: r.stdout.split("\n").filter(Boolean).length };
      } catch (err) {
        return { results: [], count: 0, error: String(err) };
      }
    },
  }),
};
