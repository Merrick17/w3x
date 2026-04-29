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
  exit: { key: "x", ctrl: true },
  exitAlt: { key: "c", ctrl: true },
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
  return (
    binding.key === ch &&
    (binding.ctrl ?? false) === key.ctrl &&
    (binding.meta ?? false) === key.meta &&
    (binding.shift ?? false) === key.shift
  );
}
