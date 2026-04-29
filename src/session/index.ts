import { randomUUID } from "node:crypto";

export interface SessionMeta {
  id: string;
  createdAt: number;
  mode: string;
  model: string;
  messageCount: number;
  tokenUsage: { prompt: number; completion: number; total: number };
}

let _session: SessionMeta | null = null;

export function createSession(mode: string, model: string): SessionMeta {
  _session = {
    id: randomUUID(),
    createdAt: Date.now(),
    mode,
    model,
    messageCount: 0,
    tokenUsage: { prompt: 0, completion: 0, total: 0 },
  };
  return _session;
}

export function getSession(): SessionMeta | null {
  return _session;
}

export function updateSession(fields: Partial<SessionMeta>): SessionMeta | null {
  if (!_session) return null;
  Object.assign(_session, fields);
  return _session;
}

export function incrementMessageCount(delta = 1): void {
  if (_session) _session.messageCount += delta;
}

export function addTokenUsage(prompt: number, completion: number): void {
  if (_session) {
    _session.tokenUsage.prompt += prompt;
    _session.tokenUsage.completion += completion;
    _session.tokenUsage.total += prompt + completion;
  }
}
