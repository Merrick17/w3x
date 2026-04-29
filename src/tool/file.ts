import { tool } from "ai";
import { z } from "zod";
import * as fs from "node:fs/promises";
import { resolve, isAbsolute, relative, basename } from "node:path";
import { cwd } from "node:process";
import fg from "fast-glob";
import { safeResolve } from "../file/path-utils";

let CURRENT_WORKSPACE = cwd();
const toPosix = (p: string) => p.replace(/\\/g, "/");
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const PDF_EXT = ".pdf";

function safe(p: string) {
  return safeResolve(p, CURRENT_WORKSPACE);
}

export function getWorkspaceRoot() {
  return CURRENT_WORKSPACE;
}

export function setWorkspaceRoot(p: string) {
  CURRENT_WORKSPACE = p;
}

async function readFileContent(resolvedPath: string, offset?: number, limit?: number) {
  const ext = basename(resolvedPath).toLowerCase();

  // Image files: return base64 data URL
  if (IMAGE_EXTS.has(ext) || ext.endsWith(PDF_EXT)) {
    const isPdf = ext.endsWith(PDF_EXT);
    const mimeType = isPdf ? "application/pdf" : `image/${ext.slice(1)}`;
    const buf = await fs.readFile(resolvedPath);
    const base64 = buf.toString("base64");
    return {
      mimeType,
      base64: base64.slice(0, 200_000),
      size: buf.length,
      truncated: base64.length > 200_000,
      message: `${isPdf ? "PDF" : "Image"} file, ${buf.length} bytes`,
    };
  }

  // Text files with optional line range
  const content = await fs.readFile(resolvedPath, "utf-8");
  if (offset === undefined && limit === undefined) {
    return { content };
  }
  const lines = content.split("\n");
  const start = Math.max(0, offset ?? 0);
  const end = limit ? start + limit : lines.length;
  const sliced = lines.slice(start, end);
  return {
    content: sliced.join("\n"),
    lineRange: { start: start + 1, end: Math.min(end, lines.length) },
    totalLines: lines.length,
    truncated: end < lines.length,
  };
}

export const fileTools = {
  readFile: tool({
    description:
      "Read a file from the project. Supports text files with optional line range (offset/limit), images (PNG, JPG, GIF, WebP, SVG), and PDFs.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
      offset: z.number().optional().describe("Start reading at this line number (0-indexed)"),
      limit: z.number().optional().describe("Maximum number of lines to read"),
    }),
    execute: async ({ path, offset, limit }: { path: string; offset?: number; limit?: number }) =>
      readFileContent(safe(path), offset, limit),
  }),

  read: tool({
    description:
      "Read a file from the project. Supports text files with optional line range (offset/limit), images (PNG, JPG, GIF, WebP, SVG), and PDFs.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
      offset: z.number().optional().describe("Start reading at this line number (0-indexed)"),
      limit: z.number().optional().describe("Maximum number of lines to read"),
    }),
    execute: async ({ path, offset, limit }: { path: string; offset?: number; limit?: number }) =>
      readFileContent(safe(path), offset, limit),
  }),

  writeFile: tool({
    description: "Write content to a file. Creates parent directories if needed.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
      content: z.string().describe("File content to write"),
    }),
    execute: async ({ path, content }: { path: string; content: string }) => {
      const p = safe(path);
      await fs.mkdir(resolve(p, ".."), { recursive: true });
      await fs.writeFile(p, content, "utf-8");
      return { success: true, path, size: content.length };
    },
  }),

  write: tool({
    description: "Write content to a file. Creates parent directories if needed.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
      content: z.string().describe("File content to write"),
    }),
    execute: async ({ path, content }: { path: string; content: string }) => {
      const p = safe(path);
      await fs.mkdir(resolve(p, ".."), { recursive: true });
      await fs.writeFile(p, content, "utf-8");
      return { success: true, path, size: content.length };
    },
  }),

  listFiles: tool({
    description: "List files in a directory tree. Shows file names and structure.",
    inputSchema: z.object({
      path: z.string().optional().describe("Directory path (default: project root)"),
      depth: z.number().optional().describe("Max depth (default: 3)"),
    }),
    execute: async ({ path, depth }: { path?: string; depth?: number }) => {
      const p = safe(path || ".");
      const st = await fs.stat(p);
      if (!st.isDirectory()) return { files: [relative(CURRENT_WORKSPACE, p)] };
      return {
        files: await fg("**/*", {
          ignore: ["node_modules/**", ".git/**", "dist/**", ".w3x/**"],
          onlyFiles: true,
          deep: depth || 3,
          cwd: toPosix(p),
          absolute: false,
        }),
      };
    },
  }),

  treeView: tool({
    description: "Get a directory tree view of the project structure.",
    inputSchema: z.object({
      path: z.string().optional().describe("Root directory (default: current workspace)"),
      depth: z.number().optional().describe("Depth (default: 4)"),
    }),
    execute: async ({ path, depth }: { path?: string; depth?: number }) => {
      const maxDepth = depth || 4;
      const dir = path || ".";
      const p = safe(dir);
      const files = await fg("**/*", {
        ignore: ["node_modules/**", ".git/**", "dist/**", ".w3x/**"],
        onlyFiles: false,
        deep: maxDepth,
        cwd: toPosix(p),
        absolute: false,
      });
      const maxFiles = 200;
      const limited = files.slice(0, maxFiles);
      const treeLines: string[] = [];
      const pathSet = new Set<string>();
      const dirGuess = new Set<string>();
      for (const f of limited) {
        const parts = f.split(/[/\\]/);
        let current = "";
        for (let i = 0; i < parts.length - 1; i++) {
          current = current ? `${current}/${parts[i]}` : parts[i];
          dirGuess.add(current);
        }
      }
      for (const f of limited) {
        const parts = f.split(/[/\\]/);
        let currentPath = "";
        for (let i = 0; i < parts.length; i++) {
          const name = parts[i];
          currentPath = currentPath ? `${currentPath}/${name}` : name;
          if (!pathSet.has(currentPath)) {
            pathSet.add(currentPath);
            const indent = "  ".repeat(i);
            const isDir = dirGuess.has(currentPath) || i < parts.length - 1;
            treeLines.push(`${indent}${isDir ? "📁 " : "📄 "}${name}`);
          }
        }
      }
      return {
        workspace: CURRENT_WORKSPACE,
        tree: treeLines.length > 0 ? treeLines.join("\n") : "Empty",
        totalFiles: files.length,
        truncated: files.length > maxFiles,
      };
    },
  }),

  getWorkspace: tool({
    description: "Get the current working directory (workspace) of the agent.",
    inputSchema: z.object({}),
    execute: async () => ({ path: CURRENT_WORKSPACE }),
  }),

  setWorkspace: tool({
    description: "Change the agent's current working directory to a new path.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path to the new workspace"),
    }),
    execute: async ({ path }) => {
      const p = isAbsolute(path) ? path : resolve(CURRENT_WORKSPACE, path);
      try {
        const stats = await fs.stat(p);
        if (!stats.isDirectory()) return { error: `Not a directory: ${p}` };
        CURRENT_WORKSPACE = p;
        return { success: true, message: `Workspace changed to ${p}`, path: p };
      } catch (err) {
        return {
          error: `Failed to access path: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  }),
};
