const marks = new Map<string, number>();
const counters = new Map<string, number>();

export function perfMark(name: string): void {
  marks.set(name, Date.now());
}

export function perfMeasure(name: string, startMark: string): number {
  const start = marks.get(startMark);
  if (!start) return -1;
  const ms = Date.now() - start;
  marks.set(name, ms);
  return ms;
}

export function perfCount(name: string, delta = 1): number {
  const next = (counters.get(name) ?? 0) + delta;
  counters.set(name, next);
  return next;
}

export function perfSnapshot(): {
  marks: Record<string, number>;
  counters: Record<string, number>;
} {
  return {
    marks: Object.fromEntries(marks),
    counters: Object.fromEntries(counters),
  };
}
