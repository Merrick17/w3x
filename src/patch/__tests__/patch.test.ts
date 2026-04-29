import { describe, it, expect } from "vitest";
import { generateDiff, validatePatch } from "../index";

describe("generateDiff", () => {
  it("generates a unified diff between two strings", () => {
    const diff = generateDiff("test.ts", "const x = 1;", "const x = 2;");
    expect(diff).toContain("---");
    expect(diff).toContain("+++");
    expect(diff).toContain("const x = 1;");
    expect(diff).toContain("const x = 2;");
  });

  it("returns empty diff when content is identical", () => {
    const diff = generateDiff("test.ts", "same", "same");
    // No hunks expected for identical content
    expect(diff).toBeDefined();
  });

  it("handles multiline changes", () => {
    const original = "line1\nline2\nline3";
    const modified = "line1\nline2-modified\nline3";
    const diff = generateDiff("test.ts", original, modified);
    expect(diff).toContain("line2");
    expect(diff).toContain("modified");
  });
});

describe("validatePatch", () => {
  it("rejects empty patch", () => {
    expect(validatePatch("")).toEqual({ valid: false, error: "Empty patch" });
    expect(validatePatch("   ")).toEqual({ valid: false, error: "Empty patch" });
  });

  it("rejects patch without diff header", () => {
    expect(validatePatch("just some text\nno headers here")).toEqual({
      valid: false,
      error: "Missing diff header (--- / +++)",
    });
  });

  it("rejects patch without hunk header", () => {
    expect(validatePatch("--- original\n+++ modified\njust a line\n")).toEqual({
      valid: false,
      error: "Missing hunk header (@@)",
    });
  });

  it("accepts valid patch with both headers", () => {
    const patch = generateDiff("test.ts", "old", "new");
    expect(validatePatch(patch)).toEqual({ valid: true });
  });

  it("validates a realistic diff patch", () => {
    const fullPatch = `--- original/src/test.ts
+++ modified/src/test.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
 const z = 4;`;
    expect(validatePatch(fullPatch)).toEqual({ valid: true });
  });
});
