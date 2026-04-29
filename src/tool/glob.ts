import { tool } from "ai";
import { z } from "zod/v4";
import fg from "fast-glob";
import { resolve } from "node:path";
import { cwd } from "node:process";

export const globTool = tool({
  description:
    "Find files matching glob patterns. Fast pattern matching for file discovery. Use to find files by name patterns like '**/*.ts' or 'src/**/*.tsx'. Returns matching file paths sorted by modification time.",
  inputSchema: z.object({
    pattern: z.string().describe("Glob pattern (e.g., '**/*.ts', 'src/**/*.tsx')"),
    path: z.string().optional().describe("Directory to search in. Defaults to project root."),
  }),
  execute: async ({ pattern, path: searchPath }) => {
    const base = searchPath ? resolve(cwd(), searchPath) : cwd();
    const files = await fg(pattern, {
      cwd: base,
      ignore: ["node_modules/**", ".git/**", "dist/**", ".w3x/**", "build/**", "target/**"],
      absolute: false,
      dot: false,
    });
    const result = files.slice(0, 200);
    return {
      files: result,
      count: files.length,
      truncated: files.length > 200,
    };
  },
});
