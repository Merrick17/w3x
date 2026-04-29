import { cwd } from "node:process";
import { safeResolve } from "../file/path-utils";

export const PINNED_FILES = new Set<string>();

const _state = {
  CURRENT_WORKSPACE: cwd(),
};

export function getWorkspace(): string {
  return _state.CURRENT_WORKSPACE;
}

export function setWorkspacePath(p: string): void {
  _state.CURRENT_WORKSPACE = p;
}

export const safe = (p: string) => safeResolve(p, getWorkspace());
