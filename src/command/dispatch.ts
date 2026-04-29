import type { BuildAgent } from "../agent/build";
import { findCommand } from "./registry";

export interface DispatchResult {
  handled: boolean;
  commandName?: string;
  taskType?: string;
  promptSent?: string;
  error?: string;
}

/**
 * Try to dispatch a slash command.
 * Returns { handled: true } if the input was a registered command.
 * The agent processes the result as a normal streaming exchange.
 */
export async function dispatchCommand(
  input: string,
  agent: BuildAgent,
  onEvent?: (ev: { type: string; [k: string]: unknown }) => void,
): Promise<DispatchResult> {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return { handled: false };

  const [token, ...rest] = trimmed.split(/\s+/);
  const arg = rest.join(" ");
  const cmd = findCommand(token);

  if (!cmd) return { handled: false };

  // Build the prompt that will be submitted to the agent
  const userPrompt = arg ? `${cmd.description}: ${arg}` : cmd.description;

  // Attach the command's system-prompt suffix to the loop for this call
  agent.setCommandContext(cmd.systemPromptSuffix, cmd.taskType);

  onEvent?.({ type: "log", level: "info", message: `⚡ ${cmd.name} → task:${cmd.taskType}` });

  // Process as a normal user input (streaming)
  for await (const event of agent.processUserInput(userPrompt)) {
    onEvent?.(event as { type: string; [k: string]: unknown });
  }

  // Clear command context after completion
  agent.clearCommandContext();

  return {
    handled: true,
    commandName: cmd.name,
    taskType: cmd.taskType,
    promptSent: userPrompt,
  };
}
