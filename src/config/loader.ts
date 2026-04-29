import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cwd } from "node:process";
import { SettingsSchema, type Settings } from "./schema";

const USER_CONFIG_DIR = join(homedir(), ".w3x");
const USER_SETTINGS_PATH = join(USER_CONFIG_DIR, "settings.json");
const PROJECT_SETTINGS_PATH = ".w3x/settings.json";
const LOCAL_SETTINGS_PATH = ".w3x/settings.local.json";

function readJsonFile(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = result[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

export interface CliOverrides {
  model?: string;
  baseURL?: string;
  mode?: "plan" | "build";
  maxSteps?: number;
  debug?: boolean;
  project?: string;
}

/**
 * Load and merge settings from all layers:
 * 1. User settings:   ~/.w3x/settings.json
 * 2. Project settings: .w3x/settings.json
 * 3. Local settings:   .w3x/settings.local.json
 * 4. Environment vars: W3X_MODEL, W3X_BASE_URL, etc.
 * 5. CLI arguments
 */
export function loadSettings(cli: CliOverrides = {}): Settings {
  // Layer 1: User settings
  const userData = readJsonFile(USER_SETTINGS_PATH) ?? {};

  // Layer 2: Project settings
  const projectData = readJsonFile(join(cwd(), PROJECT_SETTINGS_PATH)) ?? {};

  // Layer 3: Local settings (gitignored)
  const localData = readJsonFile(join(cwd(), LOCAL_SETTINGS_PATH)) ?? {};

  // Deep merge: user → project → local
  let merged = deepMerge(userData, projectData);
  merged = deepMerge(merged, localData);

  // Layer 4: Environment variables
  if (process.env.W3X_MODEL && !cli.model) {
    merged.model = process.env.W3X_MODEL;
  }
  if (process.env.W3X_BASE_URL && !cli.baseURL) {
    merged.baseURL = process.env.W3X_BASE_URL;
  }

  // Layer 5: CLI overrides (highest priority)
  if (cli.model) merged.model = cli.model;
  if (cli.baseURL) merged.baseURL = cli.baseURL;
  if (cli.mode) merged.mode = cli.mode;
  if (cli.maxSteps !== undefined) merged.maxSteps = cli.maxSteps;

  // Validate against schema (fills in defaults for missing fields)
  const result = SettingsSchema.safeParse(merged);
  if (!result.success) {
    // Invalid config: log warnings but return defaults for safety
    for (const issue of result.error.issues) {
      console.warn(`[w3x config] ${issue.path.join(".")}: ${issue.message}`);
    }
    return SettingsSchema.parse({});
  }

  return result.data;
}

/**
 * Get the path to the project-local settings file for display.
 */
export function settingsPaths() {
  return {
    user: USER_SETTINGS_PATH,
    project: join(cwd(), PROJECT_SETTINGS_PATH),
    local: join(cwd(), LOCAL_SETTINGS_PATH),
  };
}
