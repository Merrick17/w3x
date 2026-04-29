import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";

// ─── Types ───────────────────────────────────────────────────────────────

export type PermissionAction = "allow" | "deny" | "ask";

export interface PermissionScope {
  directories?: string[];
  commands?: string[];
  patterns?: string[];
}

export interface PermissionRule {
  tool: string; // exact name or "*" wildcard
  scope?: PermissionScope;
  level: PermissionAction;
  priority: number; // higher = wins
}

export interface LearnedPermission {
  tool: string;
  argsPattern: string; // hash of arg keys
  approvals: number;
  level: PermissionAction;
}

// ─── Default rules ───────────────────────────────────────────────────────

const DEFAULT_RULES: PermissionRule[] = [
  // Read-only tools — always allow
  { tool: "read", level: "allow", priority: 100 },
  { tool: "readFile", level: "allow", priority: 100 },
  { tool: "listFiles", level: "allow", priority: 100 },
  { tool: "treeView", level: "allow", priority: 100 },
  { tool: "glob", level: "allow", priority: 100 },
  { tool: "grep", level: "allow", priority: 100 },
  { tool: "searchCodebase", level: "allow", priority: 100 },
  { tool: "gitStatus", level: "allow", priority: 100 },
  { tool: "gitDiff", level: "allow", priority: 100 },
  { tool: "gitLog", level: "allow", priority: 100 },
  { tool: "getWorkspace", level: "allow", priority: 100 },
  { tool: "recallMemory", level: "allow", priority: 100 },
  { tool: "webSearch", level: "allow", priority: 100 },
  { tool: "fetchUrl", level: "allow", priority: 100 },
  { tool: "webFetch", level: "allow", priority: 100 },
  { tool: "takeScreenshot", level: "allow", priority: 100 },
  { tool: "taskList", level: "allow", priority: 100 },
  { tool: "taskGet", level: "allow", priority: 100 },
  { tool: "cronList", level: "allow", priority: 100 },
  { tool: "delegateTask", level: "allow", priority: 100 },
  { tool: "agent", level: "allow", priority: 100 },
  { tool: "ask", level: "allow", priority: 100 },

  // Destructive writes — always ask
  { tool: "write", level: "ask", priority: 50 },
  { tool: "writeFile", level: "ask", priority: 50 },
  { tool: "edit", level: "ask", priority: 50 },
  { tool: "replaceFileContent", level: "ask", priority: 50 },
  { tool: "multiReplaceFileContent", level: "ask", priority: 50 },

  // Shell — ask (but scoped commands can override)
  { tool: "bash", level: "ask", priority: 50 },
  { tool: "runCommand", level: "ask", priority: 50 },

  // Git writes — ask
  { tool: "pinFile", level: "ask", priority: 50 },
  { tool: "unpinFile", level: "ask", priority: 50 },
  { tool: "taskCreate", level: "ask", priority: 50 },
  { tool: "taskUpdate", level: "ask", priority: 50 },
  { tool: "cronCreate", level: "ask", priority: 50 },
  { tool: "cronDelete", level: "ask", priority: 50 },

  // High-stakes — deny by default
  { tool: "sendTransaction", level: "ask", priority: 30 },
  { tool: "installPlugin", level: "ask", priority: 30 },
  { tool: "setWorkspace", level: "ask", priority: 30 },
];

// ─── Rule store ──────────────────────────────────────────────────────────

let rules: PermissionRule[] = [...DEFAULT_RULES];
let learnedPermissions: LearnedPermission[] = [];
let autoApproveThreshold = 2;
let learnFromDecisions = true;
let planMode = false;

// ─── Rule engine ─────────────────────────────────────────────────────────

export function setRules(r: PermissionRule[]): void {
  rules = [...DEFAULT_RULES, ...r];
  // Sort descending by priority so first match wins
  rules.sort((a, b) => b.priority - a.priority);
}

export function getRules(): PermissionRule[] {
  return [...rules];
}

export function setPlanMode(enabled: boolean): void {
  planMode = enabled;
}

export function setLearnConfig(opts: { enabled: boolean; threshold: number }): void {
  learnFromDecisions = opts.enabled;
  autoApproveThreshold = opts.threshold;
}

function matchRule(
  toolName: string,
  args: Record<string, unknown> | undefined,
): PermissionRule | undefined {
  for (const rule of rules) {
    // Tool name match: exact or wildcard
    if (rule.tool !== "*" && rule.tool !== toolName) continue;

    // Scope checks: when scope constraints are present, args MUST be provided and match
    if (rule.scope) {
      const { directories, commands, patterns } = rule.scope;

      // Directory scope: args must contain a path under allowed dirs
      if (directories) {
        if (!args) continue;
        const argPaths = findPathArgs(args);
        if (!argPaths.some((p) => directories.some((d) => p.startsWith(d)))) continue;
      }

      // Command scope: args must contain a matching command
      if (commands) {
        if (!args) continue;
        const cmd = findCommandArg(args);
        if (!cmd || !commands.some((c) => cmd === c || cmd.startsWith(c + " "))) continue;
      }

      // Pattern scope: args must match at least one pattern
      if (patterns) {
        if (!args) continue;
        const flat = JSON.stringify(args);
        if (!patterns.some((p) => new RegExp(p).test(flat))) continue;
      }
    }

    return rule;
  }

  return undefined;
}

function findPathArgs(args: Record<string, unknown>): string[] {
  const paths: string[] = [];
  for (const val of Object.values(args)) {
    if (typeof val === "string" && (val.includes("/") || val.includes("\\"))) {
      paths.push(val);
    }
  }
  return paths;
}

function findCommandArg(args: Record<string, unknown>): string | undefined {
  for (const [key, val] of Object.entries(args)) {
    if (key === "command" && typeof val === "string") return val;
  }
  return undefined;
}

// ─── Learning engine ─────────────────────────────────────────────────────

function argsFingerprint(args: Record<string, unknown>): string {
  // Fingerprint based on which keys are present, not values
  return Object.keys(args).sort().join(",");
}

function checkLearned(
  toolName: string,
  args: Record<string, unknown> | undefined,
): PermissionAction | undefined {
  if (!learnFromDecisions || !args) return undefined;
  const fp = argsFingerprint(args);
  const learned = learnedPermissions.find((l) => l.tool === toolName && l.argsPattern === fp);
  if (learned && learned.approvals >= autoApproveThreshold) {
    return learned.level;
  }
  return undefined;
}

export function recordDecision(
  toolName: string,
  args: Record<string, unknown>,
  decision: "approve" | "reject",
): void {
  if (!learnFromDecisions) return;
  const fp = argsFingerprint(args);
  const existing = learnedPermissions.find((l) => l.tool === toolName && l.argsPattern === fp);

  if (decision === "approve") {
    if (existing) {
      existing.approvals++;
    } else {
      learnedPermissions.push({
        tool: toolName,
        argsPattern: fp,
        approvals: 1,
        level: "allow",
      });
    }
  }
  // Rejection resets the learned count
  if (decision === "reject" && existing) {
    existing.approvals = 0;
  }
}

// ─── Main permission check ───────────────────────────────────────────────

export function getPermissionLevel(
  toolName: string,
  args?: Record<string, unknown>,
): PermissionAction {
  // Plan mode: all write-level tools require asking
  if (planMode) {
    const writeTools = [
      "write",
      "writeFile",
      "edit",
      "replaceFileContent",
      "multiReplaceFileContent",
      "bash",
      "runCommand",
      "sendTransaction",
    ];
    if (writeTools.includes(toolName)) return "ask";
  }

  // Check learned permissions first
  if (args) {
    const learned = checkLearned(toolName, args);
    if (learned) return learned;
  }

  // Consult rule engine
  const rule = matchRule(toolName, args);
  return rule?.level ?? "ask";
}

export function isAutoApproved(
  toolName: string,
  mode: "plan" | "build",
  args?: Record<string, unknown>,
): boolean {
  // plan mode: all tools that are "allow" in the rule engine are auto-approved
  // anything "ask" or "deny" stays manual
  const level = getPermissionLevel(toolName, args);
  if (level === "deny") return false;
  if (mode === "plan") return level === "allow";
  // build mode: "allow" and learned tools auto-pass
  return level === "allow";
}

// ─── Shell safety ────────────────────────────────────────────────────────

export function isReadOnlyCommand(command: string): boolean {
  const c = command.trim();
  if (/[;&|<>]/.test(c)) return false;
  const lowerC = c.toLowerCase();
  const cmds = [
    "ls",
    "cat",
    "head",
    "tail",
    "grep",
    "find",
    "git log",
    "git diff",
    "git status",
    "git branch",
    "git remote",
    "git show",
    "which",
    "pwd",
    "echo",
    "type",
    "npm list",
    "node -v",
    "npm -v",
    "env",
    "printenv",
    "whoami",
    "uname",
    "df",
    "du",
    "wc",
    "sort",
    "uniq",
    "tee",
    "curl -s",
    "dig",
    "nslookup",
    "npx tsc --noEmit",
    "npm run",
    "npx vitest",
    "npx jest",
    "cargo check",
    "cargo test",
    "cargo build",
    "go test",
    "go build",
    "python -c",
    "python3 -c",
    "pip list",
  ];
  return cmds.some((r) => lowerC === r || lowerC.startsWith(r + " "));
}

// ─── Persistence ─────────────────────────────────────────────────────────

const LEARNED_PATH = join(cwd(), ".w3x", "permissions-learned.json");

export async function saveLearnedPermissions(): Promise<void> {
  try {
    await mkdir(join(cwd(), ".w3x"), { recursive: true });
    await writeFile(LEARNED_PATH, JSON.stringify(learnedPermissions, null, 2), "utf-8");
  } catch {
    // non-critical
  }
}

export async function loadLearnedPermissions(): Promise<void> {
  try {
    const data = await readFile(LEARNED_PATH, "utf-8");
    learnedPermissions = JSON.parse(data);
  } catch {
    // fresh start, no saved permissions
  }
}

// ─── Re-exports for backward compat ──────────────────────────────────────

export type PermissionLevel = "readonly" | "approve" | "auto"; // legacy

export interface ToolPermission {
  name: string;
  level: PermissionLevel;
  description: string;
}

// Legacy map for compatibility with existing code
export const TOOL_PERMISSIONS: Record<string, ToolPermission> = {};
