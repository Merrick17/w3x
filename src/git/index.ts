import { execaCommand } from "execa";
import { cwd } from "node:process";

const WS = cwd();
const isWindows = process.platform === "win32";

export async function isGitRepo(): Promise<boolean> {
  try {
    const r = await execaCommand("git rev-parse --git-dir", {
      cwd: WS,
      shell: isWindows ? "powershell" : true,
      reject: false,
    });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

export async function getCurrentBranch(): Promise<string> {
  try {
    const r = await execaCommand("git rev-parse --abbrev-ref HEAD", {
      cwd: WS,
      shell: isWindows ? "powershell" : true,
      reject: false,
    });
    return r.stdout?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export async function hasUncommittedChanges(): Promise<boolean> {
  try {
    const r = await execaCommand("git status --porcelain", {
      cwd: WS,
      shell: isWindows ? "powershell" : true,
      reject: false,
    });
    return (r.stdout?.trim() ?? "").length > 0;
  } catch {
    return false;
  }
}

export async function getDefaultBranch(): Promise<string> {
  try {
    const r = await execaCommand("git remote show origin", {
      cwd: WS,
      shell: isWindows ? "powershell" : true,
      reject: false,
    });
    const match = r.stdout?.match(/HEAD branch: (\S+)/);
    return match?.[1] || "main";
  } catch {
    return "main";
  }
}
