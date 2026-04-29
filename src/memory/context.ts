import { listFacts, loadRecentSessions } from "./store";
import { loadAllMemoryMd, formatMemoryBlock } from "./memory-md";

const MAX_CONTEXT_CHARS = 3000;

/**
 * Build a memory context block to inject into the system prompt.
 * Pulls MEMORY.md entries, last 3 session summaries, and persistent facts.
 * Caps output at MAX_CONTEXT_CHARS to avoid token bloat.
 */
export async function buildMemoryContext(): Promise<string> {
  const [memoryEntries, sessions, facts] = await Promise.all([
    loadAllMemoryMd(),
    loadRecentSessions(3),
    listFacts(),
  ]);

  const parts: string[] = [];

  // MEMORY.md entries (structured, typed memories)
  if (memoryEntries.length > 0) {
    const mdBlock = formatMemoryBlock(memoryEntries);
    if (mdBlock) parts.push(mdBlock);
  }

  if (sessions.length > 0) {
    parts.push("## RECENT SESSION CONTEXT");
    for (const s of sessions) {
      const date = new Date(s.savedAt).toLocaleDateString();
      parts.push(`[${date}] ${s.summary}`);
    }
  }

  if (facts.length > 0) {
    parts.push("## PERSISTENT FACTS");
    for (const f of facts) {
      parts.push(`${f.key}: ${f.value}`);
    }
  }

  if (parts.length === 0) return "";

  const block = parts.join("\n");
  const capped =
    block.length > MAX_CONTEXT_CHARS
      ? block.slice(0, MAX_CONTEXT_CHARS) + "\n[...memory truncated]"
      : block;

  return `\n\n---\n# MEMORY\n${capped}\n---`;
}

/**
 * Generate a 3-sentence session summary from the last N messages.
 * Used by AgentLoop.stop() to auto-persist the session.
 */
export function extractSummaryPrompt(messages: Array<{ role: string; content: unknown }>): string {
  const relevant = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-20)
    .map((m) => {
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `[${m.role}]: ${text.slice(0, 300)}`;
    })
    .join("\n");

  return `Summarise this coding session in 3 sentences. Be specific about: what was built, what files were changed, and any key decisions made.\n\n${relevant}`;
}
