import { createTheme } from "@/components/ui/theme-provider";

export const oneDarkTheme = createTheme({
  name: "One Dark",
  border: { color: "#4B5263", focusColor: "#61AFEF", style: "round" as const },
  colors: {
    accent: "#56B6C2", accentForeground: "#282C34",
    background: "#282C34", border: "#4B5263",
    error: "#E06C75", errorForeground: "#282C34",
    focusRing: "#61AFEF", foreground: "#ABB2BF",
    info: "#56B6C2", infoForeground: "#282C34",
    muted: "#3E4451", mutedForeground: "#5C6370",
    primary: "#61AFEF", primaryForeground: "#282C34",
    secondary: "#C678DD", secondaryForeground: "#282C34",
    selection: "#3E4451", selectionForeground: "#ABB2BF",
    success: "#98C379", successForeground: "#282C34",
    warning: "#E5C07B", warningForeground: "#282C34",
  },
});
