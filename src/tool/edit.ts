import { tool } from "ai";
import { z } from "zod";
import * as fs from "node:fs/promises";
import { safeResolve } from "../file/path-utils";
import { cwd } from "node:process";
import { generateDiff, applyPatchToFile, undoLastPatch, computeFileDiff, validatePatch } from "../patch/index";

const ws = () => cwd();

export const editTools = {
  replaceFileContent: tool({
    description: "Replace a specific range of lines in a file with new content. Use this instead of full file rewrites for surgical edits.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
      startLine: z.number().describe("Starting line number (1-indexed, inclusive)"),
      endLine: z.number().describe("Ending line number (1-indexed, inclusive)"),
      content: z.string().describe("New content to insert in this range"),
    }),
    execute: async ({ path, startLine, endLine, content }: { path: string; startLine: number; endLine: number; content: string }) => {
      const p = safeResolve(path, ws());
      const fileContent = await fs.readFile(p, "utf-8");
      const lines = fileContent.split("\n");
      if (startLine < 1 || startLine > lines.length || endLine < startLine) {
        return { success: false, message: "Invalid line range" };
      }
      const before = lines.slice(0, startLine - 1);
      const after = lines.slice(endLine);
      const newLines = [...before, content, ...after];
      await fs.writeFile(p, newLines.join("\n"), "utf-8");
      return { success: true, message: `Replaced lines ${startLine}-${endLine} in ${path}` };
    },
  }),

  multiReplaceFileContent: tool({
    description: "Perform multiple non-contiguous line replacements in a single file.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
      replacements: z.array(z.object({
        startLine: z.number().describe("Start line (1-indexed)"),
        endLine: z.number().describe("End line (1-indexed)"),
        content: z.string().describe("New content"),
      })).describe("List of replacements. MUST be sorted by line numbers in descending order."),
    }),
    execute: async ({ path, replacements }: { path: string; replacements: Array<{ startLine: number; endLine: number; content: string }> }) => {
      const p = safeResolve(path, ws());
      let fileContent = await fs.readFile(p, "utf-8");
      let lines = fileContent.split("\n");
      const sorted = [...replacements].sort((a, b) => b.startLine - a.startLine);
      for (const r of sorted) {
        if (r.startLine < 1 || r.startLine > lines.length || r.endLine < r.startLine) continue;
        const before = lines.slice(0, r.startLine - 1);
        const after = lines.slice(r.endLine);
        lines = [...before, r.content, ...after];
      }
      await fs.writeFile(p, lines.join("\n"), "utf-8");
      return { success: true, message: `Applied ${replacements.length} replacements to ${path}` };
    },
  }),

  createDiff: tool({
    description: "Generate a unified diff patch for proposed file changes. Use this to preview what would change, then applyDiff to commit.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
      originalContent: z.string().describe("The original file content"),
      modifiedContent: z.string().describe("The proposed new file content"),
    }),
    execute: async ({ path, originalContent, modifiedContent }: { path: string; originalContent: string; modifiedContent: string }) => {
      try {
        const diff = generateDiff(path, originalContent, modifiedContent);
        const validation = validatePatch(diff);
        return { success: validation.valid, diff, valid: validation.valid, error: validation.error };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  }),

  applyDiff: tool({
    description: "Apply a unified diff patch to a file. Creates a .w3x.bak backup before editing.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
      patch: z.string().describe("Unified diff patch to apply"),
    }),
    execute: async ({ path, patch }: { path: string; patch: string }) => {
      const validation = validatePatch(patch);
      if (!validation.valid) return { success: false, error: validation.error };
      return await applyPatchToFile(path, patch);
    },
  }),

  undoEdit: tool({
    description: "Undo the last diff-based edit by restoring from .w3x.bak backup.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
    }),
    execute: async ({ path }: { path: string }) => await undoLastPatch(path),
  }),

  showDiff: tool({
    description: "Show the diff between the current file and its backup.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
    }),
    execute: async ({ path }: { path: string }) => {
      const diff = await computeFileDiff(path);
      if (!diff) return { success: true, diff: "", message: "No backup found for diff comparison" };
      return { success: true, diff };
    },
  }),
};
