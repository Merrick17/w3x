# W3X — Autonomous AI Coding Agent

**w3x** is a terminal-native autonomous AI coding agent with a rich TUI. It can read, write, edit, refactor, and explore your codebase — plan complex tasks, execute them step by step, delegate to sub-agents, interact with blockchains, and learn from its own memory across sessions.

Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal), powered by the [Vercel AI SDK](https://sdk.vercel.ai/), and model-agnostic: bring your own API keys for Anthropic, OpenAI, Google Gemini, or run fully local with Ollama.

<p align="center">
  <img src="https://img.shields.io/badge/version-2.1.0-blue" alt="version">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-green" alt="node">
  <img src="https://img.shields.io/badge/type-module-yellow" alt="module">
  <img src="https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20windows-lightgrey" alt="platform">
</p>

---

## Features

### Core Agent

- **Autonomous execution** — Give it a task and it figures out the steps
- **Plan mode** — Decompose complex tasks into numbered plans before touching code
- **Build mode** — Full read/write access for autonomous coding
- **Model routing** — Automatically picks the best model for the task (planning → Opus/Gemini Pro, coding → Sonnet/GPT-4o, fast queries → Haiku/Gemini Flash)
- **Multi-step reasoning** — Thinks before acting, validates after acting

### Tools (22 built-in)

| Category          | Tools                                                                            |
| ----------------- | -------------------------------------------------------------------------------- |
| **Files**         | `read`, `write`, `edit` (surgical replace), `exactEdit`, `listFiles`, `treeView` |
| **Search**        | `glob` (pattern matching), `grep` (regex search), `webSearch`, `webFetch`        |
| **Shell**         | `bash` / `runCommand`                                                            |
| **Git**           | `gitStatus`, `gitDiff`, `gitLog`, commit via `/commit`                           |
| **Sub-agents**    | `agent` (delegate to specialist), `delegateTask`                                 |
| **Task tracking** | `taskCreate`, `taskUpdate`, `taskList`, `taskGet`                                |
| **Scheduling**    | `cronCreate`, `cronDelete`, `cronList`                                           |
| **Memory**        | `saveMemory`, `recallMemory` (persistent across sessions via SQLite)             |
| **Web3**          | `readChain` (EVM), `sendTransaction`, `getSolanaBalance`                         |
| **Misc**          | `ask` (clarifying questions), `takeScreenshot` (UI verification)                 |

### Terminal UI

- **Rich TUI** — Theme-aware (One Dark), bordered panels, collapsible blocks
- **Live streaming** — See the agent think, reason, and execute in real time
- **Command palette** — `Ctrl+K` fuzzy search for all actions
- **Sidebar** — Logs panel + token usage meter + context window gauge (auto-hides on narrow terminals)
- **Slash commands** — `/plan`, `/code`, `/edit`, `/refactor`, `/search`, `/review`, `/test`, `/commit`, `/config`, `/security-review`, `/mode`, `/model`, `/help`, `/exit`
- **Overlays** — Command palette, model selector, tool approval dialog
- **Scrollable history** — Up/Down arrows to browse past messages
- **Welcome screen** — Getting-started tips on first launch

### Memory & Persistence

- **SQLite-backed memory** — Facts and session summaries survive restarts
- **Markdown memory (`MEMORY.md`)** — Human-readable project context the agent maintains
- **Learned permissions** — Remembers your tool-approval decisions

### Web3

- EVM chain reads and transaction sending (`viem`)
- Solana balance queries and interactions (`@solana/kit`)

### Extensibility

- **MCP (Model Context Protocol)** — Connect external tools and data sources
- **Plugins** — Plugin installer with Solana + frontend plugins included
- **Hooks** — Startup/shutdown hook engine
- **Custom themes** — Color tokens, spacing, typography, border configs
- **Configurable** — Settings merge from `~/.w3x/` → `.w3x/` → `.w3x/local/`

---

## Installation

### Prerequisites

- **Node.js >= 20.0.0**
- An interactive terminal (TTY)

### Install from npm

```bash
npm install -g w3x
```

### Run without installing

```bash
npx w3x
```

### Provider setup

Set at least one API key:

```bash
# Anthropic (Claude Opus 4.7, Sonnet 4.6, Haiku 4.5)
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI (GPT-4o, GPT-4.1, o4-mini)
export OPENAI_API_KEY="sk-..."

# Google (Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash)
export GOOGLE_GENERATIVE_AI_API_KEY="..."

# Ollama (fully local — no API key needed)
ollama pull qwen3.5:cloud
```

W3X auto-detects available providers and populates the model selector accordingly.

---

## Usage

### Quick start

```bash
# Launch the interactive terminal UI
w3x

# Override the model
w3x -m claude-opus-4-20250514

# Start in plan mode (read-only)
w3x --mode plan

# Set a project directory
w3x -p ~/my-project

# Use Ollama with a custom base URL
w3x -m qwen3.5:cloud -u http://localhost:11434
```

### CLI options

```
w3x [options]

Options:
  -m, --model <id>     Override the default model
  -u, --base-url <url> Override the LLM base URL
  --mode <mode>        Agent mode: "plan" or "build" (default: build)
  --max-steps <n>      Maximum steps per task (default: 25)
  -p, --project <path> Set project working directory
  --debug              Enable debug logging
  -h, --help           Show this help message
  --version            Show version number
```

### Keyboard shortcuts

| Shortcut            | Action               |
| ------------------- | -------------------- |
| `Ctrl+K`            | Open command palette |
| `Ctrl+L`            | Toggle logs sidebar  |
| `Ctrl+M`            | Open model selector  |
| `Ctrl+H`            | Show help            |
| `Ctrl+X` / `Ctrl+C` | Exit                 |

### Interaction flow

1. **Type a task** — e.g., _"Add input validation to the signup form"_
2. **Agent reasons** — Shows `⠋ Thinking...` spinner, then reasoning in a collapsible block
3. **Agent acts** — Executes tools (file reads, edits, shell commands) shown in real time with spinners
4. **Streaming output** — Agent's text responses stream live
5. **Review & iterate** — Conversation history scrollable with up/down arrows

---

## Configuration

Settings are merged in order (later overrides earlier):

| File                       | Scope                              |
| -------------------------- | ---------------------------------- |
| `~/.w3x/settings.json`     | User-level (all projects)          |
| `.w3x/settings.json`       | Project-level (version-controlled) |
| `.w3x/settings.local.json` | Local overrides (gitignored)       |

Environment variables:

- `W3X_MODEL` — Default model
- `W3X_BASE_URL` — Default base URL (for Ollama or custom endpoints)
- `W3X_DEBUG` — Enable debug logging

---

## Development

### Setup

```bash
git clone <repo-url>
cd web3agent
npm install
```

### Scripts

```bash
npm run dev          # Run in dev mode (tsx, no build needed)
npm run build        # Compile TypeScript → dist/
npm start            # Run compiled output
npm run typecheck    # Type-check only (tsc --noEmit)
npm run test         # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Tests + coverage report
npm run lint         # Lint (ESLint)
npm run lint:fix     # Lint + auto-fix
npm run format       # Format (Prettier)
npm run format:check # Check formatting
```

### Project structure

```
src/
├── index.tsx               # CLI entry point (arg parsing, bootstrap)
├── app.tsx                 # Main terminal UI (Ink + React)
├── agent/
│   ├── build.ts            # BuildAgent: core agent loop (24 KB)
│   ├── executor.ts         # Tool execution engine
│   ├── planner.ts          # Planning/decomposition
│   ├── state-machine.ts    # Agent state transitions
│   ├── sub-agent.ts        # Sub-agent delegation
│   └── tool-registry.ts    # Tool registration
├── components/ui/          # Terminal UI components
│   ├── thinking-block.tsx  # Collapsible reasoning display
│   ├── tool-call.tsx       # Tool execution with spinner
│   ├── tool-approval.tsx   # Approval dialog (risk levels, timeout)
│   ├── command-palette.tsx # Fuzzy-search command palette
│   ├── model-selector.tsx  # Model picker with provider grouping
│   ├── chat-message.tsx    # Message with sender, timestamp, collapse
│   ├── chat-thread.tsx     # Scrollable message container
│   ├── token-usage.tsx     # Token display + context meter
│   ├── app-shell.tsx       # App layout compound component
│   ├── theme-provider.tsx  # Design token system + theme context
│   ├── info-box.tsx        # Bordered info panel
│   └── bullet-list.tsx     # List rendering
├── hooks/
│   ├── useAgent.ts         # Bridges agent events → React state
│   ├── use-animation.ts    # Frame-counter for spinners
│   └── use-input.ts        # Ink useInput re-export
├── provider/
│   ├── index.ts            # LLM provider abstraction
│   └── router.ts           # Model routing (task → best model)
├── tool/                   # 20+ tool implementations
├── command/                # Slash command system
├── memory/                 # SQLite + Markdown memory
├── permission/             # Tool approval & auto-approval
├── security/               # Security review
├── git/                    # Git integration
├── mcp/                    # MCP client
├── plugins/                # Plugin system
├── lib/
│   ├── logger.ts           # Structured logger
│   └── terminal-themes/    # Theme definitions
└── types/
    └── index.ts            # Shared TypeScript types
```

### Tech stack

| Layer           | Technology                                                                     |
| --------------- | ------------------------------------------------------------------------------ |
| **UI**          | [Ink](https://github.com/vadimdemedes/ink) v7 (React for terminals) + React 19 |
| **AI/LLM**      | [Vercel AI SDK](https://sdk.vercel.ai/) v6                                     |
| **Models**      | `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `ai-sdk-ollama`       |
| **Web3**        | `viem` (EVM), `@solana/kit` (Solana)                                           |
| **DB**          | `sqlite3` (memory persistence)                                                 |
| **MCP**         | `@modelcontextprotocol/sdk`                                                    |
| **File watch**  | `chokidar`                                                                     |
| **Diffing**     | `diff`                                                                         |
| **Validation**  | `zod`                                                                          |
| **Testing**     | `vitest`                                                                       |
| **Lint/Format** | ESLint 9 + Prettier                                                            |

---

## Contributing

Contributions are welcome. Here's how:

1. **Fork & clone** the repo
2. **Create a branch** — `feature/your-feature` or `fix/your-fix`
3. **Make changes** — Write clear, typed TypeScript. Run `npm run typecheck` and `npm run lint` before committing
4. **Add tests** — Tests live alongside source files or in dedicated `*.test.ts` files. Run `npm run test`
5. **Open a PR** — Include a clear description of the change and why

### Coding conventions

- **TypeScript strict mode** — All code must pass `tsc --noEmit` with zero errors
- **No dead code** — Unused imports/variables are caught by the compiler
- **Ink compound components** — Use `Object.assign(Root, { Sub1, Sub2 })` for composable UI
- **Theme tokens** — Never hardcode colors; use `useTheme().colors` or `theme.colors.*`
- **Surgical edits** — Use the `Edit` tool for targeted file changes, `Write` for new files
- **Keep it small** — PRs should be focused. Large refactors should be discussed first

### Areas to contribute

- **New tools** — Add integrations (databases, APIs, cloud services) in `src/tool/`
- **Web3** — Extend blockchain support in `src/tool/web3.ts`
- **Plugins** — Build plugin modules in `src/plugins/`
- **UI polish** — Improve the terminal UI in `src/components/ui/` and `src/app.tsx`
- **Provider support** — Add new LLM providers in `src/provider/`
- **Memory** — Enhance the agent's memory system in `src/memory/`
- **Docs & tests** — Always appreciated

---

## Support

If you find this project useful, consider sponsoring:

```
Solana: HdPcuMsYFn8JMJxgVXmBQWD5y7bBepSrT9z8c9b82CHK
```

---

## License

ISC
