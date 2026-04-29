import * as fs from "node:fs/promises";
import { createPatch, applyPatch } from "diff";
import { safeResolve } from "../file/path-utils";

export interface PatchResult {
  success: boolean;
  message: string;
  filePath: string;
}

/**
 * Generate a unified diff between original and modified content.
 * Used to preview changes before applying them.
 */
export function generateDiff(
  filePath: string,
  originalContent: string,
  modifiedContent: string,
): string {
  return createPatch(
    filePath,
    originalContent,
    modifiedContent,
    "original",
    "modified",
  );
}

/**
 * Apply a unified diff patch to a file.
 * Backs up the original file before patching.
 * Follows the OpenCode pattern of diff-based editing for safety.
 */
export async function applyPatchToFile(
  filePath: string,
  patchText: string,
): Promise<PatchResult> {
  const safePath = safeResolve(filePath);

  let original: string;
  try {
    original = await fs.readFile(safePath, "utf-8");
  } catch {
    return { success: false, message: `File not found: ${filePath}`, filePath };
  }

  // Create backup
  const backupPath = safePath + ".w3x.bak";
  try {
    await fs.writeFile(backupPath, original, "utf-8");
  } catch {
    // non-critical
  }

  // Apply the patch
  const result = applyPatch(original, patchText);

  if (result === false) {
    return {
      success: false,
      message: `Patch failed to apply. The file may have changed since the diff was generated. Backup saved to ${backupPath}`,
      filePath,
    };
  }

  // Write the patched content
  await fs.writeFile(safePath, result, "utf-8");

  // Clean up backup on success
  try {
    await fs.unlink(backupPath);
  } catch {
    // non-critical
  }

  return {
    success: true,
    message: `Patch applied successfully to ${filePath}`,
    filePath,
  };
}

/**
 * Restore a file from its .w3x.bak backup (undo last patch).
 */
export async function undoLastPatch(filePath: string): Promise<PatchResult> {
  const safePath = safeResolve(filePath);
  const backupPath = safePath + ".w3x.bak";

  try {
    const backup = await fs.readFile(backupPath, "utf-8");
    await fs.writeFile(safePath, backup, "utf-8");
    await fs.unlink(backupPath);
    return { success: true, message: `Restored ${filePath} from backup`, filePath };
  } catch {
    return { success: false, message: `No backup found for ${filePath}`, filePath };
  }
}

/**
 * Compute a diff between the current file content and a proposed change.
 * Used by the agent to verify edits before committing.
 */
export async function computeFileDiff(filePath: string): Promise<string> {
  const safePath = safeResolve(filePath);
  try {
    const current = await fs.readFile(safePath, "utf-8");
    const backupPath = safePath + ".w3x.bak";
    let original = "";

    try {
      original = await fs.readFile(backupPath, "utf-8");
    } catch {
      // no backup — return empty diff
      return "";
    }

    return generateDiff(filePath, original, current);
  } catch {
    return "";
  }
}

/**
 * Validate that a diff patch is syntactically valid.
 * Performs basic checks on the patch format.
 */
export function validatePatch(patchText: string): { valid: boolean; error?: string } {
  if (!patchText || patchText.trim().length === 0) {
    return { valid: false, error: "Empty patch" };
  }

  // Check for diff header patterns
  const hasDiffHeader = /^--- /m.test(patchText) || /^\+\+\+ /m.test(patchText);
  const hasHunkHeader = /^@@ /m.test(patchText);

  if (!hasDiffHeader) {
    return { valid: false, error: "Missing diff header (--- / +++)" };
  }

  if (!hasHunkHeader) {
    return { valid: false, error: "Missing hunk header (@@)" };
  }

  return { valid: true };
}
