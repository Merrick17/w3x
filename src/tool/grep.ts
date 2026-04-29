import { tool } from "ai";
import { z } from "zod/v4";
import { execaCommand } from "execa";
import { resolve } from "node:path";
import { cwd } from "node:process";

async function searchInFiles(
  pattern: string,
  searchPath: string,
  fileGlob: string,
): Promise<Array<{ file: string; line: number; content: string }>> {
  const cmd = `rg --line-number --no-heading --glob "${fileGlob}" "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`;
  const result = await execaCommand(cmd, {
    shell: process.platform === "win32" ? "powershell" : true,
    reject: false,
    timeout: 20000,
  });
  const results: Array<{ file: string; line: number; content: string }> = [];
  const lines = (result.stdout ?? "").split("\n").filter(Boolean);
  for (const line of lines.slice(0, 250)) {
    const m = line.match(/^(.*?):(\d+):(.*)$/);
    if (!m) continue;
    results.push({
      file: m[1].replace(searchPath, "").replace(/^[/\\]/, ""),
      line: Number(m[2]),
      content: m[3].trim().slice(0, 200),
    });
  }

  return results;
}

export const grepTool = tool({
  description:
    "Search file contents using regex patterns. Returns matching files with line numbers and context. Use for finding code patterns, function usage, string occurrences, etc.",
  inputSchema: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    path: z.string().optional().describe("File or directory to search in. Defaults to project root."),
    glob: z
      .string()
      .optional()
      .describe('Glob to filter files (e.g., "*.ts", "**/*.tsx"). Defaults to all text files.'),
    outputMode: z
      .enum(["content", "files_with_matches", "count"])
      .optional()
      .describe("Output mode. Defaults to content."),
  }),
  execute: async ({
    pattern,
    path: searchPath,
    glob: fileGlob,
    outputMode,
  }: {
    pattern: string;
    path?: string;
    glob?: string;
    outputMode?: "content" | "files_with_matches" | "count";
  }) => {
    const base = searchPath ? resolve(cwd(), searchPath) : cwd();
    const globPattern = fileGlob ?? "**/*.{ts,tsx,js,jsx,json,md,css,html,py,rs,go,java}";
    const matches = await searchInFiles(pattern, base, globPattern);

    if (outputMode === "files_with_matches") {
      const uniqueFiles = [...new Set(matches.map((m) => m.file))];
      return { files: uniqueFiles, count: uniqueFiles.length };
    }

    if (outputMode === "count") {
      return { count: matches.length, matches: matches.length };
    }

    return {
      matches: matches.slice(0, 250),
      count: matches.length,
      truncated: matches.length > 250,
    };
  },
});
