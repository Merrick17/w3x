import { Box, Text } from "ink";
import { useState } from "react";

import { useTheme } from "@/components/ui/theme-provider";
import { useAnimation } from "@/hooks/use-animation";
import { useInput } from "@/hooks/use-input";

export type ToolCallStatus = "pending" | "running" | "success" | "error";

export interface ToolCallProps {
  name: string;
  args?: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  duration?: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  focused?: boolean;
}

export const ToolCall = ({
  name,
  args,
  status,
  result,
  duration,
  collapsible = true,
  defaultCollapsed = true,
  focused = false,
}: ToolCallProps) => {
  const theme = useTheme();
  const initialCollapsed = defaultCollapsed && status !== "running" && status !== "error";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const frame = useAnimation(12);

  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const spinnerIcon = spinnerFrames[frame % spinnerFrames.length] ?? "⠋";

  useInput(
    (input, key) => {
      if (collapsible && (key.return || input === " ")) {
        setCollapsed((c) => !c);
      }
    },
    { isActive: focused },
  );

  const statusIcon = () => {
    switch (status) {
      case "pending": {
        return <Text dimColor>○</Text>;
      }
      case "running": {
        return <Text color={theme.colors.primary}>{spinnerIcon}</Text>;
      }
      case "success": {
        return <Text color={theme.colors.success ?? "green"}>✓</Text>;
      }
      case "error": {
        return <Text color={theme.colors.error ?? "red"}>✗</Text>;
      }
      default: {
        break;
      }
    }
  };

  let durationText: string | null;
  if (duration === undefined) {
    durationText = status === "running" ? "running..." : null;
  } else {
    durationText = `${duration}ms`;
  }

  let nameColor: string;
  if (status === "error") {
    nameColor = theme.colors.statusError;
  } else if (status === "success") {
    nameColor = theme.colors.statusSuccess;
  } else if (status === "running") {
    nameColor = theme.colors.primary;
  } else {
    nameColor = theme.colors.mutedForeground;
  }

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        {statusIcon()}
        <Text color={nameColor} bold={status !== "pending"}>
          {name}
        </Text>
        {durationText && (
          <Text dimColor color={theme.colors.mutedForeground}>
            ({durationText})
          </Text>
        )}
        {collapsible && (
          <Text dimColor color={theme.colors.mutedForeground}>
            {collapsed ? "▶" : "▼"}
          </Text>
        )}
      </Box>

      {!collapsed && (
        <Box flexDirection="column" paddingLeft={2}>
          {args && Object.keys(args).length > 0 && (
            <Box flexDirection="column">
              <Text dimColor color={theme.colors.mutedForeground}>
                Args:
              </Text>
              {Object.entries(args).map(([k, v]) => (
                <Box key={k} gap={1}>
                  <Text color={theme.colors.accent}>{k}:</Text>
                  <Text dimColor>{JSON.stringify(v)}</Text>
                </Box>
              ))}
            </Box>
          )}
          {result !== undefined && (
            <Box flexDirection="column">
              <Text dimColor color={theme.colors.mutedForeground}>
                Result:
              </Text>
              <Text dimColor>
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
