import { execaCommand } from "execa";
import type { Settings } from "../config/schema";

// ─── Types ───────────────────────────────────────────────────────────────

export type HookEvent = "before-tool-call" | "after-tool-call" | "on-error" | "on-start" | "on-stop";

export interface HookDefinition {
  event: HookEvent;
  command: string;
  timeout?: number; // ms, default 10000
  abortOnFailure?: boolean; // default false
}

export interface HookContext {
  tool?: string;
  args?: string;
  result?: string;
  error?: string;
}

// ─── Engine ──────────────────────────────────────────────────────────────

let hooks: HookDefinition[] = [];

export function loadHooks(settings: Settings): void {
  hooks = settings.hooks ?? [];
}

export function getHooks(): HookDefinition[] {
  return [...hooks];
}

function substituteEnv(cmd: string, context: HookContext): string {
  return cmd
    .replace(/%TOOL%/g, context.tool ?? "")
    .replace(/%ARGS%/g, context.args ?? "")
    .replace(/%RESULT%/g, context.result ?? "")
    .replace(/%ERROR%/g, context.error ?? "");
}

export async function fireHooks(event: HookEvent, context: HookContext = {}): Promise<void> {
  const matching = hooks.filter((h) => h.event === event);

  for (const hook of matching) {
    const cmd = substituteEnv(hook.command, context);

    try {
      const result = await execaCommand(cmd, {
        shell: process.platform === "win32" ? "powershell" : true,
        timeout: hook.timeout || 10000,
        reject: false,
      });

      if (result.exitCode !== 0 && hook.abortOnFailure) {
        throw new Error(`Hook "${cmd}" exited with code ${result.exitCode}: ${result.stderr}`);
      }
    } catch (err) {
      if (hook.abortOnFailure) {
        throw err;
      }
      // Non-abort hooks: log and continue
      console.warn(`Hook "${event}" failed:`, err instanceof Error ? err.message : String(err));
    }
  }
}
