import type { AgentMode } from "../types";

// ─── Discriminated Union Agent Phase ────────────────────────────────────
export type AgentPhase =
  | { kind: "idle" }
  | { kind: "monitoring" }
  | { kind: "reasoning" }
  | { kind: "planning"; goal?: string }
  | { kind: "exploring" }
  | { kind: "executing"; currentStep: number; totalSteps: number }
  | { kind: "awaiting-approval"; toolName: string; args: Record<string, unknown> }
  | { kind: "error"; message: string; recoverable: boolean };

export interface PhaseTransition {
  from: AgentPhase["kind"][];
  to: AgentPhase["kind"];
}

// Allowed state transitions
const ALLOWED_TRANSITIONS: PhaseTransition[] = [
  { from: ["idle"], to: "monitoring" },
  { from: ["monitoring", "executing"], to: "reasoning" },
  { from: ["reasoning"], to: "executing" },
  { from: ["reasoning"], to: "awaiting-approval" },
  { from: ["awaiting-approval"], to: "reasoning" },
  { from: ["awaiting-approval"], to: "executing" },
  { from: ["monitoring", "reasoning"], to: "planning" },
  { from: ["planning"], to: "monitoring" },
  { from: ["planning"], to: "executing" },
  { from: ["reasoning", "executing", "planning", "awaiting-approval"], to: "error" },
  { from: ["error"], to: "monitoring" },
  { from: ["error", "monitoring"], to: "idle" },
];

export function canTransition(from: AgentPhase["kind"], to: AgentPhase["kind"]): boolean {
  return ALLOWED_TRANSITIONS.some((t) => t.from.includes(from) && t.to === to);
}

export function createPhase(
  kind: AgentPhase["kind"],
  extras?: Partial<Omit<AgentPhase, "kind">>,
): AgentPhase {
  const base = { kind } as AgentPhase;
  return Object.assign(base, extras ?? {});
}

// ─── Derived properties ────────────────────────────────────────────────

export function phaseIsModifying(phase: AgentPhase): boolean {
  return phase.kind === "executing";
}

export function phaseCanRead(phase: AgentPhase): boolean {
  return (
    phase.kind === "reasoning" ||
    phase.kind === "exploring" ||
    phase.kind === "planning" ||
    phase.kind === "monitoring"
  );
}

export function phaseCanWrite(phase: AgentPhase, mode: AgentMode): boolean {
  if (mode === "plan") return false;
  return phase.kind === "executing";
}
