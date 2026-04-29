import { tool } from "ai";
import { z } from "zod";
import { execaCommand } from "execa";
import { cwd } from "node:process";

const WS = cwd();

export const gitTools = {
  gitStatus: tool({
    description: "Get the current git status of the project. Shows branch, staged/unstaged changes, and recent commits.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const [branch, status, log, diff] = await Promise.all([
          execaCommand("git rev-parse --abbrev-ref HEAD", { cwd: WS, reject: false, timeout: 5000 }),
          execaCommand("git status --short", { cwd: WS, reject: false, timeout: 5000 }),
          execaCommand("git log --oneline -10", { cwd: WS, reject: false, timeout: 5000 }),
          execaCommand("git diff --stat", { cwd: WS, reject: false, timeout: 5000 }),
        ]);
        return {
          branch: branch.stdout?.trim() || "unknown",
          status: status.stdout?.trim() || "clean",
          recentCommits: log.stdout?.trim() || "none",
          diffStats: diff.stdout?.trim() || "none",
        };
      } catch {
        return { branch: "not a git repo", status: "", recentCommits: "", diffStats: "" };
      }
    },
  }),

  gitDiff: tool({
    description: "Show git diff for staged, unstaged, or specific files.",
    inputSchema: z.object({
      target: z.string().optional().describe('File path or "staged" for staged changes'),
      lines: z.number().optional().describe("Max lines of diff to return (default: 200)"),
    }),
    execute: async ({ target, lines }: { target?: string; lines?: number }) => {
      const maxLines = lines || 200;
      const cmd = target === "staged" ? "git diff --cached" : target ? `git diff "${target}"` : "git diff";
      const r = await execaCommand(cmd, { cwd: WS, reject: false, timeout: 10000 });
      const output = (r.stdout || "").split("\n").slice(0, maxLines).join("\n");
      return { diff: output, truncated: (r.stdout || "").split("\n").length > maxLines };
    },
  }),

  gitLog: tool({
    description: "Show recent git commit history.",
    inputSchema: z.object({
      count: z.number().optional().describe("Number of commits (default: 10)"),
      author: z.string().optional().describe("Filter by author"),
      file: z.string().optional().describe("Filter by file path"),
    }),
    execute: async ({ count, author, file }: { count?: number; author?: string; file?: string }) => {
      let cmd = `git log --oneline -${count || 10}`;
      if (author) cmd += ` --author="${author}"`;
      if (file) cmd += ` -- "${file}"`;
      const r = await execaCommand(cmd, { cwd: WS, reject: false, timeout: 5000 });
      return { log: r.stdout?.trim() || "No commits found" };
    },
  }),
};
