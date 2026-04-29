import { useState, useRef, useCallback, useEffect } from "react";
import type { BuildAgent } from "../agent/build";
import type { AgentState, AgentMode, CLIEvent } from "../types";

type StepStartEvent = Extract<CLIEvent, { type: "step-start" }>;

export interface ToolCallEntry {
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "done" | "error";
  output?: string;
  duration?: number;
  startTime?: number;
}

export interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  toolCalls: ToolCallEntry[];
  duration?: number;
}

export interface PendingApproval {
  description: string;
}

interface LiveMessage {
  id: number;
  role: "assistant";
  content: string;
  thinking?: string;
  toolCalls: ToolCallEntry[];
}

export function useAgent(agent: BuildAgent) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<AgentState>("idle");
  const [mode, setModeState] = useState<AgentMode>("build");
  const [processing, setProcessing] = useState(false);
  const [tokens, setTokens] = useState({ prompt: 0, completion: 0, total: 0 });
  const [stepCount, setStepCount] = useState(0);
  const [logs, setLogs] = useState<Array<{ level: string; message: string; ts: Date }>>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [liveMessage, setLiveMessage] = useState<LiveMessage | null>(null);
  const idRef = useRef(0);
  const activeAidRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const currentIteratorRef = useRef<AsyncGenerator<CLIEvent> | null>(null);
  const pendingTextRef = useRef("");
  const pendingThinkingRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const handler = (event: CLIEvent) => {
      if (event.type === "state-change") {
        setState(event.state);
        setProcessing(["reasoning", "executing", "awaiting-approval", "planning"].includes(event.state));
      } else if (event.type === "mode-change") {
        setModeState(event.mode);
      } else if (event.type === "usage") {
        setTokens({ prompt: event.promptTokens, completion: event.completionTokens, total: event.totalTokens });
      } else if (event.type === "log") {
        setLogs((prev) => [...prev.slice(-200), { level: event.level, message: event.message, ts: new Date() }]);
      }
    };
    agent.on("event", handler);
    return () => { agent.off("event", handler); };
  }, [agent]);

  useEffect(() => () => {
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
  }, []);

  const updateLiveAssistant = useCallback((updater: (m: LiveMessage) => LiveMessage) => {
    setLiveMessage((prev) => (prev ? updater(prev) : prev));
  }, []);

  const flushPending = useCallback(() => {
    const text = pendingTextRef.current;
    const thinking = pendingThinkingRef.current;
    if (!text && !thinking) return;
    pendingTextRef.current = "";
    pendingThinkingRef.current = "";
    updateLiveAssistant((m) => ({
      ...m,
      content: text ? m.content + text : m.content,
      thinking: thinking ? (m.thinking ?? "") + thinking : m.thinking,
    }));
  }, [updateLiveAssistant]);

  const submit = useCallback(async (text: string) => {
    const runId = ++runIdRef.current;
    const uid = ++idRef.current;
    const aid = ++idRef.current;
    activeAidRef.current = aid;
    const start = Date.now();

    setMessages((prev) => [...prev, { id: uid, role: "user", content: text, toolCalls: [] }]);
    setLiveMessage({ id: aid, role: "assistant", content: "", toolCalls: [] });
    setProcessing(true);
    setStepCount(0);
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    flushTimerRef.current = setInterval(() => flushPending(), 33);

    try {
      const iterator = agent.processUserInput(text);
      currentIteratorRef.current = iterator;
      for await (const event of iterator) {
        if (runId !== runIdRef.current) break;
        switch (event.type) {
          case "text":
            pendingTextRef.current += event.content;
            break;
          case "thinking":
            pendingThinkingRef.current += event.content;
            break;
          case "step-start": {
            flushPending();
            setStepCount((s) => s + 1);
            const stepArgs = (event as StepStartEvent).args ?? {};
            updateLiveAssistant((m) => ({
              ...m,
              toolCalls: [...m.toolCalls, { name: event.toolName, status: "running", args: stepArgs, startTime: Date.now() }],
            }));
            break;
          }
          case "step-end":
            flushPending();
            updateLiveAssistant((m) => {
              const tcs = [...m.toolCalls];
              const idx = tcs.findLastIndex((t) => t.status === "running");
              if (idx >= 0) {
                const toolStart = tcs[idx].startTime ?? Date.now();
                tcs[idx] = {
                  ...tcs[idx],
                  status: event.success ? "done" : "error",
                  output: (event.output ?? "").slice(0, 500),
                  duration: Date.now() - toolStart,
                };
              }
              return { ...m, toolCalls: tcs };
            });
            break;
          case "error":
            flushPending();
            updateLiveAssistant((m) => ({ ...m, content: m.content + "\n[ERROR] " + event.message }));
            break;
          case "awaiting-approval":
            setPendingApproval({ description: event.description });
            break;
          case "done":
            flushPending();
            updateLiveAssistant((m) => (!m.content ? { ...m, content: event.summary || "Done." } : m));
            break;
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      flushPending();
      setLogs((prev) => [...prev.slice(-200), { level: "error", message: errMsg.split("\n")[0], ts: new Date() }]);
      updateLiveAssistant((m) => ({ ...m, content: m.content + "\n[FATAL] " + errMsg.split("\n")[0] }));
    } finally {
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushPending();
      currentIteratorRef.current = null;
      setProcessing(false);
      const duration = Date.now() - start;
      setLiveMessage((current) => {
        if (current) {
          setMessages((prev) => [...prev, { ...current, duration }]);
        }
        return null;
      });
      activeAidRef.current = null;
    }
  }, [agent, flushPending, updateLiveAssistant]);

  const clearMessages = useCallback(() => { setMessages([]); setLiveMessage(null); activeAidRef.current = null; idRef.current = 0; }, []);
  const setMode = useCallback((m: AgentMode) => { agent.setMode(m); setModeState(m); }, [agent]);
  const setModel = useCallback((m: string) => { agent.setModel(m); }, [agent]);
  const approve = useCallback(() => { agent.onApprovalDecision("approve"); setPendingApproval(null); }, [agent]);
  const reject = useCallback(() => { agent.onApprovalDecision("reject"); setPendingApproval(null); }, [agent]);
  const getModels = useCallback(() => agent.getAvailableModels(), [agent]);
  const cancelActive = useCallback(async () => {
    if (!processing) return false;
    runIdRef.current += 1;
    agent.cancelCurrentRun();
    agent.onApprovalDecision("reject");
    const iterator = currentIteratorRef.current;
    if (iterator) {
      try {
        await iterator.return?.(undefined);
      } catch {
        // best-effort cancellation
      }
    }
    setPendingApproval(null);
    setProcessing(false);
    setState("monitoring");
    setLiveMessage(null);
    setLogs((prev) => [...prev.slice(-200), { level: "warn", message: "Canceled active run", ts: new Date() }]);
    return true;
  }, [agent, processing]);

  return {
    messages, liveMessage, state, mode, processing, tokens, stepCount, logs, pendingApproval,
    submit, clearMessages, setMode, setModel, approve, reject, getModels, cancelActive,
  };
}
