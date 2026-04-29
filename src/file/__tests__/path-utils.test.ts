import { describe, it, expect } from "vitest";
import { safeResolve, safePath } from "../path-utils";
import { cwd } from "node:process";
import { resolve } from "node:path";

describe("safeResolve", () => {
  it("resolves relative paths within the workspace", () => {
    const result = safeResolve("src/file.ts");
    expect(result).toContain("src");
    expect(result).toContain("file.ts");
  });

  it("resolves absolute paths within the workspace", () => {
    const root = cwd();
    const result = safeResolve(root + "/src/file.ts");
    expect(result).toContain("src");
  });

  it("throws on path traversal attempt", () => {
    expect(() => safeResolve("../outside/file.ts")).toThrow("Access denied");
  });

  it("throws on deep traversal attempt", () => {
    expect(() => safeResolve("../../etc/passwd")).toThrow("Access denied");
  });

  it("accepts custom workspace root", () => {
    const ws = resolve("/tmp/test-workspace");
    const result = safeResolve("foo/bar.ts", ws);
    expect(result).toBe(resolve(ws, "foo/bar.ts"));
  });

  it("blocks traversal outside custom root", () => {
    const ws = "/tmp/test-workspace";
    expect(() => safeResolve("../outside.ts", ws)).toThrow("Access denied");
  });
});

describe("safePath", () => {
  it("uses current working directory", () => {
    const result = safePath("src/file.ts");
    expect(result).toBeDefined();
  });
});
