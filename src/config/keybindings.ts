import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";
import { z } from "zod";

const KeybindingsSchema = z.record(
  z.string(),
  z.object({
    key: z.string(),
    ctrl: z.boolean().optional(),
    meta: z.boolean().optional(),
    shift: z.boolean().optional(),
  }),
);

export type KeybindingMap = z.infer<typeof KeybindingsSchema>;

export const DEFAULT_KEYBINDINGS: KeybindingMap = {
  commandPalette: { key: "k", ctrl: true },
  toggleLogs: { key: "l", ctrl: true },
  showHelp: { key: "h", ctrl: true },
  modelSelector: { key: "m", ctrl: true },
  cancel: { key: "c", ctrl: true },
  exit: { key: "x", ctrl: true },
  completeSlash: { key: "\t" },
};

let customBindings: KeybindingMap | null = null;

export function getKeybindings(): KeybindingMap {
  return { ...DEFAULT_KEYBINDINGS, ...customBindings };
}

export async function loadKeybindings(): Promise<KeybindingMap> {
  try {
    const userPath = join(cwd(), ".w3x", "keybindings.json");
    const data = await readFile(userPath, "utf-8");
    const parsed = JSON.parse(data);
    const result = KeybindingsSchema.safeParse(parsed);
    if (result.success) {
      customBindings = result.data;
      return { ...DEFAULT_KEYBINDINGS, ...customBindings };
    }
  } catch {
    // no custom keybindings file, use defaults
  }
  return { ...DEFAULT_KEYBINDINGS };
}

export function matchKeybinding(
  ch: string,
  key: { ctrl: boolean; meta: boolean; shift: boolean },
  action: string,
): boolean {
  const binding = getKeybindings()[action];
  if (!binding) return false;
  const normalized = ch === "" && binding.key === "\t";
  return (
    (binding.key === ch || normalized) &&
    (binding.ctrl ?? false) === key.ctrl &&
    (binding.meta ?? false) === key.meta &&
    (binding.shift ?? false) === key.shift
  );
}

export function formatKeybinding(action: string): string {
  const binding = getKeybindings()[action];
  if (!binding) return "";
  const parts: string[] = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.meta) parts.push("Meta");
  if (binding.shift) parts.push("Shift");
  const key = binding.key === "\t" ? "Tab" : binding.key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}
