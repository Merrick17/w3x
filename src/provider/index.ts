import { createOllama, type OllamaProvider } from "ai-sdk-ollama";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export type SupportedProvider = "google" | "openai" | "anthropic" | "ollama";

export interface LlmProviderOptions {
  model?: string;
  baseURL?: string;
}

export interface OllamaModel {
  name: string;
  size?: number;
  modified_at?: string;
}

const DEFAULT_MODEL = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  ? "gemini-2.0-flash"
  : process.env.OPENAI_API_KEY
    ? "gpt-4o-mini"
    : process.env.ANTHROPIC_API_KEY
      ? "claude-sonnet-4-20250514"
      : "qwen3.5:cloud";

/**
 * Detect which provider a model belongs to based on its ID prefix.
 */
export function detectProvider(modelId: string): SupportedProvider {
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1-") || modelId.startsWith("o3-") || modelId.startsWith("o4-")) return "openai";
  if (modelId.startsWith("claude-")) return "anthropic";
  return "ollama";
}

export function createLlmProvider(options: LlmProviderOptions = {}) {
  let currentModel = options.model || process.env.W3X_MODEL || DEFAULT_MODEL;
  let baseURL = options.baseURL || process.env.W3X_BASE_URL || "http://127.0.0.1:11434";
  let ollamaProvider: OllamaProvider = createOllama({ baseURL });

  function getModel(modelId?: string): LanguageModel {
    const id = modelId || currentModel;
    const provider = detectProvider(id);

    switch (provider) {
      case "google":
        return google(id);
      case "openai":
        return openai(id);
      case "anthropic":
        return anthropic(id);
      default:
        return ollamaProvider(id);
    }
  }

  async function listModels(): Promise<OllamaModel[]> {
    try {
      const res = await fetch(`${baseURL}/api/tags`);
      if (!res.ok) throw new Error(`${res.status}`);
      return ((await res.json()) as { models: OllamaModel[] }).models || [];
    } catch {
      return [];
    }
  }

  /** List available models across all configured providers */
  function listAvailableModels(): { id: string; provider: SupportedProvider; context?: number }[] {
    const models: { id: string; provider: SupportedProvider; context?: number }[] = [];

    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      models.push(
        { id: "gemini-2.0-flash", provider: "google", context: 1_048_576 },
        { id: "gemini-2.5-flash", provider: "google", context: 1_048_576 },
        { id: "gemini-2.5-pro", provider: "google", context: 2_097_152 },
      );
    }
    if (process.env.OPENAI_API_KEY) {
      models.push(
        { id: "gpt-4o-mini", provider: "openai", context: 128_000 },
        { id: "gpt-4o", provider: "openai", context: 128_000 },
        { id: "gpt-4.1", provider: "openai", context: 1_000_000 },
        { id: "o4-mini", provider: "openai", context: 200_000 },
      );
    }
    if (process.env.ANTHROPIC_API_KEY) {
      models.push(
        { id: "claude-sonnet-4-20250514", provider: "anthropic", context: 200_000 },
        { id: "claude-haiku-4-20250514", provider: "anthropic", context: 200_000 },
        { id: "claude-opus-4-20250514", provider: "anthropic", context: 200_000 },
      );
    }

    return models;
  }

  function setModel(m: string): void {
    currentModel = m;
  }
  function getModelName(): string {
    return currentModel;
  }
  function setBaseURL(u: string): void {
    baseURL = u;
    ollamaProvider = createOllama({ baseURL: u });
  }
  function getBaseURL(): string {
    return baseURL;
  }

  return {
    getModel,
    listModels,
    listAvailableModels,
    setModel,
    getModelName,
    setBaseURL,
    getBaseURL,
  } as const;
}

export type LlmProvider = ReturnType<typeof createLlmProvider>;
