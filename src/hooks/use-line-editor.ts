import { useCallback, useMemo, useState } from "react";

function isWordChar(ch: string): boolean {
  return /[a-zA-Z0-9_]/.test(ch);
}

export function useLineEditor() {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const setText = useCallback((text: string) => {
    setValue(text);
    setCursor(text.length);
  }, []);

  const clear = useCallback(() => {
    setValue("");
    setCursor(0);
    setHistoryIndex(-1);
  }, []);

  const insert = useCallback(
    (text: string) => {
      setValue((prev) => prev.slice(0, cursor) + text + prev.slice(cursor));
      setCursor((c) => c + text.length);
    },
    [cursor],
  );

  const backspace = useCallback(() => {
    if (cursor === 0) return;
    setValue((prev) => prev.slice(0, cursor - 1) + prev.slice(cursor));
    setCursor((c) => Math.max(0, c - 1));
  }, [cursor]);

  const moveLeft = useCallback(() => setCursor((c) => Math.max(0, c - 1)), []);
  const moveRight = useCallback(
    () => setCursor((c) => Math.min(value.length, c + 1)),
    [value.length],
  );
  const moveHome = useCallback(() => setCursor(0), []);
  const moveEnd = useCallback(() => setCursor(value.length), [value.length]);

  const moveWordLeft = useCallback(() => {
    let i = cursor - 1;
    while (i >= 0 && !isWordChar(value[i] ?? "")) i -= 1;
    while (i >= 0 && isWordChar(value[i] ?? "")) i -= 1;
    setCursor(i + 1);
  }, [cursor, value]);

  const moveWordRight = useCallback(() => {
    let i = cursor;
    while (i < value.length && !isWordChar(value[i] ?? "")) i += 1;
    while (i < value.length && isWordChar(value[i] ?? "")) i += 1;
    setCursor(i);
  }, [cursor, value]);

  const commitToHistory = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setHistory((prev) => (prev.at(-1) === trimmed ? prev : [...prev, trimmed].slice(-200)));
    setHistoryIndex(-1);
  }, []);

  const historyUp = useCallback(() => {
    if (history.length === 0) return;
    const nextIdx = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
    const next = history[nextIdx] ?? "";
    setHistoryIndex(nextIdx);
    setText(next);
  }, [history, historyIndex, setText]);

  const historyDown = useCallback(() => {
    if (history.length === 0 || historyIndex < 0) return;
    const nextIdx = Math.min(history.length - 1, historyIndex + 1);
    if (nextIdx === history.length - 1 && historyIndex === history.length - 1) {
      clear();
      return;
    }
    const next = history[nextIdx] ?? "";
    setHistoryIndex(nextIdx);
    setText(next);
  }, [clear, history, historyIndex, setText]);

  return useMemo(
    () => ({
      value,
      cursor,
      setText,
      clear,
      insert,
      backspace,
      moveLeft,
      moveRight,
      moveHome,
      moveEnd,
      moveWordLeft,
      moveWordRight,
      commitToHistory,
      historyUp,
      historyDown,
    }),
    [
      value,
      cursor,
      setText,
      clear,
      insert,
      backspace,
      moveLeft,
      moveRight,
      moveHome,
      moveEnd,
      moveWordLeft,
      moveWordRight,
      commitToHistory,
      historyUp,
      historyDown,
    ],
  );
}
