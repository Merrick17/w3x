import { streamText, stepCountIs } from "ai";
import type { LanguageModel, ToolSet } from "ai";
import { ToolRegistry } from "./tool-registry";
import { getPermissionLevel } from "../permission/index";

export interface SubAgentOptions {
  name: string;
  description: string;
  maxSteps?: number;
}

export interface SubAgentResult {
  success: boolean;
  text: string;
  stepCount: number;
  toolCalls: number;
  agentName: string;
  error?: string;
}

/**
 * Sub-agent system for task delegation.
 * Follows the OpenCode pattern where the main agent can spawn specialized
 * sub-agents (like @general) for complex searches, code exploration, or
 * multistep tasks.
 *
 * Sub-agents are read-only by default — they can explore and analyze
 * but cannot modify files or run destructive commands.
 */
export class SubAgent {
  constructor(
    private model: LanguageModel,
    private options: SubAgentOptions,
  ) {}

  /**
   * Execute a task with this sub-agent and return the result.
   * Sub-agents run in read-only mode by default.
   */
  async execute(task: string): Promise<SubAgentResult> {
    const systemPrompt = [
      `You are a sub-agent named "${this.options.name}".`,
      `Purpose: ${this.options.description}`,
      "",
      "You are running in READ-ONLY mode. You CANNOT:",
      "- Write or edit files",
      "- Run destructive shell commands",
      "- Modify the project in any way",
      "",
      "You CAN:",
      "- Read and analyze files",
      "- Search the codebase",
      "- Report findings and analysis",
      "- Run read-only shell commands (ls, cat, git log, git diff, etc.)",
      "",
      "Be thorough but concise. Complete the task fully before responding.",
      "Return your findings as a clear, structured report.",
    ].join("\n");

    try {
      const readonlyTools = this.filterReadonlyTools();
      let toolCallCount = 0;
      let fullText = "";

      const result = streamText({
        model: this.model,
        system: systemPrompt,
        prompt: task,
        tools: readonlyTools,
        stopWhen: stepCountIs(this.options.maxSteps ?? 15),
        onStepFinish: (step) => {
          if (step.toolCalls) toolCallCount += step.toolCalls.length;
        },
      });

      for await (const chunk of result.textStream) {
        fullText += chunk;
      }
      await result.response;

      return {
        success: true,
        text: fullText,
        stepCount: toolCallCount,
        toolCalls: toolCallCount,
        agentName: this.options.name,
      };
    } catch (err) {
      return {
        success: false,
        text: "",
        stepCount: 0,
        toolCalls: 0,
        agentName: this.options.name,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Filter the tool registry to only include read-only tools.
   * Sub-agents are constrained to safe operations.
   */
  private filterReadonlyTools(): ToolSet {
    const allTools = ToolRegistry.getTools();
    const filtered: ToolSet = {};

    for (const [name, t] of Object.entries(allTools)) {
      const level = getPermissionLevel(name);
      if (level === "allow") {
        filtered[name] = t as ToolSet[string];
      }
    }

    return filtered;
  }
}

/**
 * Pre-defined sub-agent types matching OpenCode's agent hierarchy.
 */
export const SUB_AGENT_TYPES = {
  general: {
    name: "general",
    description: "General-purpose sub-agent for complex searches, codebase exploration, and multistep research tasks. Used for understanding codebases, finding relevant files, and gathering context.",
    maxSteps: 20,
  },
  explorer: {
    name: "explorer",
    description: "Specialized sub-agent for codebase exploration and file discovery. Excels at finding relevant code, understanding project structure, and tracing dependencies.",
    maxSteps: 15,
  },
  reviewer: {
    name: "reviewer",
    description: "Specialized sub-agent for code review. Analyzes diffs, checks for issues, and provides structured feedback on code changes.",
    maxSteps: 10,
  },
} as const;
