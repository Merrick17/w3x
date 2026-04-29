import "dotenv/config";
import { render } from "ink";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BuildAgent } from "./agent/build";
import { createLlmProvider } from "./provider/index";
import { loadSettings } from "./config/loader";
import { loadHooks } from "./hooks/engine";
import { App } from "./app";

// ─── CLI argument parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf-8"),
  );
  console.log(`w3x v${pkg.version} — autonomous AI coding agent with terminal UI

Usage: w3x [options]

Options:
  -m, --model <id>     Override the default model
  -u, --base-url <url> Override the LLM base URL
  --mode <mode>        Agent mode: "plan" or "build" (default: build)
  --max-steps <n>      Maximum steps per task (default: 25)
  -p, --project <path> Set project working directory
  --debug              Enable debug logging
  -h, --help           Show this help message
  --version            Show version number

Environment:
  W3X_MODEL            Default model override
  W3X_BASE_URL         Default base URL override

Config files (merged in order):
  ~/.w3x/settings.json        User-level settings
  .w3x/settings.json           Project-level settings
  .w3x/settings.local.json    Local overrides (gitignored)
`);
  process.exit(0);
}

if (args.includes("--version")) {
  const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf-8"),
  );
  console.log(pkg.version);
  process.exit(0);
}

// ─── Settings & bootstrap ───────────────────────────────────────────────

const cliModel = args.includes("-m") ? args[args.indexOf("-m") + 1] : undefined;
const cliBaseURL = args.includes("-u") ? args[args.indexOf("-u") + 1] : undefined;
const cliMode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : undefined;
const cliMaxSteps = args.includes("--max-steps")
  ? parseInt(args[args.indexOf("--max-steps") + 1], 10)
  : undefined;

const settings = loadSettings({
  model: cliModel ?? process.env.W3X_MODEL,
  baseURL: cliBaseURL ?? process.env.W3X_BASE_URL,
  mode: cliMode as "plan" | "build" | undefined,
  maxSteps: cliMaxSteps,
});

loadHooks(settings);

if (!process.stdin.isTTY) {
  console.error("w3x requires an interactive terminal (TTY).");
  process.exit(1);
}

const llm = createLlmProvider({
  model:
    settings.model ??
    (process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "gemini-2.0-flash" : "qwen3.5:cloud"),
  baseURL: settings.baseURL ?? "http://127.0.0.1:11434",
});

const agent = new BuildAgent(llm, {
  mode: settings.mode,
  maxSteps: settings.maxSteps,
});

agent
  .start()
  .then(() => render(<App agent={agent} />))
  .catch((err) => {
    console.error("Failed to start agent:", err);
    process.exit(1);
  });
