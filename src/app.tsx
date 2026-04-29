import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Box, Text, Static, useInput, useApp } from "ink";
import type { BuildAgent } from "./agent/build";
import type { AgentMode } from "./types";
import { useAgent } from "./hooks/useAgent";
import { ThemeProvider, useTheme } from "@/components/ui/theme-provider";
import { ThinkingBlock } from "@/components/ui/thinking-block";
import { ToolCall } from "@/components/ui/tool-call";
import { TokenUsage, ContextMeter } from "@/components/ui/token-usage";
import { CommandPalette, type Command } from "@/components/ui/command-palette";
import { ToolApproval } from "@/components/ui/tool-approval";
import { ModelSelector, type ModelOption } from "@/components/ui/model-selector";
import { ChatMessage } from "@/components/ui/chat-message";
import { oneDarkTheme } from "@/lib/terminal-themes/one-dark";
import { useAnimation } from "@/hooks/use-animation";

type Overlay = "none" | "help" | "commandPalette" | "modelSelector" | "approval";

const SLASH_CMDS = [
  "/plan ", "/code ", "/edit ", "/refactor ", "/search ", "/review ",
  "/test ", "/commit ", "/config ", "/security-review ",
  "/mode ", "/model ", "/logs ", "/clear ", "/help", "/exit",
];
const fmtN = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

// Spinner characters for the "Thinking" animation
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function AppContent({ agent }: { agent: BuildAgent }) {
  const { exit } = useApp();
  const theme = useTheme();
  const t = theme.colors;

  const {
    messages, state, mode, processing, tokens, stepCount, logs,
    pendingApproval, submit, clearMessages, setMode, setModel,
    approve, reject, getModels,
  } = useAgent(agent);

  const [input, setInput] = useState("");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [showLogs, setShowLogs] = useState(true);
  const [historyLines, setHistoryLines] = useState(15);
  const [dims, setDims] = useState({ cols: 80, rows: 24 });
  const [clockTime, setClockTime] = useState(() => new Date());

  // Blinking cursor — ~530 ms on/off cycle
  const blinkFrame = useAnimation({ intervalMs: 530 });
  const showCursor = overlay === "none" && blinkFrame % 2 === 0;

  // Spinner frame for the Thinking animation
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const spinnerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (processing) {
      spinnerRef.current = setInterval(() => setSpinnerFrame(f => (f + 1) % SPINNER.length), 80);
    } else {
      if (spinnerRef.current) clearInterval(spinnerRef.current);
      setSpinnerFrame(0);
    }
    return () => { if (spinnerRef.current) clearInterval(spinnerRef.current); };
  }, [processing]);

  // Live footer clock
  useEffect(() => {
    const id = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Terminal resize
  useEffect(() => {
    const h = () => setDims({ cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 });
    h();
    process.stdout.on("resize", h);
    return () => { process.stdout.off("resize", h); };
  }, []);

  // Reset history to default when new turn starts
  const prevProcessing = useRef(false);
  useEffect(() => {
    if (processing && !prevProcessing.current) setHistoryLines(15);
    prevProcessing.current = processing;
  }, [processing]);

  // Approval auto-show (force-show even if another overlay is active)
  useEffect(() => {
    if (state === "awaiting-approval" && overlay !== "approval") setOverlay("approval");
  }, [state, overlay]);

  const close = useCallback(() => setOverlay("none"), []);

  const doSubmit = useCallback(async (text: string) => {
    const tr = text.trim();
    if (!tr) return;
    setInput("");
    if (tr.startsWith("/")) {
      const [cmd, ...rest] = tr.split(/\s+/);
      const arg = rest.join(" ");
      const tok = cmd.toLowerCase();
      switch (tok) {
        case "/mode": if (arg === "plan" || arg === "build") setMode(arg as AgentMode); return;
        case "/model": if (arg) setModel(arg); return;
        case "/y": approve(); close(); return;
        case "/n": reject(); close(); return;
        case "/clear": clearMessages(); return;
        case "/logs": setShowLogs(v => !v); return;
        case "/help": setOverlay("help"); return;
        case "/exit": case "/quit": agent.stop().then(() => exit()); return;
      }
    }
    await submit(tr);
  }, [submit, setMode, setModel, approve, reject, clearMessages, agent, exit, close]);

  const paletteCommands: Command[] = useMemo(() => [
    { id: "logs", label: "Toggle Logs", description: "Show/hide log panel", group: "View", onSelect: () => { setShowLogs(v => !v); close(); } },
    { id: "help", label: "Show Help", description: "Display help and shortcuts", group: "View", onSelect: () => { setOverlay("help"); close(); } },
    { id: "model", label: "Select Model", description: "Choose an LLM model", group: "Agent", onSelect: () => { setOverlay("modelSelector"); close(); } },
    { id: "plan", label: "Set Plan Mode", description: "Require approval for tools", group: "Agent", onSelect: () => { setMode("plan"); close(); } },
    { id: "build", label: "Set Build Mode", description: "Auto-approve tools", group: "Agent", onSelect: () => { setMode("build"); close(); } },
    { id: "clear", label: "Clear History", description: "Clear all messages", group: "Agent", onSelect: () => { clearMessages(); close(); } },
    { id: "exit", label: "Exit Agent", description: "Quit W3X", group: "System", shortcut: "Ctrl+X", onSelect: () => { agent.stop().then(() => exit()); } },
  ], [close, setMode, clearMessages, agent, exit]);

  const modelOptions: ModelOption[] = useMemo(() => getModels().map((m: { id: string; provider: string }) => ({
    id: m.id,
    name: m.id.split("/").pop() ?? m.id,
    provider: m.provider,
  })), [getModels]);

  // Slash-command inline suggestions shown above the input box
  const slashSuggestions = useMemo(() => {
    if (!input.startsWith("/") || overlay !== "none") return [];
    return SLASH_CMDS.filter(c => c.trimEnd().startsWith(input)).slice(0, 6);
  }, [input, overlay]);

  // ── Central input handler: global shortcuts, overlays, scroll ──
  useInput((ch, key) => {
    if (overlay === "commandPalette" || overlay === "modelSelector" || overlay === "approval") {
      if (key.escape) close();
      return;
    }
    if (overlay === "help") { if (key.return || key.escape) close(); return; }

    // overlay === "none"
    if (key.escape) return;
    if (key.ctrl && ch === "k") { setOverlay("commandPalette"); return; }
    if (key.ctrl && ch === "l") { setShowLogs(v => !v); return; }
    if (key.ctrl && ch === "h") { setOverlay("help"); return; }
    if (key.ctrl && ch === "m") { setOverlay("modelSelector"); return; }
    if (key.ctrl && (ch === "x" || ch === "c")) { agent.stop().then(() => exit()); return; }
    if (key.tab && input.startsWith("/")) { const m = SLASH_CMDS.find(c => c.startsWith(input)); if (m) { setInput(m); } return; }
    // Enter: delegate to AppShell.Input onSubmit → doSubmit
    if (key.upArrow) { setHistoryLines(h => Math.min(h + 5, 200)); return; }
    if (key.downArrow) { setHistoryLines(h => Math.max(5, h - 5)); return; }
    if (key.pageUp) { setHistoryLines(h => Math.min(h + 25, 200)); return; }
    if (key.pageDown) { setHistoryLines(h => Math.max(5, h - 25)); return; }
    // Character / backspace handled manually below for snappy input
    if (key.return) { doSubmit(input); return; }
    if (key.backspace || key.delete) { setInput(v => v.slice(0, -1)); return; }
    if (key.ctrl || key.meta) return;
    if (ch) setInput(v => v + ch);
  });

  const wide = showLogs && dims.cols >= 90;

  // Derive context window limit from active model
  const models = useMemo(() => getModels(), [getModels]);
  const activeModel = useMemo(() => models.find((m: any) => m.id === agent.getModel()), [models, agent]);
  const contextLimit = (activeModel as any)?.context ?? 128_000;

  // ── Split completed / live messages ──
  const lastIdx = messages.length - 1;
  const lastMsg = messages[lastIdx];
  const isLive = processing && lastMsg?.role === "assistant";
  const doneMsgs = isLive ? messages.slice(0, -1) : messages;
  const live = isLive ? (lastMsg ?? null) : null;

  const spinnerChar = SPINNER[spinnerFrame % SPINNER.length] ?? "⠋";
  const showThinking = processing && !live?.content && !live?.thinking;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* ═══ HEADER ═══ */}
      <Box borderStyle="round" borderColor={t.border} paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          <Text color={t.primary} bold>W3X</Text>
          <Text color={t.mutedForeground}>|</Text>
          <Text color={mode === "plan" ? t.warning : t.success} bold>{mode.toUpperCase()}</Text>
        </Box>
        <Box gap={1}>
          <Text color={processing ? t.accent : state === "error" ? t.error : t.success}>
            {state.toUpperCase()}
          </Text>
        </Box>
        <Box>
          <Text color={t.mutedForeground}>{agent.getModel().split("/").pop() ?? "?"}</Text>
        </Box>
      </Box>

      {/* ═══ BODY ═══ */}
      <Box flexDirection="row" flexGrow={1} marginTop={1}>
        {/* Left: conversation */}
        <Box flexDirection="column" flexGrow={1}>
          {messages.length === 0 && !processing ? (
            /* ── Welcome screen ── */
            <Box flexDirection="column" flexGrow={1} alignItems="center" justifyContent="center">
              <Box flexDirection="column" alignItems="center" borderStyle="round" borderColor={t.border} paddingX={4} paddingY={1}>
                <Text bold color={t.primary}>W3X v2.1.0</Text>
                <Text color={t.secondary}>Autonomous Coding Agent</Text>
                <Box marginTop={1} flexDirection="column">
                  <Box gap={1}><Text color={t.accent}>●</Text><Text color={t.mutedForeground}>Ask a question or describe a task</Text></Box>
                  <Box gap={1}><Text color={t.accent}>●</Text><Text color={t.mutedForeground}>Type</Text><Text color={t.primary}>/</Text><Text color={t.mutedForeground}> for slash commands</Text></Box>
                  <Box gap={1}><Text color={t.accent}>●</Text><Text color={t.mutedForeground}>Press</Text><Text color={t.primary}>Ctrl+K</Text><Text color={t.mutedForeground}> for command palette</Text></Box>
                </Box>
                <Box marginTop={1}><Text dimColor>{SLASH_CMDS.slice(0, 5).join("  ")}</Text></Box>
              </Box>
            </Box>
          ) : (
            <>
              {/* Completed messages — frozen in Static for performance */}
              <Static items={doneMsgs.slice(-historyLines)}>
                {(msg) => (
                  <Box key={msg.id} flexDirection="column" marginBottom={1}>
                    {msg.role === "user" ? (
                      <ChatMessage sender="user" name="YOU">
                        <Box flexDirection="column">
                          {msg.content.split("\n").map((line: string, i: number) => (
                            <Text key={i}>{line || " "}</Text>
                          ))}
                        </Box>
                      </ChatMessage>
                    ) : msg.role === "system" ? (
                      <Box paddingLeft={2}><Text color={t.warning}>{msg.content.slice(0, 200)}</Text></Box>
                    ) : (
                      <ChatMessage sender="assistant" name="W3X">
                        <Box flexDirection="column">
                          {msg.thinking && (
                            <Box marginBottom={msg.content ? 1 : 0}>
                              <ThinkingBlock content={msg.thinking} label="Reasoning" defaultCollapsed={false} />
                            </Box>
                          )}
                          {msg.content && (
                            <Box flexDirection="column">
                              {msg.content.split("\n").map((line: string, i: number) => (
                                <Text key={i} color={t.foreground}>{line || " "}</Text>
                              ))}
                            </Box>
                          )}
                          {msg.toolCalls.map((tc: any, i: number) => (
                            <ToolCall key={`${msg.id}-${i}`} name={tc.name} status={tc.status} args={tc.args} result={tc.output} duration={tc.duration} />
                          ))}
                        </Box>
                      </ChatMessage>
                    )}
                  </Box>
                )}
              </Static>

              {/* Live streaming message — rendered by React for real-time updates */}
              {live && (
                <Box flexDirection="column" marginBottom={1}>
                  <Box gap={1}>
                    <Text color={t.accent} bold>W3X</Text>
                  </Box>
                  {live.thinking && (
                    <Box paddingLeft={2} marginBottom={live.content ? 1 : 0}>
                      <ThinkingBlock content={live.thinking} label="Reasoning" defaultCollapsed={false} streaming={processing && !live.content} focused />
                    </Box>
                  )}
                  {live.content && (
                    <Box paddingLeft={2} flexDirection="column">
                      {live.content.split("\n").map((line: string, i: number, arr: string[]) => (
                        <Box key={i}>
                          <Text color={t.foreground}>{line || " "}</Text>
                          {i === arr.length - 1 && processing && (
                            <Text color={t.accent}>{blinkFrame % 2 === 0 ? "▌" : " "}</Text>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                  {live.toolCalls.map((tc: any, i: number) => (
                    <ToolCall key={`l-${i}`} name={tc.name} status={tc.status} args={tc.args} result={tc.output} duration={tc.duration} focused />
                  ))}
                </Box>
              )}

              {/* Thinking indicator — shown immediately when agent starts reasoning */}
              {showThinking && (
                <Box paddingLeft={2} marginBottom={1}>
                  <Text color={t.accent}>{spinnerChar}</Text>
                  <Text color={t.accent}> Thinking</Text>
                  <Text color={t.mutedForeground}>...</Text>
                </Box>
              )}

              {/* Status bar while processing */}
              {processing && (
                <Box gap={1} paddingX={1}>
                  <Text color={t.accent}>{state.toUpperCase()}</Text>
                  <Text color={t.mutedForeground}>Step {stepCount}</Text>
                  <Text color={t.mutedForeground}>Tok {fmtN(tokens.total)}</Text>
                </Box>
              )}

              {/* Scroll indicator when idle with messages */}
              {!processing && messages.length > 0 && (
                <Box paddingX={1}>
                  <Text dimColor>↑↓ scroll · showing last {Math.min(historyLines, doneMsgs.length)} msgs</Text>
                </Box>
              )}
            </>
          )}
        </Box>

        {/* Right: sidebar */}
        {wide && (
          <Box width={40} marginLeft={1} flexDirection="column">
            <Box flexDirection="column" borderStyle="round" borderColor={t.border} paddingX={1} height={dims.rows - 8}>
              <Text bold color={t.primary}>Logs</Text>
              <Box flexDirection="column" flexGrow={1}>
                {logs.slice(-20).map((l: any, i: number) => (
                  <Box key={i} gap={1}>
                    <Text color={t.mutedForeground}>
                      {String(l.ts.getHours()).padStart(2, "0")}:{String(l.ts.getMinutes()).padStart(2, "0")}
                    </Text>
                    <Text color={l.level === "error" ? t.error : l.level === "warn" ? t.warning : t.info}>
                      {l.level.toUpperCase().padEnd(4)}
                    </Text>
                    <Text color={l.level === "error" ? t.error : t.foreground}>
                      {l.message.slice(0, Math.max(20, dims.cols - 23))}
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
            <Box flexDirection="column" borderStyle="round" borderColor={t.border} paddingX={1} marginTop={1}>
              <Text bold color={t.primary}>Resources</Text>
              <TokenUsage prompt={tokens.prompt} completion={tokens.completion} showCost />
              <ContextMeter used={tokens.total} limit={contextLimit} width={30} showPercent />
            </Box>
          </Box>
        )}
      </Box>

      {/* ═══ INPUT ═══ */}
      <Box flexDirection="column">
        {/* Slash command suggestions — shown inline above input */}
        {slashSuggestions.length > 0 && (
          <Box paddingX={2} gap={2}>
            {slashSuggestions.map((s, i) => (
              <Text key={s} color={i === 0 ? t.primary : t.mutedForeground} bold={i === 0}>
                {s.trim()}
              </Text>
            ))}
            <Text dimColor>Tab↹</Text>
          </Box>
        )}
        <Box borderStyle="round" borderColor={overlay === "none" ? t.primary : t.mutedForeground} paddingX={1}>
          <Text color={overlay === "none" ? t.primary : t.mutedForeground} bold>
            {mode === "plan" ? "PLAN" : "RUN"}{" "}
          </Text>
          {input.length === 0 ? (
            <Box>
              <Text dimColor>Ask anything or type / for commands...</Text>
              {showCursor && <Text color={t.primary}>▌</Text>}
            </Box>
          ) : (
            <Box>
              <Text>{input}</Text>
              {showCursor && <Text color={t.primary}>▌</Text>}
            </Box>
          )}
        </Box>
        <Box justifyContent="space-between" paddingX={2}>
          <Text dimColor>Ctrl+K Palette | Ctrl+L Logs | Ctrl+M Model | Ctrl+H Help | Ctrl+X Exit</Text>
          <Text dimColor>{clockTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
        </Box>
      </Box>

      {/* ═══ OVERLAYS — conditionally mounted so internal state resets each open ═══ */}
      {overlay === "commandPalette" && (
        <CommandPalette commands={paletteCommands} isOpen={true} onClose={close} />
      )}

      {overlay === "modelSelector" && (
        <ModelSelector
          models={modelOptions}
          selected={agent.getModel()}
          onSelect={(id) => { setModel(id); close(); }}
        />
      )}

      {overlay === "approval" && (
        <ToolApproval
          name={pendingApproval?.description ?? "unknown"}
          onApprove={() => { approve(); close(); }}
          onDeny={() => { reject(); close(); }}
        />
      )}
    </Box>
  );
}

export function App({ agent }: { agent: BuildAgent }) {
  return (
    <ThemeProvider theme={oneDarkTheme}>
      <AppContent agent={agent} />
    </ThemeProvider>
  );
}
