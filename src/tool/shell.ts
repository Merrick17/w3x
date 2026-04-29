import { tool } from "ai";
import { z } from "zod";
import { execaCommand } from "execa";
import { cwd } from "node:process";

const DANGEROUS = ["rm -rf /", "format", "mkfs", ":(){ :|:& };:", "shutdown", "reboot"];
const WS = cwd();
let ACTIVE_ABORT_SIGNAL: AbortSignal | undefined;

export function setShellAbortSignal(signal?: AbortSignal): void {
  ACTIVE_ABORT_SIGNAL = signal;
}

async function executeShellCommand(command: string, timeout?: number, run_in_background?: boolean) {
  for (const d of DANGEROUS) {
    if (command.toLowerCase().includes(d))
      throw new Error(`Safety violation: dangerous pattern "${d}"`);
  }
  const isWindows = process.platform === "win32";

  if (run_in_background) {
    const child = execaCommand(command, {
      cwd: WS,
      shell: isWindows ? "powershell" : true,
      timeout: timeout || 300000,
      reject: false,
      detached: process.platform !== "win32",
    });
    const abortListener = () => child.kill("SIGTERM", { forceKillAfterTimeout: 1000 });
    ACTIVE_ABORT_SIGNAL?.addEventListener("abort", abortListener, { once: true });
    // Don't await — fire and forget. Return immediately with PID.
    return {
      success: true,
      background: true,
      pid: child.pid,
      message: `Command started in background (PID: ${child.pid})`,
    };
  }

  const child = execaCommand(command, {
    cwd: WS,
    shell: isWindows ? "powershell" : true,
    timeout: timeout || 30000,
    reject: false,
  });
  const abortListener = () => child.kill("SIGTERM", { forceKillAfterTimeout: 1000 });
  ACTIVE_ABORT_SIGNAL?.addEventListener("abort", abortListener);
  const r = await child;
  ACTIVE_ABORT_SIGNAL?.removeEventListener("abort", abortListener);

  return {
    success: r.exitCode === 0,
    stdout: (r.stdout ?? "").slice(0, 10000),
    stderr: (r.stderr ?? "").slice(0, 5000),
    exitCode: r.exitCode ?? 1,
    background: false,
  };
}

export const shellTools = {
  runCommand: tool({
    description:
      "Execute a shell command. Returns stdout, stderr, and exit code. Use run_in_background for long-running commands.",
    inputSchema: z.object({
      command: z.string().describe("Shell command to execute"),
      timeout: z.number().optional().describe("Timeout in ms (default: 30000 foreground, 300000 background)"),
      description: z.string().optional().describe("Clear, concise description of what this command does"),
      run_in_background: z.boolean().optional().describe("Run command in background without waiting for completion"),
    }),
    execute: async ({
      command,
      timeout,
      run_in_background,
    }: {
      command: string;
      timeout?: number;
      description?: string;
      run_in_background?: boolean;
    }) => executeShellCommand(command, timeout, run_in_background),
  }),

  bash: tool({
    description:
      "Execute a shell command. Returns stdout, stderr, and exit code. Use run_in_background for long-running commands.",
    inputSchema: z.object({
      command: z.string().describe("Shell command to execute"),
      timeout: z.number().optional().describe("Timeout in ms (default: 30000 foreground, 300000 background)"),
      description: z.string().optional().describe("Clear, concise description of what this command does"),
      run_in_background: z.boolean().optional().describe("Run command in background without waiting for completion"),
    }),
    execute: async ({
      command,
      timeout,
      run_in_background,
    }: {
      command: string;
      timeout?: number;
      description?: string;
      run_in_background?: boolean;
    }) => executeShellCommand(command, timeout, run_in_background),
  }),
};
