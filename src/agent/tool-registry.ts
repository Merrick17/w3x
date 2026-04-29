import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { allTools as coreTools } from "../tool/index";
import { truncateToolOutput } from "../context/index";
import { getMcpClient } from "../mcp/index";
import { logger } from "../lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = any;

export class ToolRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static pluginTools: Record<string, any> = {};
  private static wrappedCache: AnyTool | null = null;
  private static cacheVersion = 0;
  private static lastBuiltVersion = -1;

  static invalidateCache(): void {
    this.cacheVersion += 1;
    this.wrappedCache = null;
  }

  static async loadPlugins() {
    this.pluginTools = {};
    const pluginsDir = resolve(cwd(), "src/plugins");
    try {
      const files = await readdir(pluginsDir);
      for (const file of files) {
        if (file.endsWith(".ts") || file.endsWith(".js")) {
          try {
            const moduleUrl = pathToFileURL(resolve(pluginsDir, file)).href;
            const plugin = await import(moduleUrl);
            for (const [key, tool] of Object.entries(plugin)) {
              if (tool && typeof tool === "object" && "execute" in tool) {
                this.pluginTools[key] = tool;
              }
            }
          } catch (e) {
            logger.warn("tool-registry", `Failed to load plugin ${file}: ${logger.fromError("plugin", e)}`);
          }
        }
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn("tool-registry", `Error reading plugins directory: ${logger.fromError("plugins", e)}`);
      }
    }
    this.invalidateCache();
  }

  private static wrapWithTruncation(tool: AnyTool, toolName: string): AnyTool {
    if (!tool || typeof tool.execute !== "function") return tool;
    const originalExecute = tool.execute.bind(tool);

    return {
      ...tool,
      execute: async (args: AnyTool) => {
        const result = await originalExecute(args);
        if (typeof result === "string") return truncateToolOutput(result, toolName);
        if (result && typeof result === "object") {
          if ("content" in result && typeof result.content === "string") {
            return { ...result, content: truncateToolOutput(result.content, toolName) };
          }
          const truncated = { ...result };
          for (const key of ["stdout", "output", "body", "diff", "log"]) {
            if (typeof truncated[key] === "string") {
              truncated[key] = truncateToolOutput(truncated[key] as string, toolName);
            }
          }
          return truncated;
        }
        return result;
      },
    };
  }

  static getTools(): AnyTool {
    if (this.wrappedCache && this.lastBuiltVersion === this.cacheVersion) {
      return this.wrappedCache;
    }
    const allTools = { ...coreTools, ...this.pluginTools, ...getMcpClient().getTools() };
    const wrapped: Record<string, AnyTool> = {};
    for (const [name, tool] of Object.entries(allTools)) {
      wrapped[name] = this.wrapWithTruncation(tool, name);
    }
    this.wrappedCache = wrapped;
    this.lastBuiltVersion = this.cacheVersion;
    return wrapped;
  }
}
