import { resolve, relative } from "node:path";
import { cwd } from "node:process";

export function safeResolve(filePath: string, workspaceRoot: string = cwd()): string {
  const resolved = resolve(workspaceRoot, filePath);
  const rel = relative(workspaceRoot, resolved);
  if (rel.startsWith("..")) throw new Error(`Access denied: ${filePath} is outside of workspace`);
  return resolved;
}

export function safePath(filePath: string): string {
  return safeResolve(filePath, cwd());
}
