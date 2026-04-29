import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

const LOG_DIR = join(cwd(), ".w3x", "logs");

function formatEntry(entry: LogEntry): string {
  return `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.category}: ${entry.message}`;
}

function logFileName(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(LOG_DIR, `w3x-${date}.log`);
}

let initialized = false;

async function ensureLogDir(): Promise<void> {
  if (!initialized) {
    await mkdir(LOG_DIR, { recursive: true });
    initialized = true;
  }
}

export const logger = {
  async log(
    level: LogLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
    };

    const formatted = formatEntry(entry);

    // Console output (stderr for warn/error to avoid mixing with stdout)
    if (level === "error" || level === "warn") {
      console.error(formatted);
    } else {
      // debug/info go to stdout only in debug mode
      if (process.env.W3X_DEBUG) {
        console.log(formatted);
      }
    }

    // File persistence
    try {
      await ensureLogDir();
      await appendFile(logFileName(), formatted + "\n", "utf-8");
    } catch {
      // log-to-file is best-effort, don't crash
    }
  },

  debug(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("debug", category, message, data);
  },
  info(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("info", category, message, data);
  },
  warn(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("warn", category, message, data);
  },
  error(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("error", category, message, data);
  },

  /** Log a caught error, returning a user-facing message. */
  fromError(category: string, err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    this.log("error", category, msg);
    return msg;
  },
} as const;
