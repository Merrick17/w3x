import type { LanguageModel } from "ai";
import type { TaskType } from "../types";
import type { LlmProvider } from "./index";
import { detectProvider } from "../provider/index";

export interface RouterConfig {
  planning: string;
  coding: string;
  fast: string;
  search: string;
  general: string;
}

/**
 * Build a router config based on which provider API keys are available.
 * Priority: OpenAI > Anthropic > Google > Ollama (for coding),
 *           Google > OpenAI > Anthropic > Ollama (for planning, since Gemini excels at reasoning),
 *           Google > OpenAI > Anthropic > Ollama (for search)
 */
function buildRouterConfig(defaultModel: string): RouterConfig {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const provider = detectProvider(defaultModel);

  // Default configs for each provider
  const configs: Record<string, RouterConfig> = {
    openai: {
      planning: "gpt-4.1",
      coding: "gpt-4o",
      fast: "gpt-4o-mini",
      search: "gpt-4o-mini",
      general: "gpt-4o",
    },
    anthropic: {
      planning: "claude-opus-4-20250514",
      coding: "claude-sonnet-4-20250514",
      fast: "claude-haiku-4-20250514",
      search: "claude-sonnet-4-20250514",
      general: "claude-sonnet-4-20250514",
    },
    google: {
      planning: "gemini-2.5-pro",
      coding: "gemini-2.5-flash",
      fast: "gemini-2.0-flash",
      search: "gemini-2.0-flash",
      general: "gemini-2.5-flash",
    },
    ollama: {
      planning: "qwen3:cloud",
      coding: "qwen3.5:cloud",
      fast: "qwen3.5:cloud",
      search: "qwen3.5:cloud",
      general: "qwen3.5:cloud",
    },
  };

  // For planning, Google's Gemini 2.5 Pro is excellent. If available, prefer it.
  // For coding, prefer Anthropic > OpenAI > Google > Ollama
  // For search, any fast model works
  const planningModel = hasGoogle
    ? "gemini-2.5-pro"
    : hasOpenAI
      ? "gpt-4.1"
      : hasAnthropic
        ? "claude-opus-4-20250514"
        : configs[provider].planning;

  const codingModel = hasAnthropic
    ? "claude-sonnet-4-20250514"
    : hasOpenAI
      ? "gpt-4o"
      : hasGoogle
        ? "gemini-2.5-flash"
        : configs[provider].coding;

  const fastModel = hasOpenAI
    ? "gpt-4o-mini"
    : hasAnthropic
      ? "claude-haiku-4-20250514"
      : hasGoogle
        ? "gemini-2.0-flash"
        : configs[provider].fast;

  const searchModel = hasGoogle
    ? "gemini-2.0-flash"
    : hasOpenAI
      ? "gpt-4o-mini"
      : hasAnthropic
        ? "claude-haiku-4-20250514"
        : configs[provider].search;

  const generalModel = hasAnthropic
    ? "claude-sonnet-4-20250514"
    : hasOpenAI
      ? "gpt-4o"
      : hasGoogle
        ? "gemini-2.5-flash"
        : defaultModel;

  return {
    planning: planningModel,
    coding: codingModel,
    fast: fastModel,
    search: searchModel,
    general: generalModel,
  };
}

const PLANNING_TOKENS = [
  "plan",
  "architecture",
  "design",
  "how should",
  "what is the best way",
  "outline",
  "strategy",
  "approach",
  "step by step",
  "breakdown",
  "decompose",
  "structure",
  "organise",
  "organize",
  "roadmap",
  "what would",
  "how to",
];

const CODING_TOKENS = [
  "write",
  "implement",
  "create",
  "build",
  "code",
  "function",
  "class",
  "component",
  "edit",
  "modify",
  "refactor",
  "fix",
  "bug",
  "error",
  "patch",
  "update",
  "add",
  "delete line",
  "replace",
  "typescript",
  "javascript",
  "react",
  "hook",
  "api",
  "endpoint",
  "test",
  "spec",
];

const SEARCH_TOKENS = [
  "search",
  "find online",
  "look up",
  "google",
  "web",
  "documentation",
  "docs for",
  "latest",
  "news",
  "article",
  "link",
  "url",
  "package info",
];

const FAST_TOKENS = [
  "what is",
  "show me",
  "list",
  "status",
  "check",
  "version",
  "run",
  "execute",
  "git",
  "npm",
  "install",
  "ping",
  "health",
  "quick",
];

export function classifyTask(prompt: string): TaskType {
  const lower = prompt.toLowerCase();

  let planScore = 0;
  let codeScore = 0;
  let searchScore = 0;
  let fastScore = 0;

  for (const t of PLANNING_TOKENS) if (lower.includes(t)) planScore++;
  for (const t of CODING_TOKENS) if (lower.includes(t)) codeScore++;
  for (const t of SEARCH_TOKENS) if (lower.includes(t)) searchScore++;
  for (const t of FAST_TOKENS) if (lower.includes(t)) fastScore++;

  const max = Math.max(planScore, codeScore, searchScore, fastScore);
  if (max === 0) return "general";
  if (planScore === max) return "planning";
  if (codeScore === max) return "coding";
  if (searchScore === max) return "search";
  return "fast";
}

export class ModelRouter {
  private config: RouterConfig;
  private provider: LlmProvider;
  private defaultModel: string;

  constructor(provider: LlmProvider, customConfig?: Partial<RouterConfig>) {
    this.provider = provider;
    this.defaultModel = provider.getModelName();
    this.config = { ...buildRouterConfig(this.defaultModel), ...customConfig };
  }

  getModelForTask(type: TaskType): LanguageModel {
    const modelId = this.config[type] ?? this.config.general;
    return this.provider.getModel(modelId);
  }

  getModelForPrompt(prompt: string): { model: LanguageModel; type: TaskType; modelId: string } {
    const type = classifyTask(prompt);
    const modelId = this.config[type] ?? this.config.general;
    return { model: this.provider.getModel(modelId), type, modelId };
  }

  setRoute(type: TaskType, modelId: string): void {
    this.config[type] = modelId;
  }

  getConfig(): Readonly<RouterConfig> {
    return { ...this.config };
  }
}
