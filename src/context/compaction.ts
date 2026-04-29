// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMessage = { role: string; content: any };

interface CompactionConfig {
  tokenLimit: number;
  threshold: number;
}

const DEFAULT_CONFIG: CompactionConfig = {
  tokenLimit: 128000,
  threshold: 0.8,
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function messageTokens(msg: AnyMessage): number {
  try {
    return estimateTokens(JSON.stringify(msg.content));
  } catch {
    return 0;
  }
}

/**
 * Tier 1 — Sliding Window: Keep the last N messages in full.
 */
export function slidingWindowSlice(
  messages: AnyMessage[],
  keepCount: number,
): { recent: AnyMessage[]; older: AnyMessage[] } {
  if (messages.length <= keepCount) {
    return { recent: messages, older: [] };
  }
  return {
    recent: messages.slice(-keepCount),
    older: messages.slice(0, -keepCount),
  };
}

/**
 * Tier 2 — Structured Compaction: compact older message content.
 */
export function compactMessage(msg: AnyMessage): AnyMessage {
  if (typeof msg.content === "string") {
    return { ...msg, content: compactContent(msg.role, msg.content) };
  }

  if (Array.isArray(msg.content)) {
    return {
      ...msg,
      content: msg.content.map((part: { text?: string; type?: string }) => {
        if (part.text) {
          return { ...part, text: compactContent(msg.role, part.text) };
        }
        return part;
      }),
    };
  }

  return msg;
}

function compactContent(role: string, text: string): string {
  switch (role) {
    case "user":
      return `[User query: ${text.slice(0, 200)}]`;
    case "assistant":
      return text.length > 500
        ? `[Assistant: ${text.slice(0, 250)}... (compacted)]`
        : text;
    case "tool":
    case "system":
      return text.length > 400
        ? `${text.slice(0, 200)}... [${text.length - 200} chars truncated]`
        : text;
    default:
      return text.slice(0, 300) + (text.length > 300 ? "..." : "");
  }
}

/**
 * Tier 3 — Aggressive truncation: drop oldest messages.
 */
export function aggressiveTruncate(messages: AnyMessage[], tokenLimit: number): AnyMessage[] {
  const result: AnyMessage[] = [];
  let totalTokens = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = messageTokens(messages[i]);
    if (totalTokens + msgTokens <= tokenLimit) {
      result.unshift(messages[i]);
      totalTokens += msgTokens;
    }
  }

  return result;
}

/**
 * Full compaction pipeline.
 */
export function compactContext(
  messages: AnyMessage[],
  config: CompactionConfig = DEFAULT_CONFIG,
): { messages: AnyMessage[]; compacted: number; dropped: number } {
  const totalTokens = messages.reduce((sum, m) => sum + messageTokens(m), 0);
  const limit = config.tokenLimit;

  if (totalTokens / limit < config.threshold) {
    return { messages: [...messages], compacted: 0, dropped: 0 };
  }

  // Step 1: Sliding window — keep last 20 fresh
  const { recent, older } = slidingWindowSlice(messages, 20);
  let compacted = 0;

  // Step 2: Compact older
  const compactedOlder = older.map((m) => {
    compacted++;
    return compactMessage(m);
  });

  let result = [...compactedOlder, ...recent];

  // Step 3: Aggressive truncation if still over
  const resultTokens = result.reduce((sum, m) => sum + messageTokens(m), 0);
  if (resultTokens > limit * 0.95) {
    result = aggressiveTruncate(result, limit);
  }

  const dropped = messages.length - result.length;
  return { messages: result, compacted, dropped };
}
