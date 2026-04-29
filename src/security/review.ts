import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { cwd } from "node:process";

interface SecurityIssue {
  file: string;
  line: number;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  message: string;
}

interface ReviewResult {
  issues: SecurityIssue[];
  error?: string;
}

const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/g },
  {
    name: "Generic API Key",
    pattern: /(?:api[_-]?key|apikey|API_KEY)\s*[:=]\s*['"][\w-]{20,}['"]/gi,
  },
  { name: "Private Key (PEM)", pattern: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH)\s+PRIVATE KEY-----/g },
  { name: "JWT Token", pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g },
  { name: "Slack Token", pattern: /xox[baprs]-[0-9A-Za-z-]+/g },
  { name: "GitHub Token", pattern: /gh[pousr]_[0-9A-Za-z]{36}/g },
];

const DANGEROUS_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "eval() usage", pattern: /\beval\s*\(/g },
  { name: "Function constructor", pattern: /\bnew\s+Function\s*\(/g },
  { name: "Command injection risk", pattern: /\bexec\s*\(\s*[^)]*\+/g },
  { name: "Unsafe innerHTML assignment", pattern: /\.innerHTML\s*=/g },
  { name: "Unvalidated redirect", pattern: /location\s*=\s*req\.(query|params)\.\w+/g },
  { name: "SQL string concatenation", pattern: /['"]\s*SELECT\s+.*['"]\s*\+/gi },
];

export async function reviewFile(filePath: string): Promise<ReviewResult> {
  const issues: SecurityIssue[] = [];

  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const relPath = relative(cwd(), filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check secrets
      for (const { name, pattern } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          issues.push({
            file: relPath,
            line: i + 1,
            severity: "critical",
            category: "secrets",
            message: `Exposed secret detected: ${name}`,
          });
        }
      }

      // Check dangerous patterns
      for (const { name, pattern } of DANGEROUS_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          issues.push({
            file: relPath,
            line: i + 1,
            severity: name.includes("eval") || name.includes("Function") ? "high" : "medium",
            category: "injection",
            message: `Dangerous pattern: ${name}`,
          });
        }
      }
    }
  } catch (err) {
    return {
      issues: [],
      error: `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { issues };
}

export function formatReviewSummary(results: ReviewResult[]): string {
  const allIssues = results.flatMap((r) => r.issues);
  const errors = results.filter((r) => r.error).map((r) => r.error);

  if (allIssues.length === 0 && errors.length === 0) {
    return "Security review: no issues found.";
  }

  const lines: string[] = [];
  const critical = allIssues.filter((i) => i.severity === "critical");
  const high = allIssues.filter((i) => i.severity === "high");
  const medium = allIssues.filter((i) => i.severity === "medium");

  lines.push(`Security Review: ${allIssues.length} issue(s) found`);

  if (critical.length > 0) {
    lines.push(`  CRITICAL (${critical.length}):`);
    for (const issue of critical) {
      lines.push(`    ${issue.file}:${issue.line} — ${issue.message}`);
    }
  }
  if (high.length > 0) {
    lines.push(`  HIGH (${high.length}):`);
    for (const issue of high) {
      lines.push(`    ${issue.file}:${issue.line} — ${issue.message}`);
    }
  }
  if (medium.length > 0) {
    lines.push(`  MEDIUM (${medium.length}):`);
    for (const issue of medium) {
      lines.push(`    ${issue.file}:${issue.line} — ${issue.message}`);
    }
  }
  if (errors.length > 0) {
    lines.push(`  ERRORS (${errors.length}):`);
    for (const err of errors) {
      lines.push(`    ${err}`);
    }
  }

  return lines.join("\n");
}
