import * as fs from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { createHash } from "node:crypto";
import { safeResolve } from "../file/path-utils";

const SNAP_DIR = ".w3x/snapshots";

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function snapshotFile(filePath: string): Promise<{ hash: string; saved: boolean }> {
  const p = safeResolve(filePath);
  try {
    const content = await fs.readFile(p, "utf-8");
    const hash = hashContent(content);
    const snapDir = resolve(cwd(), SNAP_DIR);
    await fs.mkdir(snapDir, { recursive: true });
    await fs.writeFile(resolve(snapDir, `${hash}.snap`), content, "utf-8");
    return { hash, saved: true };
  } catch {
    return { hash: "", saved: false };
  }
}

export async function restoreSnapshot(filePath: string, hash: string): Promise<boolean> {
  const p = safeResolve(filePath);
  const snapFile = resolve(cwd(), SNAP_DIR, `${hash}.snap`);
  try {
    const content = await fs.readFile(snapFile, "utf-8");
    await fs.writeFile(p, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function getFileHash(filePath: string): Promise<string | null> {
  const p = safeResolve(filePath);
  try {
    const content = await fs.readFile(p, "utf-8");
    return hashContent(content);
  } catch {
    return null;
  }
}
