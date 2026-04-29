import { tool } from "ai";
import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { safeResolve } from "../file/path-utils";
import { ToolRegistry } from "../agent/tool-registry";

/**
 * Sanitize a plugin name so it is safe to use as a filename.
 * Only allows alphanumeric characters, hyphens, and underscores.
 */
const sanitizePluginName = (name: string): string => {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  if (!cleaned || /^_+$/.test(cleaned)) {
    throw new Error(`Invalid plugin name: "${name}"`);
  }
  return cleaned;
};

export const installPlugin = tool({
  description:
    "Install a custom skill plugin by writing its TypeScript code to the plugins directory. This immediately registers new tools for the agent.",
  inputSchema: z.object({
    name: z.string().describe('The name of the plugin (e.g., "weather", "github")'),
    code: z
      .string()
      .describe(
        "The TypeScript code for the plugin. Must export tools compatible with Vercel AI SDK.",
      ),
  }),
  execute: async ({ name, code }) => {
    const safeName = sanitizePluginName(name);

    const pluginsDir = safeResolve("src/plugins");
    await mkdir(pluginsDir, { recursive: true });

    const filePath = resolve(pluginsDir, `${safeName}.ts`);

    // Verify the resolved path stays within project
    safeResolve(filePath);

    await writeFile(filePath, code, "utf-8");

    // Reload plugins to pick up the new one
    await ToolRegistry.loadPlugins();

    return {
      success: true,
      message: `Plugin "${safeName}" installed successfully and tools registered.`,
      path: filePath,
    };
  },
});
