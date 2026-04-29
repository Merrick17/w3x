import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";
import { tool } from "ai";
import { z } from "zod";

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface McpToolRegistration {
  serverName: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP (Model Context Protocol) client for connecting to external tool servers.
 * Follows the OpenCode pattern of MCP integration for extensible tool sourcing.
 */
export class McpClient {
  private servers = new Map<string, Client>();
  private tools = new Map<string, McpToolRegistration>();
  private aiSdkTools: Record<string, any> = {};

  /**
   * Load MCP server configurations from .w3x/mcp.json.
   */
  static async loadConfig(): Promise<McpServerConfig[]> {
    try {
      const { readFile } = await import("node:fs/promises");
      const { resolve } = await import("node:path");
      const { cwd } = await import("node:process");

      const configPath = resolve(cwd(), ".w3x", "mcp.json");
      const content = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(content);

      if (parsed.servers && Array.isArray(parsed.servers)) {
        return parsed.servers.filter((s: McpServerConfig) => s.enabled !== false);
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Connect to an MCP server and register its tools.
   */
  async connect(config: McpServerConfig): Promise<{ name: string; tools: number }> {
    const client = new Client(
      { name: "w3x", version: "2.0.0" },
      { capabilities: {} },
    );

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env as Record<string, string> | undefined,
    });

    await client.connect(transport);

    const { tools: mcpTools } = await client.listTools();

    this.servers.set(config.name, client);

    for (const mcpTool of mcpTools) {
      const aiTool = this.buildAiSdkTool(config.name, mcpTool);
      const toolKey = `${config.name}_${mcpTool.name}`;

      this.tools.set(toolKey, {
        serverName: config.name,
        toolName: mcpTool.name,
        description: mcpTool.description ?? "",
        inputSchema: mcpTool.inputSchema as Record<string, unknown>,
      });

      this.aiSdkTools[toolKey] = aiTool;
    }

    return { name: config.name, tools: mcpTools.length };
  }

  /**
   * Build an AI SDK-compatible tool wrapper for an MCP tool.
   */
  private buildAiSdkTool(
    serverName: string,
    mcpTool: McpTool,
  ): any {
    // Build a loose zod schema from JSON schema properties
    const shape: Record<string, z.ZodTypeAny> = {};

    if (mcpTool.inputSchema && (mcpTool.inputSchema as any).properties) {
      const props = (mcpTool.inputSchema as any).properties as Record<string, { type?: string; description?: string }>;
      const required = ((mcpTool.inputSchema as any).required as string[]) ?? [];

      for (const [key, prop] of Object.entries(props)) {
        const desc = prop.description ?? key;
        const isRequired = required.includes(key);

        if (isRequired) {
          shape[key] = z.any().describe(desc);
        } else {
          shape[key] = z.any().optional().describe(desc);
        }
      }
    }

    return tool({
      description: `[MCP:${serverName}] ${mcpTool.description ?? mcpTool.name}`,
      inputSchema: z.object(shape as any),
      execute: async (args: Record<string, unknown>) => {
        const client = this.servers.get(serverName);
        if (!client) {
          return { error: `MCP server "${serverName}" disconnected` };
        }

        try {
          const result = await client.callTool({
            name: mcpTool.name,
            arguments: args,
          });

          if ((result as any).isError) {
            const content = Array.isArray((result as any).content)
              ? (result as any).content.map((c: any) => c.text).join("\n")
              : "Unknown error";
            return { error: "MCP tool error", content };
          }

          const content = Array.isArray((result as any).content)
            ? (result as any).content.map((c: any) => c.text).join("\n")
            : String(result);

          return { success: true, content };
        } catch (err) {
          return { error: `MCP call failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });
  }

  /**
   * Get all AI SDK tools from connected MCP servers.
   */
  getTools(): Record<string, any> {
    return { ...this.aiSdkTools };
  }

  /**
   * Get all MCP tool registrations (metadata only).
   */
  getToolRegistrations(): McpToolRegistration[] {
    return Array.from(this.tools.values());
  }

  /**
   * Disconnect from all MCP servers.
   */
  async disconnectAll(): Promise<void> {
    for (const [, client] of this.servers) {
      try {
        await client.close();
      } catch {
        // ignore close errors
      }
    }
    this.servers.clear();
    this.tools.clear();
    this.aiSdkTools = {};
  }

  /**
   * Check if any MCP servers are connected.
   */
  isConnected(): boolean {
    return this.servers.size > 0;
  }
}

let _mcpClient: McpClient | null = null;

export function getMcpClient(): McpClient {
  if (!_mcpClient) {
    _mcpClient = new McpClient();
  }
  return _mcpClient;
}
