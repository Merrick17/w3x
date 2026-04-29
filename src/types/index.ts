// ─── Agent State & Mode ───────────────────────────────────────────────────────
export type AgentState =
  | 'idle'
  | 'monitoring'
  | 'reasoning'
  | 'executing'
  | 'planning'
  | 'awaiting-approval'
  | 'done'
  | 'error';

export type AgentMode = 'plan' | 'build';

// ─── Task Types (for model routing) ──────────────────────────────────────────
export type TaskType = 'planning' | 'coding' | 'fast' | 'search' | 'general';

// ─── CLI Events ───────────────────────────────────────────────────────────────
export type CLIEvent =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolName: string; toolCallId: string; args: Record<string, unknown> }
  | { type: 'tool-result'; toolName: string; toolCallId: string; output: string }
  | { type: 'step-start'; toolName: string; args: Record<string, unknown> }
  | { type: 'step-end'; toolName: string; success: boolean; output?: string; error?: string }
  | { type: 'state-change'; state: AgentState }
  | { type: 'mode-change'; mode: AgentMode }
  | { type: 'error'; message: string }
  | { type: 'awaiting-approval'; description: string }
  | { type: 'approval-result'; decision: 'approve' | 'reject' }
  | { type: 'done'; summary: string }
  | { type: 'thinking'; content: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number; totalTokens: number }
  | { type: 'log'; level: string; message: string }
  | { type: 'plan-ready'; plan: Plan }
  | { type: 'plan-step-start'; step: PlanStep }
  | { type: 'plan-step-done'; stepId: string; success: boolean };

// ─── Plan / Planner ───────────────────────────────────────────────────────────
export interface PlanStep {
  id: string;
  description: string;
  toolHints: string[];
  dependsOn?: string[];
  status?: 'pending' | 'running' | 'done' | 'error';
}

export interface Plan {
  id?: string;
  goal: string;
  steps: PlanStep[];
  estimatedSteps: number;
  createdAt: number;
}

// ─── Command System ───────────────────────────────────────────────────────────
export interface CommandDef {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  taskType: TaskType;
  systemPromptSuffix: string;
}

// ─── Memory ───────────────────────────────────────────────────────────────────
export interface MemoryEntry {
  key: string;
  value: string;
  savedAt: string;
  source: 'fact' | 'session-summary';
}

export interface MemoryIndex {
  facts: string[];      // keys of fact files
  sessions: string[];   // filenames of session summaries
  lastUpdated: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  toolCalls: ToolCallInfo[];
  timestamp: number;
  duration?: number;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  output?: string;
  error?: string;
  duration?: number;
}

export interface AgentConfig {
  model: string;
  baseURL: string;
  mode: AgentMode;
  maxSteps?: number;
}

export interface SessionMeta {
  id: string;
  createdAt: number;
  messages: number;
  model: string;
}
