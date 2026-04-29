import { tool } from "ai";
import { z } from "zod";
import { execaCommand } from "execa";
import * as fs from "node:fs/promises";
import { cwd } from "node:process";
import { safeResolve } from "../file/path-utils";

const ROOT = cwd();
const safe = (p: string) => safeResolve(p, ROOT);

const isWindows = process.platform === "win32";

export const frontendTools = {
  analyzeReactTree: tool({
    description:
      "Parse a JSX/TSX file to extract component hierarchies and props using regex (simulated AST analysis).",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
    }),
    execute: async ({ path }) => {
      const fullPath = safe(path);
      const content = await fs.readFile(fullPath, "utf-8");

      const components = [
        ...content.matchAll(
          /function\s+(\w+)\s*\((.*?)\)|const\s+(\w+)\s*=\s*(?:\(.*?\))?\s*=>/g,
        ),
      ];
      const props = [
        ...content.matchAll(/interface\s+(\w+Props)|type\s+(\w+Props)\s*=/g),
      ];

      return {
        path,
        components: components.map((m) => m[1] || m[3]),
        propDefinitions: props.map((m) => m[1] || m[2]),
        isFunctional: content.includes("=>") || content.includes("function"),
        usesHooks:
          content.includes("useState") ||
          content.includes("useEffect") ||
          content.includes("useMemo"),
      };
    },
  }),

  packageManagerExecute: tool({
    description:
      "Execute package manager commands (npm, yarn, pnpm) to install dependencies or run build/test scripts.",
    inputSchema: z.object({
      command: z
        .string()
        .describe(
          'Command to run (e.g., "npm install @solana/kit", "npm run build")',
        ),
    }),
    execute: async ({ command }) => {
      const r = await execaCommand(command, {
        cwd: ROOT,
        shell: isWindows ? "powershell" : true,
        reject: false,
      });
      return {
        success: r.exitCode === 0,
        stdout: r.stdout?.slice(0, 5000) ?? "",
        stderr: r.stderr?.slice(0, 2000) ?? "",
      };
    },
  }),

  lintAndFix: tool({
    description: "Run ESLint/Prettier programmatically on a file or directory.",
    inputSchema: z.object({
      path: z.string().describe("Path to lint (relative to project root)"),
      fix: z
        .boolean()
        .optional()
        .describe("Whether to apply fixes automatically"),
    }),
    execute: async ({ path, fix }) => {
      // Validate the path stays within the project
      safe(path);
      const cmd = `npx eslint "${path}" ${fix ? "--fix" : ""}`;
      const r = await execaCommand(cmd, {
        cwd: ROOT,
        shell: isWindows ? "powershell" : true,
        reject: false,
      });
      return {
        success: r.exitCode === 0,
        output: r.stdout || r.stderr || "No issues found",
      };
    },
  }),
};
