import { useCallback, useMemo, useState } from "react";

export type FocusTarget = "input" | "history" | "sidebar" | "overlay";

export function useFocusManager() {
  const [activeFocus, setActiveFocus] = useState<FocusTarget>("input");
  const [lastNonOverlayFocus, setLastNonOverlayFocus] = useState<FocusTarget>("input");

  const focus = useCallback((target: FocusTarget) => {
    setActiveFocus(target);
    if (target !== "overlay") {
      setLastNonOverlayFocus(target);
    }
  }, []);

  const enterOverlay = useCallback(() => {
    setActiveFocus("overlay");
  }, []);

  const leaveOverlay = useCallback(() => {
    setActiveFocus(lastNonOverlayFocus);
  }, [lastNonOverlayFocus]);

  return useMemo(
    () => ({
      activeFocus,
      focus,
      enterOverlay,
      leaveOverlay,
      isOverlayFocused: activeFocus === "overlay",
    }),
    [activeFocus, enterOverlay, focus, leaveOverlay],
  );
}
