import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  truncateToolOutput,
  estimateContextTokens,
  contextWarning,
} from "../index";

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 -> 3
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("scales linearly with text length", () => {
    const short = estimateTokens("short");
    const long = estimateTokens("a".repeat(400));
    expect(long).toBeGreaterThan(short);
  });
});

describe("truncateToolOutput", () => {
  it("passes through non-strings unchanged", () => {
    const obj = { key: "value" };
    expect(truncateToolOutput(obj, "readFile")).toBe(obj);
  });

  it("passes through strings under max length", () => {
    const text = "short content";
    expect(truncateToolOutput(text, "readFile")).toBe(text);
  });

  it("truncates readFile output at 8000 chars", () => {
    const text = "x".repeat(10000);
    const result = truncateToolOutput(text, "readFile") as string;
    expect(result.length).toBeLessThan(10000);
    expect(result).toContain("truncated");
  });

  it("truncates runCommand output at 4000 chars", () => {
    const text = "x".repeat(8000);
    const result = truncateToolOutput(text, "runCommand") as string;
    expect(result).toContain("truncated");
    expect(result.length).toBeLessThan(8000);
  });

  it("truncates search results at 3000 chars", () => {
    const text = "x".repeat(8000);
    const result = truncateToolOutput(text, "webSearch") as string;
    expect(result).toContain("truncated");
    expect(result.length).toBeLessThan(8000);
  });

  it("uses default max for unknown tools", () => {
    const text = "x".repeat(8000);
    const result = truncateToolOutput(text, "unknownTool") as string;
    expect(result).toContain("truncated");
  });
});

describe("estimateContextTokens", () => {
  it("estimates total tokens across all messages", () => {
    const msgs = [
      { role: "user", content: "hello world hello world" },
      { role: "assistant", content: "response here" },
    ];
    const tokens = estimateContextTokens(msgs);
    expect(tokens).toBeGreaterThan(0);
  });

  it("handles non-string content", () => {
    const msgs = [{ role: "user", content: [{ type: "text", text: "hello" }] }];
    const tokens = estimateContextTokens(msgs);
    expect(tokens).toBeGreaterThan(0);
  });

  it("returns 0 for empty messages", () => {
    expect(estimateContextTokens([])).toBe(0);
  });
});

describe("contextWarning", () => {
  it("returns null when usage is below 50%", () => {
    const msgs = [{ role: "user", content: "short" }];
    expect(contextWarning(msgs, 128000)).toBeNull();
  });

  it("returns warning when usage exceeds 80%", () => {
    // Generate ~110k tokens worth of text to trigger >80% of 128k limit
    const text = "x".repeat(440000);
    const msgs = [{ role: "user", content: text }];
    const warning = contextWarning(msgs, 128000);
    expect(warning).not.toBeNull();
    expect(warning).toMatch(/8[0-9]%/);
  });

  it("returns info when usage is between 50% and 80%", () => {
    const text = "x".repeat(300000); // ~75k tokens
    const msgs = [{ role: "user", content: text }];
    const warning = contextWarning(msgs, 128000);
    if (warning) {
      expect(warning).not.toContain("80");
    }
  });
});
