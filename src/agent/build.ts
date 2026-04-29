import { EventEmitter } from "node:events";
import { streamText, generateText, stepCountIs, type ModelMessage } from "ai";
import { LlmProvider } from "../provider/index";
import { ModelRouter } from "../provider/router";
import { Planner } from "./planner";
import { Executor } from "./executor";
import { ToolRegistry } from "./tool-registry";
import { buildMemoryContext, extractSummaryPrompt } from "../memory/context";
import { saveSessionSummary } from "../memory/store";
import { contextWarning } from "../context/index";
import { compactContext } from "../context/compaction";
import { loadInstructions, formatInstructionsBlock, type LoadedInstructions } from "../skill/index";
import { getFileWatcher } from "../watch/index";
import { getMcpClient } from "../mcp/index";
import {
  isAutoApproved,
  setPlanMode,
  recordDecision,
  loadLearnedPermissions,
  saveLearnedPermissions,
} from "../permission/index";
import { fireHooks } from "../hooks/engine";
import { logger } from "../lib/logger";
import { setDelegationModel } from "../tool/delegate";
import { createPhase, canTransition, type AgentPhase } from "./state-machine";
import type { AgentState, AgentMode, CLIEvent, TaskType } from "../types";
import { mkdir, readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises";
import { PINNED_FILES } from "../tool/index";
import { perfMark, perfMeasure, perfCount, perfSnapshot } from "../lib/perf";
import { setShellAbortSignal } from "../tool/shell";

type StreamToolEvent = { input?: unknown; args?: unknown };
type StreamErrorEvent = { error?: unknown };

// ─── State → Phase mapping ─────────────────────────────────────────────
function stateToPhase(s: AgentState): AgentPhase {
  switch (s) {
    case "idle":
      return createPhase("idle");
    case "monitoring":
      return createPhase("monitoring");
    case "reasoning":
      return createPhase("reasoning");
    case "executing":
      return createPhase("executing", { currentStep: 0, totalSteps: 0 });
    case "planning":
      return createPhase("planning");
    case "awaiting-approval":
      return createPhase("awaiting-approval", { toolName: "", args: {} });
    case "error":
      return createPhase("error", { message: "", recoverable: true });
    case "done":
      return createPhase("idle");
  }
}

// ─── System Prompt Template ──────────────────────────────────────────────────
const SYSTEM_PROMPT_TEMPLATE = `You are w3x PRIME, an autonomous coding agent. You operate in a terminal environment with direct access to the file system, shell, and tools.

## CAPABILITIES
- **File Tools**: Read, write, and surgically edit files (read, write, edit, listFiles, treeView).
- **Codebase Exploration**: Pattern search and regex grep (glob, grep, searchCodebase).
- **Shell Execution**: Run commands for builds, tests, linting, and package management (bash, runCommand).
- **Git**: Full version control lifecycle (gitStatus, gitDiff, gitLog, commit via /commit).
- **Web & Research**: Web search and URL fetching (webSearch, webFetch, fetchUrl).
- **Memory**: Persistent key-value storage across sessions (saveMemory, recallMemory).
- **Vision**: Screenshot capture for UI verification (takeScreenshot).
- **Task Tracking**: Structured task management with dependencies (taskCreate, taskUpdate, taskList, taskGet).
- **Sub-Agents**: Delegate complex multi-step tasks to specialized sub-agents (agent, delegateTask).
- **Scheduling**: Cron-based task scheduling (cronCreate, cronDelete, cronList).
- **User Interaction**: Ask clarifying questions (ask).
- **Web3**: Blockchain integration for EVM and Solana (readChain, sendTransaction, getSolanaBalance).

## OPERATING PRINCIPLES
1. **Be Proactive**: Read related files before editing. Anticipate side effects.
2. **Self-Correct**: If a command fails, analyze output and try a different approach.
3. **Think First**: Reason through solutions before executing. Use /plan for complex tasks.
4. **Zero Placeholders**: Write complete, production-ready code. No TODOs or stubs.
5. **Verify**: After changes, read files back or run tests to confirm correctness.
6. **Use Parallel Tools**: When independent, batch tool calls together for efficiency.

## SAFETY RULES
- Destructive operations in plan mode require user approval.
- Never write outside the project directory.
- Dangerous shell commands (rm -rf /, format, shutdown) are blocked.
- Never expose secrets or credentials in output.`;

// ─── Agent-specific system prompt suffixes ──────────────────────────────────
const BUILD_AGENT_SUFFIX = `
## BUILD MODE
You are in BUILD mode with full write access. You can:
- Create, edit, and delete files
- Run any safe shell command
- Commit changes to git
- Execute blockchain transactions (with approval)
Work autonomously and efficiently. Default to action over asking.`;

const PLAN_AGENT_SUFFIX = `
## PLAN MODE
You are in PLAN mode — read-only analysis. You can:
- Read files and explore the codebase
- Search and analyze code
- Run read-only shell commands (ls, cat, git log, etc.)
- Propose plans and architectures
You CANNOT write files or run destructive commands without explicit approval.
Focus on understanding, analysis, and clear communication.`;

export interface AgentLoopOpts {
  model?: string;
  mode?: AgentMode;
  maxSteps?: number;
}

export class BuildAgent extends EventEmitter {
  private state: AgentState = "idle";
  private phase: AgentPhase = { kind: "idle" };
  private mode: AgentMode;
  private llm: LlmProvider;
  private router: ModelRouter;
  private running = false;
  private processing = false;
  private messages: ModelMessage[] = [];
  private approvalResolve: ((v: "approve" | "reject") => void) | null = null;
  private stepCount = 0;
  private maxSteps: number;
  private startTime = 0;
  private totalTokens = { prompt: 0, completion: 0, total: 0 };
  private instructions: LoadedInstructions = { agentsMd: "", skills: [], totalChars: 0 };

  // Per-call command context (set by command handlers)
  private commandSuffix = "";
  private commandTaskType: TaskType = "general";
  private runAbortController: AbortController | null = null;

  constructor(llm: LlmProvider, opts: AgentLoopOpts = {}) {
    super();
    this.llm = llm;
    this.mode = opts.mode || "build";
    this.maxSteps = opts.maxSteps || 25;
    this.router = new ModelRouter(llm);
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────
  getState(): AgentState {
    return this.state;
  }
  getMode(): AgentMode {
    return this.mode;
  }
  getModel(): string {
    return this.llm.getModelName();
  }
  isProcessing(): boolean {
    return this.processing;
  }
  getStepCount(): number {
    return this.stepCount;
  }
  getTokenUsage() {
    return { ...this.totalTokens };
  }
  setMode(m: AgentMode): void {
    this.mode = m;
    setPlanMode(m === "plan");
    this.emit("event", { type: "mode-change" as const, mode: m });
  }
  setModel(m: string): void {
    this.llm.setModel(m);
  }
  getAvailableModels(): { id: string; provider: string }[] {
    return this.llm.listAvailableModels();
  }
  onApprovalDecision(d: "approve" | "reject"): void {
    this.approvalResolve?.(d);
    this.approvalResolve = null;
  }
  cancelCurrentRun(): void {
    this.runAbortController?.abort();
    this.approvalResolve?.("reject");
    this.approvalResolve = null;
  }

  // ─── Pinning ───────────────────────────────────────────────────────────────
  pinFile(path: string): void {
    PINNED_FILES.add(path);
    this.emit("event", { type: "log", level: "info", message: `Pinned: ${path}` });
  }
  unpinFile(path: string): void {
    PINNED_FILES.delete(path);
    this.emit("event", { type: "log", level: "info", message: `Unpinned: ${path}` });
  }
  getPinnedFiles(): string[] {
    return Array.from(PINNED_FILES);
  }

  private async buildPinnedContext(): Promise<string> {
    if (PINNED_FILES.size === 0) return "";
    const parts: string[] = ["## PINNED FILES (CURRENT CONTEXT)"];
    for (const path of PINNED_FILES) {
      try {
        const content = await fsReadFile(path, "utf-8");
        parts.push(`\n### ${path}\n\`\`\`\n${content}\n\`\`\``);
      } catch (e) {
        logger.warn("agent", `Failed to read pinned file ${path}: ${logger.fromError("pin", e)}`);
        parts.push(`\n### ${path}\n[Error: Could not read file]`);
      }
    }
    return "\n\n---\n" + parts.join("\n") + "\n---";
  }

  /** Called by command handlers before processUserInput */
  setCommandContext(suffix: string, taskType: TaskType): void {
    this.commandSuffix = suffix;
    this.commandTaskType = taskType;
  }

  /** Called by command handlers after processUserInput completes */
  clearCommandContext(): void {
    this.commandSuffix = "";
    this.commandTaskType = "general";
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  async start(): Promise<void> {
    if (this.running) return;
    perfMark("agent.start.begin");
    this.running = true;
    this.setState("monitoring");
    const [instructions] = await Promise.all([
      loadInstructions(),
      this.loadState(),
      loadLearnedPermissions(),
      ToolRegistry.loadPlugins(),
    ]);
    this.instructions = instructions;
    await fireHooks("on-start", {}, { blocking: false });

    const instBlock = formatInstructionsBlock(this.instructions);
    if (instBlock) {
      this.emit("event", {
        type: "log" as const,
        level: "info",
        message: `Loaded instructions: ${this.instructions.agentsMd ? "AGENTS.md" : ""}${this.instructions.agentsMd && this.instructions.skills.length > 0 ? ", " : ""}${this.instructions.skills.length > 0 ? `${this.instructions.skills.length} skill(s)` : ""}`,
      });
    }

    void this.runDeferredInit();
    const startMs = perfMeasure("agent.start.total_ms", "agent.start.begin");
    this.emit("event", {
      type: "log" as const,
      level: "info",
      message: `Perf startup(core-ready): ${startMs}ms`,
    });
  }

  private async runDeferredInit(): Promise<void> {
    this.emit("event", {
      type: "log" as const,
      level: "info",
      message: "Background warmup started",
    });
    // Start file watcher for real-time codebase awareness
    const watcher = getFileWatcher();
    watcher.start();
    watcher.on("ready", ({ fileCount }) => {
      this.emit("event", {
        type: "log" as const,
        level: "info",
        message: `File watcher ready: ${fileCount} files tracked`,
      });
    });

    // Load MCP servers from .w3x/mcp.json
    try {
      const { McpClient } = await import("../mcp/index");
      const configs = await McpClient.loadConfig();
      if (configs.length > 0) {
        const client = getMcpClient();
        let connectedCount = 0;
        const concurrency = 3;
        for (let i = 0; i < configs.length; i += concurrency) {
          const batch = configs.slice(i, i + concurrency);
          const settled = await Promise.allSettled(batch.map((config) => client.connect(config)));
          for (const item of settled) {
            if (item.status === "fulfilled") {
              connectedCount += item.value.tools;
            } else {
              logger.warn(
                "mcp",
                `MCP server connection failed: ${logger.fromError("mcp", item.reason)}`,
              );
            }
          }
        }
        ToolRegistry.invalidateCache();
        if (connectedCount > 0) {
          this.emit("event", {
            type: "log" as const,
            level: "info",
            message: `MCP: ${configs.length} server(s), ${connectedCount} tool(s) registered`,
          });
        }
      }
    } catch (e) {
      logger.warn("agent", `MCP init error: ${logger.fromError("mcp", e)}`);
    } finally {
      this.emit("event", {
        type: "log" as const,
        level: "info",
        message: "Background warmup completed",
      });
    }
  }

  /** Build the full system prompt: template + mode suffix + instructions + memory + pinned */
  private async buildSystemPrompt(): Promise<string> {
    const modeSuffix = this.mode === "plan" ? PLAN_AGENT_SUFFIX : BUILD_AGENT_SUFFIX;
    const memoryBlock = await buildMemoryContext();
    const pinnedBlock = await this.buildPinnedContext();
    const instBlock = formatInstructionsBlock(this.instructions);

    return [
      SYSTEM_PROMPT_TEMPLATE,
      modeSuffix,
      instBlock,
      memoryBlock,
      pinnedBlock,
      this.commandSuffix,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async stop(): Promise<void> {
    const start = Date.now();
    while (this.processing && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.running = false;
    this.setState("done");

    // Clean up MCP connections
    try {
      await getMcpClient().disconnectAll();
      ToolRegistry.invalidateCache();
    } catch {
      // non-critical
    }

    // Stop file watcher
    try {
      await getFileWatcher().stop();
    } catch {
      // non-critical
    }

    await fireHooks("on-stop", {}, { blocking: false });

    // Auto-summarize session before saving
    await this.autoSummarizeSession();
    await saveLearnedPermissions();
    await this.saveState();
  }

  // ─── Main streaming loop ───────────────────────────────────────────────────
  async *processUserInput(text: string): AsyncGenerator<CLIEvent> {
    perfMark("agent.turn.begin");
    this.startTime = Date.now();
    this.stepCount = 0;
    this.processing = true;
    this.runAbortController = new AbortController();
    setShellAbortSignal(this.runAbortController.signal);
    this.setState("reasoning");
    this.messages.push({ role: "user", content: text });

    // Build system prompt dynamically
    const systemPrompt = await this.buildSystemPrompt();

    // Select model via router (command context or prompt heuristic)
    const taskType = this.commandTaskType !== "general" ? this.commandTaskType : undefined;
    const model = taskType
      ? this.router.getModelForTask(taskType)
      : this.router.getModelForPrompt(text).model;

    // Register model for sub-agent delegation
    setDelegationModel(model);

    try {
      // Compaction: compress older messages when approaching token limits
      const compactionResult = compactContext(this.messages, {
        tokenLimit: 128000,
        threshold: 0.8,
      });
      this.messages = compactionResult.messages as ModelMessage[];

      if (compactionResult.compacted > 0 || compactionResult.dropped > 0) {
        this.emit("event", {
          type: "log" as const,
          level: "info",
          message: `Context compacted: ${compactionResult.compacted} compressed, ${compactionResult.dropped} dropped`,
        });
      }

      // Emit context warning if approaching token limits
      const ctxWarning = contextWarning(this.messages);
      if (ctxWarning) {
        this.emit("event", {
          type: "log" as const,
          level: "warn",
          message: ctxWarning,
        });
      }

      const result = streamText({
        model,
        system: systemPrompt,
        messages: this.messages,
        tools: ToolRegistry.getTools(),
        abortSignal: this.runAbortController.signal,
        stopWhen: stepCountIs(this.maxSteps),
        onStepFinish: (step) => {
          this.stepCount++;
          if (step.usage) {
            this.totalTokens.prompt += step.usage.inputTokens || 0;
            this.totalTokens.completion += step.usage.outputTokens || 0;
            this.totalTokens.total += step.usage.totalTokens || 0;
            this.emit("event", {
              type: "usage" as const,
              promptTokens: this.totalTokens.prompt,
              completionTokens: this.totalTokens.completion,
              totalTokens: this.totalTokens.total,
            });
          }
        },
      });

      let fullText = "";
      for await (const event of result.fullStream) {
        switch (event.type) {
          case "text-delta":
            perfCount("stream.text_delta");
            fullText += event.text;
            yield { type: "text" as const, content: event.text };
            break;

          case "reasoning-delta":
            perfCount("stream.reasoning_delta");
            yield { type: "thinking" as const, content: event.text };
            break;

          case "tool-call": {
            this.setState("executing");
            const toolEvent = event as StreamToolEvent;
            const input =
              typeof (toolEvent.input ?? toolEvent.args) === "object" &&
              (toolEvent.input ?? toolEvent.args) !== null
                ? ((toolEvent.input ?? toolEvent.args) as Record<string, unknown>)
                : {};

            if (!isAutoApproved(event.toolName, this.mode, input)) {
              yield {
                type: "awaiting-approval" as const,
                description: `${event.toolName}: ${JSON.stringify(input).slice(0, 150)}`,
              };
              this.setState("awaiting-approval");
              const decision = await this.waitForApproval();
              yield { type: "approval-result" as const, decision };
              recordDecision(event.toolName, input, decision);
              if (decision === "reject") {
                this.emit("event", {
                  type: "log" as const,
                  level: "warn",
                  message: `Rejected: ${event.toolName}`,
                });
                this.setState("reasoning");
                continue;
              }
            }

            const toolArgs =
              typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
            await fireHooks(
              "before-tool-call",
              {
                tool: event.toolName,
                args: JSON.stringify(toolArgs),
                signal: this.runAbortController.signal,
              },
              { blocking: true },
            );
            yield {
              type: "step-start" as const,
              toolName: event.toolName,
              args: toolArgs,
            };
            this.emit("event", {
              type: "log" as const,
              level: "info",
              message: `▸ ${event.toolName}(${Object.entries(toolArgs)
                .map(([k, v]) => `${k}=${String(v).slice(0, 50)}`)
                .join(", ")})`,
            });
            this.setState("reasoning");
            break;
          }

          case "tool-result": {
            const output =
              typeof event.output === "string" ? event.output : JSON.stringify(event.output);
            await fireHooks(
              "after-tool-call",
              {
                tool: event.toolName,
                result: output.slice(0, 1000),
                signal: this.runAbortController.signal,
              },
              { blocking: false },
            );
            const success = !output.includes('"error"') && !output.includes('"success":false');
            yield {
              type: "step-end" as const,
              toolName: event.toolName,
              success,
              output: output.slice(0, 3000),
            };
            if (!success) {
              this.emit("event", {
                type: "log" as const,
                level: "error",
                message: `${event.toolName} failed`,
              });
            }
            break;
          }

          case "error": {
            const errorEvent = event as StreamErrorEvent;
            const msg =
              typeof errorEvent.error === "object" &&
              errorEvent.error &&
              "message" in errorEvent.error
                ? String((errorEvent.error as { message?: unknown }).message)
                    .split("\n")[0]
                    .slice(0, 300)
                : String(errorEvent.error).split("\n")[0].slice(0, 300);
            await fireHooks(
              "on-error",
              { error: msg, signal: this.runAbortController.signal },
              { blocking: false },
            );
            yield { type: "error" as const, message: msg };
            this.emit("event", {
              type: "log" as const,
              level: "error",
              message: msg,
            });
            break;
          }
        }
      }

      const response = await result.response;
      this.messages.push(...response.messages);

      const duration = Date.now() - this.startTime;
      this.emit("event", {
        type: "log" as const,
        level: "info",
        message: `Task done in ${(duration / 1000).toFixed(1)}s, ${this.stepCount} steps, ${this.totalTokens.total} tokens`,
      });
      yield { type: "done" as const, summary: fullText.slice(-500) };
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, 300);
      logger.error("agent", `Stream error: ${msg}`);
      yield { type: "error" as const, message: msg };
      this.emit("event", {
        type: "log" as const,
        level: "error",
        message: msg,
      });
    } finally {
      const turnMs = perfMeasure("agent.turn.total_ms", "agent.turn.begin");
      const perf = perfSnapshot();
      this.emit("event", {
        type: "log" as const,
        level: "info",
        message: `Perf turn: ${turnMs}ms textDeltas=${perf.counters["stream.text_delta"] ?? 0} thinkingDeltas=${perf.counters["stream.reasoning_delta"] ?? 0}`,
      });
      this.runAbortController = null;
      setShellAbortSignal(undefined);
      this.processing = false;
      this.setState("monitoring");
      await this.saveState();
    }
  }

  // ─── Plan-and-Execute (for /plan command in build mode) ────────────────────
  async *planAndExecute(goal: string): AsyncGenerator<CLIEvent> {
    this.setState("planning");
    this.processing = true;

    yield {
      type: "log" as const,
      level: "info",
      message: `Planning: ${goal.slice(0, 80)}`,
    };

    try {
      const planningModel = this.router.getModelForTask("planning");
      const planner = new Planner(planningModel);
      const plan = await planner.plan(goal);

      yield { type: "plan-ready" as const, plan };
      this.emit("event", {
        type: "log" as const,
        level: "info",
        message: `Plan ready: ${plan.steps.length} steps`,
      });

      if (this.mode === "plan") {
        // In plan-only mode: just show the plan, don't execute
        yield {
          type: "done" as const,
          summary: plan.steps.map((s, i) => `${i + 1}. ${s.description}`).join("\n"),
        };
        return;
      }

      // Build mode: execute each step
      const systemBase = await this.buildSystemPrompt();
      const execModel = this.router.getModelForTask("coding");
      const executor = new Executor(execModel);

      for await (const event of executor.execute(plan, systemBase)) {
        yield event;
      }

      yield { type: "done" as const, summary: `Executed plan: ${plan.goal}` };
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      logger.error("agent", `Plan-and-execute error: ${msg}`);
      yield { type: "error" as const, message: msg };
    } finally {
      this.processing = false;
      this.setState("monitoring");
    }
  }

  // ─── Approval ──────────────────────────────────────────────────────────────
  private waitForApproval(): Promise<"approve" | "reject"> {
    return new Promise((r) => {
      this.approvalResolve = r;
    });
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  private setState(s: AgentState): void {
    this.state = s;
    const nextPhase = stateToPhase(s);
    if (!canTransition(this.phase.kind, nextPhase.kind)) {
      this.emit("event", {
        type: "log" as const,
        level: "warn",
        message: `Invalid phase transition: ${this.phase.kind} → ${nextPhase.kind}`,
      });
    }
    this.phase = nextPhase;
    this.emit("event", { type: "state-change" as const, state: s });
  }

  // ─── Persistence ───────────────────────────────────────────────────────────
  private async saveState(): Promise<void> {
    try {
      await mkdir(".w3x", { recursive: true });
      await fsWriteFile(
        ".w3x/state.json",
        JSON.stringify(
          {
            mode: this.mode,
            model: this.llm.getModelName(),
            messages: this.messages.slice(-50),
            tokens: this.totalTokens,
          },
          null,
          2,
        ),
        "utf-8",
      );
    } catch {
      /* ignore */
    }
  }

  private async loadState(): Promise<void> {
    try {
      const d = JSON.parse(await fsReadFile(".w3x/state.json", "utf-8"));
      if (d.mode) this.mode = d.mode;
      if (d.model) this.llm.setModel(d.model);
      if (d.messages) this.messages = d.messages;
      if (d.tokens) this.totalTokens = d.tokens;
      this.emit("event", {
        type: "log" as const,
        level: "info",
        message: `State loaded: ${this.messages.length} messages, model: ${this.llm.getModelName()}`,
      });
    } catch {
      /* fresh start */
    }
  }

  private async autoSummarizeSession(): Promise<void> {
    if (this.messages.length < 4) return; // too short to summarise

    try {
      const summaryPrompt = extractSummaryPrompt(
        this.messages as Array<{ role: string; content: unknown }>,
      );
      const { text } = await generateText({
        model: this.router.getModelForTask("fast"),
        prompt: summaryPrompt,
        maxOutputTokens: 200,
      });

      if (text.trim()) {
        await saveSessionSummary(text.trim(), this.llm.getModelName(), this.messages.length);
        this.emit("event", {
          type: "log" as const,
          level: "info",
          message: "Session summary saved to memory",
        });
      }
    } catch {
      /* non-critical */
    }
  }
}
