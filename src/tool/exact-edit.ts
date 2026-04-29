import { tool } from "ai";
import { z } from "zod/v4";
import * as fs from "node:fs/promises";
import { safeResolve } from "../file/path-utils";

export const exactEditTool = tool({
  description:
    "Edit a file by replacing an exact string match with new content. The old_string must exactly match a portion of the file, including whitespace and indentation. Use replaceAll to replace every occurrence.",
  inputSchema: z.object({
    path: z.string().describe("File path relative to project root"),
    oldString: z.string().describe("The exact text to find and replace"),
    newString: z.string().describe("The replacement text"),
    replaceAll: z
      .boolean()
      .optional()
      .describe("Replace all occurrences. Default: false (replace first only)"),
  }),
  execute: async ({
    path,
    oldString,
    newString,
    replaceAll,
  }: {
    path: string;
    oldString: string;
    newString: string;
    replaceAll?: boolean;
  }) => {
    const resolved = safeResolve(path);
    const content = await fs.readFile(resolved, "utf-8");

    if (!content.includes(oldString)) {
      return {
        success: false,
        error: "old_string not found in file",
        hint: "Read the file first to get the exact content, including whitespace and indentation.",
      };
    }

    const occurrenceCount = content.split(oldString).length - 1;

    if (replaceAll && occurrenceCount > 1) {
      const newContent = content.split(oldString).join(newString);
      await fs.writeFile(resolved, newContent, "utf-8");
      return {
        success: true,
        replaced: occurrenceCount,
        message: `Replaced ${occurrenceCount} occurrences`,
      };
    }

    const newContent = content.replace(oldString, newString);
    await fs.writeFile(resolved, newContent, "utf-8");

    return {
      success: true,
      replaced: 1,
      message: "Replaced 1 occurrence",
    };
  },
});
