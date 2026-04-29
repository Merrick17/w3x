import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";
import { homedir } from "node:os";
import { constants } from "node:fs";

// ─── Paths ───────────────────────────────────────────────────────────────

export const USER_MEMORY_PATH = join(homedir(), ".w3x", "MEMORY.md");
export const PROJECT_MEMORY_PATH = join(cwd(), ".w3x", "MEMORY.md");
export const LOCAL_MEMORY_PATH = join(cwd(), ".w3x", "MEMORY.local.md");

// ─── Memory sections ─────────────────────────────────────────────────────

export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryEntry {
  title: string;
  description: string;
  type: MemoryType;
  body: string;
}

interface ParsedMemoryFile {
  entries: MemoryEntry[];
  raw: string;
}

// ─── Parsing ─────────────────────────────────────────────────────────────

function parseMemoryMd(content: string): ParsedMemoryFile {
  const entries: MemoryEntry[] = [];
  const blocks = content.split(/^---$/m);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Extract YAML-style frontmatter
    const fmMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!fmMatch) continue;

    const frontmatter = fmMatch[1];
    const body = fmMatch[2].trim();

    const name = extractField(frontmatter, "name");
    const description = extractField(frontmatter, "description");
    const type = extractField(frontmatter, "type") as MemoryType | undefined;

    if (name && type && body) {
      entries.push({
        title: name,
        description: description || "",
        type,
        body,
      });
    }
  }

  return { entries, raw: content };
}

function extractField(fm: string, field: string): string | undefined {
  const regex = new RegExp(`^${field}\\s*:\\s*(.+?)\\s*$`, "m");
  const match = fm.match(regex);
  return match ? match[1].trim() : undefined;
}

// ─── Reading ─────────────────────────────────────────────────────────────

export async function loadAllMemoryMd(): Promise<MemoryEntry[]> {
  const entries: MemoryEntry[] = [];
  const paths = [USER_MEMORY_PATH, PROJECT_MEMORY_PATH, LOCAL_MEMORY_PATH];

  for (const path of paths) {
    try {
      await access(path, constants.R_OK);
      const content = await readFile(path, "utf-8");
      const parsed = parseMemoryMd(content);
      entries.push(...parsed.entries);
    } catch {
      // file doesn't exist or isn't readable — skip
    }
  }

  return entries;
}

export async function loadMemoryIndex(): Promise<string[]> {
  const entries: string[] = [];
  const paths = [USER_MEMORY_PATH, PROJECT_MEMORY_PATH, LOCAL_MEMORY_PATH];

  for (const path of paths) {
    try {
      await access(path, constants.R_OK);
      const content = await readFile(path, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        // Extract link lines from MEMORY.md index (e.g., "- [Title](file.md)")
        if (trimmed.startsWith("- [") && trimmed.includes("](")) {
          entries.push(trimmed);
        }
      }
    } catch {
      // skip
    }
  }

  return entries;
}

// ─── Writing ─────────────────────────────────────────────────────────────

export async function saveMemoryEntry(
  entry: MemoryEntry,
  target: "project" | "local" = "project",
): Promise<string> {
  const memDir = target === "local" ? join(cwd(), ".w3x") : join(cwd(), ".w3x");

  await mkdir(memDir, { recursive: true });

  const filePath = target === "local" ? LOCAL_MEMORY_PATH : PROJECT_MEMORY_PATH;

  // Create a sanitized filename for the memory
  const slug = entry.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const memoryFileName = `${slug}.md`;
  const memoryFilePath = join(memDir, memoryFileName);

  // Write the memory file
  const memoryContent = [
    "---",
    `name: ${entry.title}`,
    `description: ${entry.description}`,
    `type: ${entry.type}`,
    "---",
    "",
    entry.body,
  ].join("\n");

  await writeFile(memoryFilePath, memoryContent, "utf-8");

  // Update MEMORY.md index
  let indexContent = "";
  try {
    indexContent = await readFile(filePath, "utf-8");
  } catch {
    // fresh file
    indexContent =
      "# W3X Memory\n\nThis file indexes all project memory. Memory entries are stored as separate files.\n\n";
  }

  const indexLine = `- [${entry.title}](${memoryFileName}) — ${entry.description}`;

  if (!indexContent.includes(indexLine)) {
    indexContent += `\n${indexLine}`;
    await writeFile(filePath, indexContent, "utf-8");
  }

  return memoryFilePath;
}

// ─── Formatting for system prompt ────────────────────────────────────────

export function formatMemoryBlock(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "";

  const byType: Record<string, MemoryEntry[]> = {};
  for (const entry of entries) {
    const t = entry.type;
    if (!byType[t]) byType[t] = [];
    byType[t].push(entry);
  }

  const sections: string[] = [];
  const typeLabels: Record<string, string> = {
    user: "User Profile",
    feedback: "Feedback & Preferences",
    project: "Project Context",
    reference: "References",
  };

  for (const [type, typeEntries] of Object.entries(byType)) {
    const label = typeLabels[type] || type;
    sections.push(`### ${label}`);
    for (const entry of typeEntries.slice(0, 10)) {
      sections.push(`- **${entry.title}**: ${entry.body.slice(0, 300)}`);
    }
  }

  return `\n\n---\n## MEMORY\n${sections.join("\n")}\n---`;
}
