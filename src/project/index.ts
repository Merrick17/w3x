import * as fs from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";

export interface ProjectInfo {
  name: string;
  language: string;
  framework: string | null;
  packageManager: string;
  hasGit: boolean;
  hasTests: boolean;
}

export async function detectProject(): Promise<ProjectInfo> {
  const root = cwd();
  const files = await listTopFiles(root);

  const info: ProjectInfo = {
    name: "unknown",
    language: "unknown",
    framework: null,
    packageManager: "unknown",
    hasGit: files.has(".git"),
    hasTests: false,
  };

  // Detect language from config files
  if (files.has("package.json")) {
    try {
      const pkg = JSON.parse(await fs.readFile(resolve(root, "package.json"), "utf-8"));
      info.name = pkg.name || "unknown";
      info.language = detectLanguageFromPackage(pkg);

      if (pkg.dependencies) {
        if ("next" in pkg.dependencies || "react" in pkg.dependencies) info.framework = "next.js";
        else if ("vite" in pkg.dependencies) info.framework = "vite";
        else if ("@sveltejs/kit" in pkg.dependencies) info.framework = "sveltekit";
        else if ("astro" in pkg.dependencies) info.framework = "astro";
        else if ("express" in pkg.dependencies) info.framework = "express";
      }
      if (pkg.devDependencies) {
        if ("vitest" in pkg.devDependencies || "jest" in pkg.devDependencies) info.hasTests = true;
      }

      if (files.has("pnpm-lock.yaml")) info.packageManager = "pnpm";
      else if (files.has("yarn.lock")) info.packageManager = "yarn";
      else if (files.has("bun.lockb")) info.packageManager = "bun";
      else info.packageManager = "npm";
    } catch {
      /* keep defaults */
    }
  } else if (files.has("Cargo.toml")) {
    info.language = "rust";
    info.packageManager = "cargo";
  } else if (files.has("go.mod")) {
    info.language = "go";
    info.packageManager = "go modules";
  } else if (files.has("requirements.txt") || files.has("pyproject.toml")) {
    info.language = "python";
    info.packageManager = "pip";
  } else if (files.has("Gemfile")) {
    info.language = "ruby";
    info.packageManager = "bundler";
  }

  return info;
}

interface PackageLike {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

function detectLanguageFromPackage(pkg: PackageLike): string {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (deps && "typescript" in deps) return "typescript";
  if (deps && "react" in deps) return "javascript";
  return "javascript";
}

async function listTopFiles(root: string): Promise<Set<string>> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return new Set(entries.filter((e) => !e.isDirectory()).map((e) => e.name));
  } catch {
    return new Set();
  }
}
