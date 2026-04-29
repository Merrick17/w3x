/**
 * Context window management utilities.
 * Prevents tool output from overflowing the LLM's context window.
 */

const MAX_FILE_CONTENT = 8000;
const MAX_COMMAND_OUTPUT = 4000;
const MAX_SEARCH_RESULTS = 3000;
const MAX_DEFAULT = 6000;

/**
 * Rough token estimation: ~4 chars per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate a string with a message showing what was cut.
 */
function truncateWithTail(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  const headLen = Math.floor(maxLen * 0.7);
  const tailLen = Math.floor(maxLen * 0.2);
  const head = text.slice(0, headLen);
  const tail = text.slice(-tailLen);
  const omitted = text.length - headLen - tailLen;

  return `${head}\n\n... [${omitted.toLocaleString()} characters truncated] ...\n\n${tail}`;
}

/**
 * Intelligently truncate a tool output based on its typical size.
 * Preserves the beginning and end of the content so the LLM can still reason.
 */
export function truncateToolOutput(output: unknown, toolName: string): unknown {
  // Only truncate string outputs — objects/arrays pass through
  if (typeof output !== "string") return output;

  const maxLen = toolMaxLength(toolName);
  if (output.length <= maxLen) return output;

  return truncateWithTail(output, maxLen);
}

function toolMaxLength(toolName: string): number {
  switch (toolName) {
    case "readFile":
    case "read":
      return MAX_FILE_CONTENT;
    case "runCommand":
    case "packageManagerExecute":
    case "lintAndFix":
      return MAX_COMMAND_OUTPUT;
    case "webSearch":
    case "searchCodebase":
    case "gitLog":
    case "gitDiff":
    case "gitStatus":
      return MAX_SEARCH_RESULTS;
    default:
      return MAX_DEFAULT;
  }
}

/**
 * Estimate total context token usage from the current message array.
 */
export function estimateContextTokens(messages: Array<{ role: string; content: unknown }>): number {
  let total = 0;
  for (const msg of messages) {
    const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    total += estimateTokens(text);
  }
  return total;
}

/**
 * Check if context is approaching the model's limit and warn.
 */
export function contextWarning(
  messages: Array<{ role: string; content: unknown }>,
  limitTokens = 128000,
): string | null {
  const used = estimateContextTokens(messages);
  const ratio = used / limitTokens;

  if (ratio > 0.8) {
    return `⚠ Context at ${(ratio * 100).toFixed(0)}% of limit (${used.toLocaleString()}/${limitTokens.toLocaleString()} tokens). Consider starting a new session.`;
  }
  if (ratio > 0.5) {
    return `Context at ${(ratio * 100).toFixed(0)}% (${used.toLocaleString()} tokens).`;
  }
  return null;
}
