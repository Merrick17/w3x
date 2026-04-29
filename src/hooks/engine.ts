import { execaCommand } from "execa";
import type { Settings } from "../config/schema";

// ─── Types ───────────────────────────────────────────────────────────────

export type HookEvent =
  | "before-tool-call"
  | "after-tool-call"
  | "on-error"
  | "on-start"
  | "on-stop";

export interface HookDefinition {
  event: HookEvent;
  command: string;
  timeout?: number; // ms, default 10000
  blocking?: boolean; // default true
  timeoutBudgetMs?: number; // optional stricter cap per invocation
  abortOnFailure?: boolean; // default false
}

export interface HookContext {
  tool?: string;
  args?: string;
  result?: string;
  error?: string;
  signal?: AbortSignal;
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

export async function fireHooks(
  event: HookEvent,
  context: HookContext = {},
  options: { blocking?: boolean } = {},
): Promise<void> {
  const matching = hooks.filter((h) => h.event === event);
  const runHook = async (hook: HookDefinition) => {
    const cmd = substituteEnv(hook.command, context);

    try {
      const effectiveTimeout = Math.min(
        hook.timeout || 10000,
        hook.timeoutBudgetMs || Number.POSITIVE_INFINITY,
      );
      const child = execaCommand(cmd, {
        shell: process.platform === "win32" ? "powershell" : true,
        timeout: Number.isFinite(effectiveTimeout) ? effectiveTimeout : hook.timeout || 10000,
        reject: false,
      });
      const abortListener = () => {
        child.kill("SIGTERM", { forceKillAfterTimeout: 1000 });
      };
      context.signal?.addEventListener("abort", abortListener);
      const result = await child;
      context.signal?.removeEventListener("abort", abortListener);

      if (result.exitCode !== 0 && hook.abortOnFailure) {
        throw new Error(`Hook "${cmd}" exited with code ${result.exitCode}: ${result.stderr}`);
      }
    } catch (err) {
      if (hook.abortOnFailure) {
        throw err;
      }
      console.warn(`Hook "${event}" failed:`, err instanceof Error ? err.message : String(err));
    }
  };

  const nonBlocking = matching.filter((h) => options.blocking === false || h.blocking === false);
  const blockingHooks = matching.filter((h) => !nonBlocking.includes(h));

  if (nonBlocking.length > 0) {
    void Promise.allSettled(nonBlocking.map((h) => runHook(h)));
  }

  if (blockingHooks.length === 0) {
    return;
  }

  for (const hook of blockingHooks) {
    await runHook(hook);
  }
}
