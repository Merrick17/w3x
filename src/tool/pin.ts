import { tool } from "ai";
import { z } from "zod";
import { safeResolve } from "../file/path-utils";
import { cwd } from "node:process";

const WS = cwd();
export const PINNED_FILES = new Set<string>();

export const pinTools = {
  pinFile: tool({
    description: "Pin a file to the conversation context so the agent always sees its content.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
    }),
    execute: async ({ path }: { path: string }) => {
      const p = safeResolve(path, WS);
      PINNED_FILES.add(p);
      return { success: true, message: `Pinned ${path} to context.` };
    },
  }),

  unpinFile: tool({
    description: "Unpin a file from the conversation context.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
    }),
    execute: async ({ path }: { path: string }) => {
      const p = safeResolve(path, WS);
      PINNED_FILES.delete(p);
      return { success: true, message: `Unpinned ${path} from context.` };
    },
  }),
};
