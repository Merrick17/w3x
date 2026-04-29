import { z } from "zod";

// ─── Keybindings ────────────────────────────────────────────────────────
export const KeybindingSchema = z.object({
  key: z.string(),
  ctrl: z.boolean().optional(),
  meta: z.boolean().optional(),
  shift: z.boolean().optional(),
});

export const KeybindingsConfigSchema = z.object({
  submit: KeybindingSchema.optional(),
  exit: KeybindingSchema.optional(),
  commandPalette: KeybindingSchema.optional(),
  toggleLogs: KeybindingSchema.optional(),
  help: KeybindingSchema.optional(),
  modelSelector: KeybindingSchema.optional(),
  approve: KeybindingSchema.optional(),
  deny: KeybindingSchema.optional(),
  scrollUp: KeybindingSchema.optional(),
  scrollDown: KeybindingSchema.optional(),
});

// ─── Permissions ───────────────────────────────────────────────────────
export const PermissionRuleSchema = z.object({
  tool: z.string(),
  scope: z
    .object({
      directories: z.array(z.string()).optional(),
      commands: z.array(z.string()).optional(),
      patterns: z.array(z.string()).optional(),
    })
    .optional(),
  level: z.enum(["allow", "deny", "ask"]),
  priority: z.number().default(0),
});

export const PermissionsConfigSchema = z.object({
  rules: z.array(PermissionRuleSchema).default([]),
  defaultLevel: z.enum(["ask", "deny"]).default("ask"),
  learnFromDecisions: z.boolean().default(true),
  autoApproveThreshold: z.number().min(1).max(10).default(2),
});

// ─── Model Router ──────────────────────────────────────────────────────
export const ModelRouterConfigSchema = z.object({
  planning: z.string().optional(),
  coding: z.string().optional(),
  fast: z.string().optional(),
  search: z.string().optional(),
  general: z.string().optional(),
});

// ─── Context ───────────────────────────────────────────────────────────
export const ContextConfigSchema = z.object({
  tokenLimit: z.number().default(128000),
  compactionThreshold: z.number().min(0).max(1).default(0.8),
  maxMessages: z.number().default(50),
});

// ─── Agents ────────────────────────────────────────────────────────────
export const SubAgentConfigSchema = z.object({
  role: z.enum(["general", "explorer", "reviewer", "coder", "planner", "security"]),
  maxSteps: z.number().optional(),
  model: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
});

// ─── Thinking ──────────────────────────────────────────────────────────
export const ThinkingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  budgetTokens: z.number().default(4000),
});

// ─── Hooks ─────────────────────────────────────────────────────────────
export const HookDefinitionSchema = z.object({
  event: z.enum(["before-tool-call", "after-tool-call", "on-error", "on-start", "on-stop"]),
  match: z
    .object({
      tool: z.string().optional(),
      pattern: z.string().optional(),
    })
    .optional(),
  command: z.string(),
  timeout: z.number().default(10000),
});

// ─── Status Line ────────────────────────────────────────────────────────
export const StatusLineConfigSchema = z.object({
  enabled: z.boolean().default(true),
  modules: z
    .array(z.enum(["model", "duration", "tokens", "git", "tasks"]))
    .default(["model", "duration", "tokens"]),
});

// ─── UI ────────────────────────────────────────────────────────────────
export const UIConfigSchema = z.object({
  theme: z.enum(["one-dark", "default"]).default("one-dark"),
  showLogs: z.boolean().default(true),
  sidebarWidth: z.number().default(40),
  statusLine: StatusLineConfigSchema.default({
    enabled: true,
    modules: ["model", "duration", "tokens"],
  }),
});

// ─── MCP Servers ────────────────────────────────────────────────────────
export const McpServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
});

// ─── Root Schema ────────────────────────────────────────────────────────
export const SettingsSchema = z.object({
  model: z.string().optional(),
  baseURL: z.string().optional(),
  mode: z.enum(["plan", "build"]).default("build"),
  maxSteps: z.number().min(1).max(100).default(25),

  modelRouter: ModelRouterConfigSchema.default({}),
  permissions: PermissionsConfigSchema.default({
    rules: [],
    defaultLevel: "ask" as const,
    learnFromDecisions: true,
    autoApproveThreshold: 2,
  }),
  context: ContextConfigSchema.default({
    tokenLimit: 128000,
    compactionThreshold: 0.8,
    maxMessages: 50,
  }),
  thinking: ThinkingConfigSchema.default({
    enabled: false,
    budgetTokens: 4000,
  }),
  agents: z.record(z.string(), SubAgentConfigSchema).default({}),
  hooks: z.array(HookDefinitionSchema).default([]),
  mcpServers: z.array(McpServerConfigSchema).default([]),
  ui: UIConfigSchema.default({
    theme: "one-dark" as const,
    showLogs: true,
    sidebarWidth: 40,
    statusLine: {
      enabled: true,
      modules: ["model", "duration", "tokens"],
    },
  }),
  keybindings: KeybindingsConfigSchema.default({}),
  env: z.record(z.string(), z.string()).default({}),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;
export type HookDefinition = z.infer<typeof HookDefinitionSchema>;
export type SubAgentConfig = z.infer<typeof SubAgentConfigSchema>;
