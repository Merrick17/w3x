import { useState, useRef, useCallback, useEffect } from "react";
import type { BuildAgent } from "../agent/build";
import type { AgentState, AgentMode, CLIEvent } from "../types";

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

export function useAgent(agent: BuildAgent) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<AgentState>("idle");
  const [mode, setModeState] = useState<AgentMode>("build");
  const [processing, setProcessing] = useState(false);
  const [tokens, setTokens] = useState({ prompt: 0, completion: 0, total: 0 });
  const [stepCount, setStepCount] = useState(0);
  const [logs, setLogs] = useState<Array<{ level: string; message: string; ts: Date }>>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const idRef = useRef(0);
  const activeAidRef = useRef<number | null>(null);

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

  const submit = useCallback(async (text: string) => {
    const uid = ++idRef.current;
    const aid = ++idRef.current;
    activeAidRef.current = aid;
    const start = Date.now();

    setMessages((prev) => [
      ...prev,
      { id: uid, role: "user", content: text, toolCalls: [] },
      { id: aid, role: "assistant", content: "", toolCalls: [] },
    ]);
    setProcessing(true);
    setStepCount(0);

    try {
      for await (const event of agent.processUserInput(text)) {
        const aidCurrent = activeAidRef.current;
        switch (event.type) {
          case "text":
            setMessages((prev) =>
              prev.map((m) => (m.id === aidCurrent ? { ...m, content: m.content + event.content } : m)),
            );
            break;
          case "thinking":
            setMessages((prev) =>
              prev.map((m) => (m.id === aidCurrent ? { ...m, thinking: (m.thinking ?? "") + event.content } : m)),
            );
            break;
          case "step-start": {
            setStepCount((s) => s + 1);
            const stepArgs = (event as any).args ?? {};
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aidCurrent
                  ? { ...m, toolCalls: [...m.toolCalls, { name: event.toolName, status: "running", args: stepArgs, startTime: Date.now() }] }
                  : m,
              ),
            );
            break;
          }
          case "step-end":
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== aidCurrent) return m;
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
              }),
            );
            break;
          case "error":
            setMessages((prev) =>
              prev.map((m) => (m.id === aidCurrent ? { ...m, content: m.content + "\n[ERROR] " + event.message } : m)),
            );
            break;
          case "awaiting-approval":
            setPendingApproval({ description: event.description });
            break;
          case "done":
            setMessages((prev) =>
              prev.map((m) => (m.id === aidCurrent && !m.content ? { ...m, content: event.summary || "Done." } : m)),
            );
            break;
        }
      }
    } catch (err: any) {
      const aidCurrent = activeAidRef.current;
      setLogs((prev) => [...prev.slice(-200), { level: "error", message: (err?.message ?? String(err)).split("\n")[0], ts: new Date() }]);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aidCurrent
            ? { ...m, content: m.content + "\n[FATAL] " + (err?.message ?? String(err)).split("\n")[0] }
            : m,
        ),
      );
    } finally {
      setProcessing(false);
      const aidCurrent = activeAidRef.current;
      setMessages((prev) => prev.map((m) => (m.id === aidCurrent ? { ...m, duration: Date.now() - start } : m)));
      activeAidRef.current = null;
    }
  }, [agent]);

  const clearMessages = useCallback(() => { setMessages([]); activeAidRef.current = null; idRef.current = 0; }, []);
  const setMode = useCallback((m: AgentMode) => { agent.setMode(m); setModeState(m); }, [agent]);
  const setModel = useCallback((m: string) => { agent.setModel(m); }, [agent]);
  const approve = useCallback(() => { agent.onApprovalDecision("approve"); setPendingApproval(null); }, [agent]);
  const reject = useCallback(() => { agent.onApprovalDecision("reject"); setPendingApproval(null); }, [agent]);
  const getModels = useCallback(() => agent.getAvailableModels(), [agent]);

  return {
    messages, state, mode, processing, tokens, stepCount, logs, pendingApproval,
    submit, clearMessages, setMode, setModel, approve, reject, getModels,
  };
}
