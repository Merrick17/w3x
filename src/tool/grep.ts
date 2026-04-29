import { tool } from "ai";
import { z } from "zod/v4";
import fg from "fast-glob";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";

async function searchInFiles(
  pattern: string,
  searchPath: string,
  fileGlob: string,
): Promise<Array<{ file: string; line: number; content: string }>> {
  const regex = new RegExp(pattern, "gi");
  const files = await fg(fileGlob, {
    cwd: searchPath,
    ignore: ["node_modules/**", ".git/**", "dist/**", ".w3x/**", "build/**", "target/**"],
    absolute: true,
    dot: false,
  });

  const results: Array<{ file: string; line: number; content: string }> = [];
  for (const file of files.slice(0, 1000)) {
    try {
      if (!existsSync(file)) continue;
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          regex.lastIndex = 0;
          results.push({
            file: file.replace(searchPath, "").replace(/^[/\\]/, ""),
            line: i + 1,
            content: lines[i].trim().slice(0, 200),
          });
          if (results.length >= 250) break;
        }
      }
    } catch {
      // skip unreadable files
    }
    if (results.length >= 250) break;
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
