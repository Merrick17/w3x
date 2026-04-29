import { useState, useCallback, useEffect, useMemo, useRef, memo } from "react";
import { Box, Text, Static, useApp } from "ink";
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
import { useInputRouter } from "@/components/ui/input-router";
import { useFocusManager } from "@/components/ui/focus-manager";
import { useLineEditor } from "@/hooks/use-line-editor";
import { formatKeybinding } from "@/config/keybindings";
import { dispatchCommand } from "@/command/dispatch";
import { AppShell } from "@/components/ui/app-shell";
import { ChatThread } from "@/components/ui/chat-thread";
import type { ToolCallEntry } from "./hooks/useAgent";
import type { ToolCallStatus } from "@/components/ui/tool-call";

type Overlay = "none" | "help" | "commandPalette" | "modelSelector" | "approval";

const SLASH_CMDS = [
  "/plan ",
  "/code ",
  "/edit ",
  "/refactor ",
  "/search ",
  "/review ",
  "/test ",
  "/commit ",
  "/config ",
  "/security-review ",
  "/mode ",
  "/model ",
  "/logs ",
  "/clear ",
  "/help",
  "/exit",
];
const fmtN = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
type ModelInfo = { id: string; provider: string; context?: number };
const toToolCallStatus = (status: ToolCallEntry["status"]): ToolCallStatus =>
  status === "done" ? "success" : status;
const SHOW_RENDER_STATS = process.env.W3X_RENDER_STATS === "1";

function normalizeAssistantMarkdown(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let inCodeFence = false;

  for (const raw of lines) {
    let line = raw;
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      out.push(inCodeFence ? "----- code -----" : "---------------");
      continue;
    }
    if (inCodeFence) {
      out.push(line);
      continue;
    }
    if (/^\|[-:\s|]+\|?$/.test(trimmed)) continue;
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      out.push(cells.join("  |  "));
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      line = trimmed.replace(/^#{1,6}\s+/, "").toUpperCase();
      out.push(line);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push("---------------");
      continue;
    }

    line = line
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)");
    out.push(line);
  }

  return out.join("\n");
}

const LiveClock = memo(function LiveClock() {
  const [clockTime, setClockTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Text dimColor>{clockTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
  );
});

const ThinkingSpinner = memo(function ThinkingSpinner() {
  const frame = useAnimation({ intervalMs: 80 });
  return <>{SPINNER[frame % SPINNER.length] ?? "⠋"}</>;
});

const MessageLines = memo(function MessageLines({
  content,
  color,
  showLiveCursor = false,
  blinkFrame = 0,
  cursorColor,
}: {
  content: string;
  color: string;
  showLiveCursor?: boolean;
  blinkFrame?: number;
  cursorColor?: string;
}) {
  const lines = useMemo(() => content.split("\n"), [content]);
  return (
    <Box flexDirection="column" width="100%">
      {lines.map((line, i) => (
        <Box key={i} width="100%">
          <Text color={color} wrap="truncate-end">
            {line || " "}
          </Text>
          {showLiveCursor && i === lines.length - 1 && (
            <Text color={cursorColor}>{blinkFrame % 2 === 0 ? "▌" : " "}</Text>
          )}
        </Box>
      ))}
    </Box>
  );
});

const HeaderBar = memo(function HeaderBar({
  t,
  mode,
  processing,
  state,
  modelName,
}: {
  t: ReturnType<typeof useTheme>["colors"];
  mode: AgentMode;
  processing: boolean;
  state: string;
  modelName: string;
}) {
  return (
    <Box
      borderStyle="round"
      borderColor={t.panelBorderActive}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box gap={1}>
        <Text color={t.primary} bold>
          W3X
        </Text>
        <Text color={t.mutedForeground}>|</Text>
        <Text color={mode === "plan" ? t.warning : t.success} bold>
          {mode.toUpperCase()}
        </Text>
      </Box>
      <Box gap={1}>
        <Text color={processing ? t.accent : state === "error" ? t.error : t.success}>
          {state.toUpperCase()}
        </Text>
      </Box>
      <Box>
        <Text color={t.mutedForeground}>{modelName}</Text>
      </Box>
    </Box>
  );
});

const InputPanel = memo(function InputPanel({
  t,
  overlay,
  mode,
  editorValue,
  editorCursor,
  showCursor,
  slashSuggestions,
}: {
  t: ReturnType<typeof useTheme>["colors"];
  overlay: Overlay;
  mode: AgentMode;
  editorValue: string;
  editorCursor: number;
  showCursor: boolean;
  slashSuggestions: string[];
}) {
  return (
    <Box flexDirection="column">
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
      <Box
        borderStyle="round"
        borderColor={overlay === "none" ? t.panelBorderActive : t.panelBorder}
        paddingX={1}
      >
        <Text color={overlay === "none" ? t.primary : t.mutedForeground} bold>
          {mode === "plan" ? "PLAN" : "RUN"}{" "}
        </Text>
        {editorValue.length === 0 ? (
          <Box>
            <Text dimColor>Ask anything or type / for commands...</Text>
            {showCursor && <Text color={t.primary}>▌</Text>}
          </Box>
        ) : (
          <Box>
            <Text>{editorValue.slice(0, editorCursor)}</Text>
            {showCursor && <Text color={t.primary}>▌</Text>}
            <Text>{editorValue.slice(editorCursor)}</Text>
          </Box>
        )}
      </Box>
      <Box justifyContent="space-between" paddingX={2}>
        <Text dimColor>
          {`${formatKeybinding("commandPalette")} Palette | ${formatKeybinding("toggleLogs")} Logs | ${formatKeybinding("modelSelector")} Model | ${formatKeybinding("showHelp")} Help | ${formatKeybinding("cancel")} Cancel | ${formatKeybinding("exit")} Exit`}
        </Text>
        <LiveClock />
      </Box>
    </Box>
  );
});

const SidebarPanel = memo(function SidebarPanel({
  t,
  logs,
  dims,
  tokens,
  contextLimit,
}: {
  t: ReturnType<typeof useTheme>["colors"];
  logs: Array<{ level: string; message: string; ts: Date }>;
  dims: { cols: number; rows: number };
  tokens: { prompt: number; completion: number; total: number };
  contextLimit: number;
}) {
  return (
    <Box width={40} marginLeft={1} flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={t.panelBorder}
        paddingX={1}
        height={dims.rows - 8}
      >
        <Text bold color={t.primary}>
          Logs
        </Text>
        <Box flexDirection="column" flexGrow={1}>
          {logs.slice(-20).map((l, i: number) => (
            <Box key={i} gap={1}>
              <Text color={t.mutedForeground}>
                {String(l.ts.getHours()).padStart(2, "0")}:
                {String(l.ts.getMinutes()).padStart(2, "0")}
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
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={t.panelBorder}
        paddingX={1}
        marginTop={1}
      >
        <Text bold color={t.primary}>
          Resources
        </Text>
        <TokenUsage prompt={tokens.prompt} completion={tokens.completion} showCost />
        <ContextMeter used={tokens.total} limit={contextLimit} width={30} showPercent />
      </Box>
    </Box>
  );
});

const RenderStats = memo(function RenderStats({ section }: { section: string }) {
  const renders = useRef(0);
  renders.current += 1;
  if (!SHOW_RENDER_STATS) return null;
  return <Text dimColor>{`${section}:${renders.current}`}</Text>;
});

function AppContent({ agent }: { agent: BuildAgent }) {
  const { exit } = useApp();
  const theme = useTheme();
  const t = theme.colors;

  const {
    messages,
    liveMessage,
    state,
    mode,
    processing,
    tokens,
    stepCount,
    logs,
    pendingApproval,
    submit,
    clearMessages,
    setMode,
    setModel,
    approve,
    reject,
    getModels,
    cancelActive,
  } = useAgent(agent);

  const editor = useLineEditor();
  const { activeFocus, enterOverlay, leaveOverlay } = useFocusManager();
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [showLogs, setShowLogs] = useState(true);
  const [historyLines, setHistoryLines] = useState(15);
  const [dims, setDims] = useState({ cols: 80, rows: 24 });

  // Blinking cursor — ~530 ms on/off cycle
  const blinkFrame = useAnimation({ intervalMs: 530 });
  const showCursor = overlay === "none" && activeFocus === "input" && blinkFrame % 2 === 0;

  // Terminal resize
  useEffect(() => {
    const h = () =>
      setDims({ cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 });
    h();
    process.stdout.on("resize", h);
    return () => {
      process.stdout.off("resize", h);
    };
  }, []);

  // Reset history to default when new turn starts
  const prevProcessing = useRef(false);
  useEffect(() => {
    if (processing && !prevProcessing.current) setHistoryLines(15);
    prevProcessing.current = processing;
  }, [processing]);

  // Approval auto-show (force-show even if another overlay is active)
  useEffect(() => {
    if (state === "awaiting-approval" && overlay !== "approval") {
      setOverlay("approval");
      enterOverlay();
    }
  }, [state, overlay, enterOverlay]);

  const close = useCallback(() => {
    setOverlay("none");
    leaveOverlay();
  }, [leaveOverlay]);
  const openOverlay = useCallback(
    (name: Overlay) => {
      setOverlay(name);
      if (name !== "none") enterOverlay();
    },
    [enterOverlay],
  );

  const doSubmit = useCallback(
    async (text: string) => {
      const tr = text.trim();
      if (!tr) return;
      editor.commitToHistory(tr);
      editor.clear();
      if (tr.startsWith("/")) {
        const [cmd, ...rest] = tr.split(/\s+/);
        const arg = rest.join(" ");
        const tok = cmd.toLowerCase();
        switch (tok) {
          case "/mode":
            if (arg === "plan" || arg === "build") setMode(arg as AgentMode);
            return;
          case "/model":
            if (arg) setModel(arg);
            return;
          case "/y":
            approve();
            close();
            return;
          case "/n":
            reject();
            close();
            return;
          case "/clear":
            clearMessages();
            return;
          case "/logs":
            setShowLogs((v) => !v);
            return;
          case "/help":
            openOverlay("help");
            return;
          case "/exit":
          case "/quit":
            agent.stop().then(() => exit());
            return;
        }
        const dispatched = await dispatchCommand(tr, agent);
        if (dispatched.handled) return;
      }
      await submit(tr);
    },
    [
      editor,
      submit,
      setMode,
      setModel,
      approve,
      reject,
      clearMessages,
      openOverlay,
      agent,
      exit,
      close,
    ],
  );

  const paletteCommands: Command[] = useMemo(
    () => [
      {
        id: "logs",
        label: "Toggle Logs",
        description: "Show/hide log panel",
        group: "View",
        onSelect: () => {
          setShowLogs((v) => !v);
          close();
        },
      },
      {
        id: "help",
        label: "Show Help",
        description: "Display help and shortcuts",
        group: "View",
        onSelect: () => {
          openOverlay("help");
          close();
        },
      },
      {
        id: "model",
        label: "Select Model",
        description: "Choose an LLM model",
        group: "Agent",
        onSelect: () => {
          openOverlay("modelSelector");
          close();
        },
      },
      {
        id: "plan",
        label: "Set Plan Mode",
        description: "Require approval for tools",
        group: "Agent",
        onSelect: () => {
          setMode("plan");
          close();
        },
      },
      {
        id: "build",
        label: "Set Build Mode",
        description: "Auto-approve tools",
        group: "Agent",
        onSelect: () => {
          setMode("build");
          close();
        },
      },
      {
        id: "clear",
        label: "Clear History",
        description: "Clear all messages",
        group: "Agent",
        onSelect: () => {
          clearMessages();
          close();
        },
      },
      {
        id: "exit",
        label: "Exit Agent",
        description: "Quit W3X",
        group: "System",
        shortcut: "Ctrl+X",
        onSelect: () => {
          agent.stop().then(() => exit());
        },
      },
    ],
    [close, setMode, clearMessages, openOverlay, agent, exit],
  );

  const modelOptions: ModelOption[] = useMemo(
    () =>
      getModels().map((m: { id: string; provider: string }) => ({
        id: m.id,
        name: m.id.split("/").pop() ?? m.id,
        provider: m.provider,
      })),
    [getModels],
  );

  // Slash-command inline suggestions shown above the input box
  const slashSuggestions = useMemo(() => {
    if (!editor.value.startsWith("/") || overlay !== "none") return [];
    return SLASH_CMDS.filter((c) => c.trimEnd().startsWith(editor.value)).slice(0, 6);
  }, [editor.value, overlay]);

  useInputRouter({
    isOverlayOpen: overlay !== "none",
    onOpenPalette: () => openOverlay("commandPalette"),
    onToggleLogs: () => setShowLogs((v) => !v),
    onOpenHelp: () => openOverlay("help"),
    onOpenModelSelector: () => openOverlay("modelSelector"),
    onCancel: () => {
      cancelActive().then((canceled) => {
        if (!canceled) agent.stop().then(() => exit());
      });
    },
    onExit: () => agent.stop().then(() => exit()),
    onScrollUp: () => {
      if (editor.value.length === 0) {
        setHistoryLines((h) => Math.min(h + 5, 200));
      } else {
        editor.historyUp();
      }
    },
    onScrollDown: () => {
      if (editor.value.length === 0) {
        setHistoryLines((h) => Math.max(5, h - 5));
      } else {
        editor.historyDown();
      }
    },
    onScrollPageUp: () => setHistoryLines((h) => Math.min(h + 25, 200)),
    onScrollPageDown: () => setHistoryLines((h) => Math.max(5, h - 25)),
    onSubmit: () => doSubmit(editor.value),
    onBackspace: editor.backspace,
    onSlashComplete: () => {
      if (editor.value.startsWith("/")) {
        const m = SLASH_CMDS.find((c) => c.startsWith(editor.value));
        if (m) editor.setText(m);
      }
    },
    onMoveCursorLeft: editor.moveLeft,
    onMoveCursorRight: editor.moveRight,
    onMoveCursorHome: editor.moveHome,
    onMoveCursorEnd: editor.moveEnd,
    onInsertText: editor.insert,
    onCloseOverlay: close,
  });

  const wide = showLogs && dims.cols >= 90;

  // Derive context window limit from active model
  const models = useMemo(() => getModels() as ModelInfo[], [getModels]);
  const activeModel = useMemo(() => models.find((m) => m.id === agent.getModel()), [models, agent]);
  const contextLimit = activeModel?.context ?? 128_000;

  const doneMsgs = messages;
  const live = liveMessage;

  const showThinking = processing && !live?.content && !live?.thinking;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <AppShell>
        <RenderStats section="app" />
        <HeaderBar
          t={t}
          mode={mode}
          processing={processing}
          state={state}
          modelName={agent.getModel().split("/").pop() ?? "?"}
        />
        <RenderStats section="header" />

        {/* ═══ BODY ═══ */}
        <Box flexDirection="row" flexGrow={1} marginTop={1} overflow="hidden">
          {/* Left: conversation */}
          <ChatThread maxHeight={dims.rows - 12}>
            {messages.length === 0 && !processing ? (
              /* ── Welcome screen ── */
              <Box flexDirection="column" flexGrow={1} alignItems="center" justifyContent="center">
                <Box
                  flexDirection="column"
                  alignItems="center"
                  borderStyle="round"
                  borderColor={t.border}
                  paddingX={4}
                  paddingY={1}
                >
                  <Text bold color={t.primary}>
                    W3X v2.1.0
                  </Text>
                  <Text color={t.secondary}>Autonomous Coding Agent</Text>
                  <Box marginTop={1} flexDirection="column">
                    <Box gap={1}>
                      <Text color={t.accent}>●</Text>
                      <Text color={t.mutedForeground}>Ask a question or describe a task</Text>
                    </Box>
                    <Box gap={1}>
                      <Text color={t.accent}>●</Text>
                      <Text color={t.mutedForeground}>Type</Text>
                      <Text color={t.primary}>/</Text>
                      <Text color={t.mutedForeground}> for slash commands</Text>
                    </Box>
                    <Box gap={1}>
                      <Text color={t.accent}>●</Text>
                      <Text color={t.mutedForeground}>Press</Text>
                      <Text color={t.primary}>Ctrl+K</Text>
                      <Text color={t.mutedForeground}> for command palette</Text>
                    </Box>
                  </Box>
                  <Box marginTop={1}>
                    <Text dimColor>{SLASH_CMDS.slice(0, 5).join("  ")}</Text>
                  </Box>
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
                          <Box flexDirection="column" width="100%">
                            {msg.content.split("\n").map((line: string, i: number) => (
                              <Text key={i} wrap="truncate-end">
                                {line || " "}
                              </Text>
                            ))}
                          </Box>
                        </ChatMessage>
                      ) : msg.role === "system" ? (
                        <Box paddingLeft={2}>
                          <Text color={t.warning}>{msg.content.slice(0, 200)}</Text>
                        </Box>
                      ) : (
                        <ChatMessage sender="assistant" name="W3X">
                          <Box flexDirection="column" width="100%">
                            {msg.thinking && (
                              <Box marginBottom={msg.content ? 1 : 0}>
                                <ThinkingBlock
                                  content={msg.thinking}
                                  label="Reasoning"
                                  defaultCollapsed={false}
                                />
                              </Box>
                            )}
                            {msg.content && (
                              <MessageLines
                                content={normalizeAssistantMarkdown(msg.content)}
                                color={t.foreground}
                              />
                            )}
                            {msg.toolCalls.map((tc: ToolCallEntry, i: number) => (
                              <ToolCall
                                key={`${msg.id}-${i}`}
                                name={tc.name}
                                status={toToolCallStatus(tc.status)}
                                args={tc.args}
                                result={tc.output}
                                duration={tc.duration}
                              />
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
                      <Text color={t.accent} bold>
                        W3X
                      </Text>
                    </Box>
                    {live.thinking && (
                      <Box paddingLeft={2} marginBottom={live.content ? 1 : 0}>
                        <ThinkingBlock
                          content={live.thinking}
                          label="Reasoning"
                          defaultCollapsed={false}
                          streaming={processing && !live.content}
                          focused
                        />
                      </Box>
                    )}
                    {live.content && (
                      <Box paddingLeft={2} flexDirection="column">
                        <MessageLines
                          content={normalizeAssistantMarkdown(live.content)}
                          color={t.foreground}
                          showLiveCursor={processing}
                          blinkFrame={blinkFrame}
                          cursorColor={t.accent}
                        />
                      </Box>
                    )}
                    {live.toolCalls.map((tc: ToolCallEntry, i: number) => (
                      <ToolCall
                        key={`l-${i}`}
                        name={tc.name}
                        status={toToolCallStatus(tc.status)}
                        args={tc.args}
                        result={tc.output}
                        duration={tc.duration}
                        focused
                      />
                    ))}
                  </Box>
                )}

                {/* Thinking indicator — shown immediately when agent starts reasoning */}
                {showThinking && (
                  <Box paddingLeft={2} marginBottom={1}>
                    <Text color={t.accent}>
                      <ThinkingSpinner />
                    </Text>
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
                    <Text dimColor>
                      ↑↓ scroll · showing last {Math.min(historyLines, doneMsgs.length)} msgs
                    </Text>
                  </Box>
                )}
              </>
            )}
          </ChatThread>

          {/* Right: sidebar */}
          {wide && (
            <SidebarPanel
              t={t}
              logs={logs}
              dims={dims}
              tokens={tokens}
              contextLimit={contextLimit}
            />
          )}
        </Box>
      </AppShell>

      <InputPanel
        t={t}
        overlay={overlay}
        mode={mode}
        editorValue={editor.value}
        editorCursor={editor.cursor}
        showCursor={showCursor}
        slashSuggestions={slashSuggestions}
      />
      <RenderStats section="input" />

      {/* ═══ OVERLAYS — conditionally mounted so internal state resets each open ═══ */}
      {overlay === "commandPalette" && (
        <CommandPalette
          commands={paletteCommands}
          isOpen={true}
          isActive={overlay === "commandPalette"}
          onClose={close}
        />
      )}

      {overlay === "modelSelector" && (
        <ModelSelector
          models={modelOptions}
          selected={agent.getModel()}
          isActive={overlay === "modelSelector"}
          onSelect={(id) => {
            setModel(id);
            close();
          }}
        />
      )}

      {overlay === "approval" && (
        <ToolApproval
          name={pendingApproval?.description ?? "unknown"}
          isActive={overlay === "approval"}
          onApprove={() => {
            approve();
            close();
          }}
          onDeny={() => {
            reject();
            close();
          }}
        />
      )}
      {overlay === "help" && (
        <Box borderStyle="round" borderColor={t.primary} paddingX={1} flexDirection="column">
          <Text bold color={t.primary}>
            Keyboard Shortcuts
          </Text>
          <Text
            color={t.mutedForeground}
          >{`${formatKeybinding("commandPalette")} command palette`}</Text>
          <Text
            color={t.mutedForeground}
          >{`${formatKeybinding("modelSelector")} model selector`}</Text>
          <Text
            color={t.mutedForeground}
          >{`${formatKeybinding("toggleLogs")} toggle logs sidebar`}</Text>
          <Text
            color={t.mutedForeground}
          >{`${formatKeybinding("cancel")} cancel active run or exit when idle`}</Text>
          <Text color={t.mutedForeground}>{`${formatKeybinding("exit")} exit immediately`}</Text>
          <Text dimColor>Esc closes this overlay</Text>
        </Box>
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
