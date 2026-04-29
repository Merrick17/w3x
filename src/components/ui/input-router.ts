import { useInput } from "@/hooks/use-input";
import { matchKeybinding } from "@/config/keybindings";

type Key = {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  tab: boolean;
  return: boolean;
  escape: boolean;
  upArrow: boolean;
  downArrow: boolean;
  pageUp: boolean;
  pageDown: boolean;
  backspace: boolean;
  delete: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  home?: boolean;
  end?: boolean;
};

interface InputRouterOpts {
  isOverlayOpen: boolean;
  onOpenPalette: () => void;
  onToggleLogs: () => void;
  onOpenHelp: () => void;
  onOpenModelSelector: () => void;
  onCancel: () => void;
  onExit: () => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
  onScrollPageUp: () => void;
  onScrollPageDown: () => void;
  onSubmit: () => void;
  onBackspace: () => void;
  onSlashComplete: () => void;
  onMoveCursorLeft: () => void;
  onMoveCursorRight: () => void;
  onMoveCursorHome: () => void;
  onMoveCursorEnd: () => void;
  onInsertText: (ch: string) => void;
  onCloseOverlay: () => void;
}

export function useInputRouter(opts: InputRouterOpts) {
  useInput((ch: string, key: Key) => {
    if (opts.isOverlayOpen) {
      if (key.escape) opts.onCloseOverlay();
      return;
    }

    if (matchKeybinding(ch, key, "commandPalette")) return opts.onOpenPalette();
    if (matchKeybinding(ch, key, "toggleLogs")) return opts.onToggleLogs();
    if (matchKeybinding(ch, key, "showHelp")) return opts.onOpenHelp();
    if (matchKeybinding(ch, key, "modelSelector")) return opts.onOpenModelSelector();
    if (matchKeybinding(ch, key, "cancel")) return opts.onCancel();
    if (matchKeybinding(ch, key, "exit")) return opts.onExit();
    if (key.tab) return opts.onSlashComplete();
    if (key.return) return opts.onSubmit();
    if (key.upArrow) return opts.onScrollUp();
    if (key.downArrow) return opts.onScrollDown();
    if (key.pageUp) return opts.onScrollPageUp();
    if (key.pageDown) return opts.onScrollPageDown();
    if (key.leftArrow) return opts.onMoveCursorLeft();
    if (key.rightArrow) return opts.onMoveCursorRight();
    if (key.home) return opts.onMoveCursorHome();
    if (key.end) return opts.onMoveCursorEnd();
    if (key.backspace || key.delete) return opts.onBackspace();
    if (key.ctrl || key.meta || key.escape) return;
    if (ch) opts.onInsertText(ch);
  });
}
