import * as fs from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { homedir } from "node:os";
import fg from "fast-glob";

export interface LoadedInstructions {
  agentsMd: string;
  skills: Array<{ name: string; content: string }>;
  totalChars: number;
}

/**
 * Load AGENTS.md from the project root.
 * This is the standard instruction file that coding agents expect.
 * Follows the OpenCode convention of loading instructions from the repo root.
 */
async function loadAgentsMd(): Promise<string> {
  const paths = [
    resolve(cwd(), "AGENTS.md"),
    resolve(cwd(), ".agents.md"),
    resolve(cwd(), ".w3x/AGENTS.md"),
  ];

  for (const p of paths) {
    try {
      const content = await fs.readFile(p, "utf-8");
      return content.slice(0, 8000); // cap to avoid token bloat
    } catch {
      // file doesn't exist, try next
    }
  }
  return "";
}

/**
 * Load skill files from the project's .w3x/skills/ directory and
 * the user's home ~/.w3x/skills/ directory.
 * Skills are markdown files containing specialized instructions.
 * Follows the OpenCode pattern of skill loading.
 */
async function loadSkills(): Promise<Array<{ name: string; content: string }>> {
  const skillDirs = [
    resolve(cwd(), ".w3x", "skills"),
    resolve(homedir(), ".w3x", "skills"),
  ];

  const skills: Array<{ name: string; content: string }> = [];

  for (const dir of skillDirs) {
    try {
      const files = await fg("*.md", {
        cwd: dir,
        absolute: true,
        onlyFiles: true,
      });

      for (const file of files.slice(0, 10)) {
        try {
          const content = await fs.readFile(file, "utf-8");
          const name = file.replace(/^.*[\\/]/, "").replace(/\.md$/, "");
          skills.push({ name, content: content.slice(0, 4000) });
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // directory doesn't exist
    }
  }

  return skills;
}

/**
 * Load all project instructions: AGENTS.md + skill files.
 * Returns a formatted block ready to inject into the system prompt.
 */
export async function loadInstructions(): Promise<LoadedInstructions> {
  const [agentsMd, skills] = await Promise.all([
    loadAgentsMd(),
    loadSkills(),
  ]);

  const totalChars =
    agentsMd.length + skills.reduce((sum, s) => sum + s.content.length, 0);

  return { agentsMd, skills, totalChars };
}

/**
 * Format loaded instructions into a system prompt block.
 */
export function formatInstructionsBlock(instructions: LoadedInstructions): string {
  if (instructions.totalChars === 0) return "";

  const parts: string[] = [];

  if (instructions.agentsMd) {
    parts.push("## PROJECT INSTRUCTIONS (AGENTS.md)");
    parts.push(instructions.agentsMd);
  }

  if (instructions.skills.length > 0) {
    parts.push("## LOADED SKILLS");
    for (const skill of instructions.skills) {
      parts.push(`### Skill: ${skill.name}`);
      parts.push(skill.content);
    }
  }

  if (parts.length === 0) return "";

  return `\n\n---\n${parts.join("\n")}\n---`;
}
