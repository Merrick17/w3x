import { describe, it, expect, beforeEach } from "vitest";
import {
  getPermissionLevel,
  isAutoApproved,
  isReadOnlyCommand,
  recordDecision,
  setRules,
  setPlanMode,
  setLearnConfig,
} from "../index";

describe("getPermissionLevel", () => {
  it("returns allow for readonly tools", () => {
    expect(getPermissionLevel("read")).toBe("allow");
    expect(getPermissionLevel("readFile")).toBe("allow");
  });

  it("returns allow for exploration tools", () => {
    expect(getPermissionLevel("glob")).toBe("allow");
    expect(getPermissionLevel("grep")).toBe("allow");
    expect(getPermissionLevel("searchCodebase")).toBe("allow");
  });

  it("returns ask for write tools", () => {
    expect(getPermissionLevel("write")).toBe("ask");
    expect(getPermissionLevel("edit")).toBe("ask");
  });

  it("returns ask for shell tools", () => {
    expect(getPermissionLevel("bash")).toBe("ask");
    expect(getPermissionLevel("runCommand")).toBe("ask");
  });

  it("defaults to ask for unknown tools", () => {
    expect(getPermissionLevel("completelyUnknownTool")).toBe("ask");
  });
});

describe("isAutoApproved", () => {
  it("approves allow-level tools in plan mode", () => {
    expect(isAutoApproved("read", "plan")).toBe(true);
    expect(isAutoApproved("glob", "plan")).toBe(true);
  });

  it("denies ask-level tools in plan mode", () => {
    expect(isAutoApproved("write", "plan")).toBe(false);
    expect(isAutoApproved("bash", "plan")).toBe(false);
  });

  it("approves allow-level tools in build mode", () => {
    expect(isAutoApproved("read", "build")).toBe(true);
    expect(isAutoApproved("grep", "build")).toBe(true);
  });

  it("denies ask-level tools in build mode", () => {
    expect(isAutoApproved("write", "build")).toBe(false);
    expect(isAutoApproved("edit", "build")).toBe(false);
  });
});

describe("rule engine", () => {
  beforeEach(() => {
    setLearnConfig({ enabled: false, threshold: 2 });
  });

  it("respects custom deny rules", () => {
    setRules([{ tool: "bash", level: "deny", priority: 200 }]);
    expect(getPermissionLevel("bash")).toBe("deny");
  });

  it("higher priority rule wins", () => {
    setRules([
      { tool: "bash", level: "allow", priority: 200 },
      { tool: "bash", level: "deny", priority: 100 },
    ]);
    expect(getPermissionLevel("bash")).toBe("allow");
  });

  it("scoped rules filter by command content", () => {
    setRules([
      {
        tool: "bash",
        level: "allow",
        priority: 200,
        scope: { commands: ["npm test", "npm run build"] },
      },
    ]);
    // Without matching args, falls through to default rule (ask)
    expect(getPermissionLevel("bash")).toBe("ask");
    // With matching args, custom rule applies
    expect(getPermissionLevel("bash", { command: "npm test" })).toBe("allow");
    expect(getPermissionLevel("bash", { command: "npm run build --verbose" })).toBe("allow");
  });

  it("scoped rules filter by directories", () => {
    setRules([
      {
        tool: "write",
        level: "allow",
        priority: 200,
        scope: { directories: ["/safe/dir"] },
      },
    ]);
    expect(getPermissionLevel("write", { path: "/safe/dir/file.ts", content: "x" })).toBe("allow");
    expect(getPermissionLevel("write", { path: "/danger/file.ts", content: "x" })).toBe("ask");
  });
});

describe("permission learning", () => {
  beforeEach(() => {
    setLearnConfig({ enabled: true, threshold: 2 });
    // Reset rules to defaults
    setRules([]);
  });

  it("learns after repeated approvals", () => {
    const args = { path: "/src/app.ts", content: "// test" };
    recordDecision("write", args, "approve");
    expect(getPermissionLevel("write", args)).toBe("ask"); // only 1, threshold not met

    recordDecision("write", args, "approve");
    expect(getPermissionLevel("write", args)).toBe("allow"); // 2 approvals, threshold met
  });

  it("resets learning on rejection", () => {
    const args = { path: "/src/app.ts", content: "// test" };
    recordDecision("write", args, "approve");
    recordDecision("write", args, "approve");
    expect(getPermissionLevel("write", args)).toBe("allow");

    recordDecision("write", args, "reject");
    expect(getPermissionLevel("write", args)).toBe("ask"); // count reset
  });

  it("fingerprinting is based on keys not values", () => {
    const args1 = { path: "/src/a.ts", content: "x" };
    const args2 = { path: "/src/b.ts", content: "y" };
    recordDecision("write", args1, "approve");
    recordDecision("write", args2, "approve");
    // Same key pattern, so both count toward the same fingerprint
    expect(getPermissionLevel("write", args2)).toBe("allow");
  });

  it("different arg shapes have different fingerprints", () => {
    const args1 = { path: "a.ts", content: "x" };
    const args2 = { path: "a.ts", content: "x", replaceAll: true };
    recordDecision("edit", args1, "approve");
    recordDecision("edit", args1, "approve");
    // args2 has different keys, so shouldn't match learned
    expect(getPermissionLevel("edit", args1)).toBe("allow");
    expect(getPermissionLevel("edit", args2)).toBe("ask");
  });
});

describe("plan mode", () => {
  beforeEach(() => {
    setLearnConfig({ enabled: false, threshold: 2 });
    setRules([]);
    setPlanMode(false);
  });

  it("write tools are ask in plan mode", () => {
    setPlanMode(true);
    expect(getPermissionLevel("write")).toBe("ask");
    expect(getPermissionLevel("edit")).toBe("ask");
    expect(getPermissionLevel("bash")).toBe("ask");
  });
});

describe("isReadOnlyCommand", () => {
  it("returns true for safe commands like ls", () => {
    expect(isReadOnlyCommand("ls")).toBe(true);
    expect(isReadOnlyCommand("ls -la")).toBe(true);
  });

  it("returns true for cat", () => {
    expect(isReadOnlyCommand("cat file.txt")).toBe(true);
  });

  it("returns true for git status", () => {
    expect(isReadOnlyCommand("git status")).toBe(true);
    expect(isReadOnlyCommand("git diff")).toBe(true);
  });

  it("returns false for commands with pipe operators", () => {
    expect(isReadOnlyCommand("ls | grep foo")).toBe(false);
  });

  it("returns false for commands with redirects", () => {
    expect(isReadOnlyCommand("cat > file.txt")).toBe(false);
    expect(isReadOnlyCommand("echo hi >> file.txt")).toBe(false);
  });

  it("returns false for unknown destructive commands", () => {
    expect(isReadOnlyCommand("rm -rf /")).toBe(false);
  });

  it("returns false for commands with semicolons", () => {
    expect(isReadOnlyCommand("ls; rm -rf /")).toBe(false);
  });
});
