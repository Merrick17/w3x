import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import type { Plan, PlanStep } from '../types';

// ─── Planner ──────────────────────────────────────────────────────────────────

const PLANNER_SYSTEM = `You are a senior software engineering task planner.
Your ONLY job is to decompose a given goal into a clear, ordered list of actionable steps.

Output STRICT JSON with this shape:
{
  "goal": "<the original goal>",
  "estimatedSteps": <number>,
  "steps": [
    {
      "id": "step-1",
      "description": "<clear, specific action>",
      "toolHints": ["<tool name>", ...],
      "dependsOn": []
    }
  ]
}

Rules:
- Steps must be concrete and executable by a coding agent.
- toolHints must be valid tool names: read, write, edit, readFile, writeFile, replaceFileContent, multiReplaceFileContent, listFiles, searchCodebase, glob, grep, bash, runCommand, gitStatus, gitDiff, gitLog, fetchUrl, webFetch, webSearch, treeView, readChain, saveMemory, recallMemory, taskCreate, taskUpdate, agent, delegateTask.
- dependsOn must reference prior step IDs when ordering matters.
- Maximum 15 steps.
- NO prose outside the JSON block.`;

function formatPlanMarkdown(plan: Plan): string {
  const lines: string[] = [
    `# Plan: ${plan.goal}`,
    "",
    `**Created**: ${new Date(plan.createdAt).toISOString()}`,
    `**Estimated Steps**: ${plan.estimatedSteps}`,
    "",
    "## Steps",
    "",
  ];

  for (const step of plan.steps) {
    const deps = step.dependsOn?.length
      ? ` _(depends on: ${step.dependsOn.join(", ")})_`
      : "";
    lines.push(`${step.id}. **${step.description}**${deps}`);
    if (step.toolHints.length > 0) {
      lines.push(`   Tools: ${step.toolHints.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export class Planner {
  constructor(private model: LanguageModel) {}

  async plan(goal: string): Promise<Plan> {
    const { text } = await generateText({
      model: this.model,
      system: PLANNER_SYSTEM,
      prompt: `Goal: ${goal}`,
      maxOutputTokens: 2000,
    });

    const plan = this.parse(text, goal);
    await this.persistPlan(plan);
    return plan;
  }

  private async persistPlan(plan: Plan): Promise<void> {
    try {
      const plansDir = join(cwd(), ".w3x", "plans");
      await mkdir(plansDir, { recursive: true });

      const id = randomUUID().slice(0, 8);
      const filename = `${id}.md`;
      const markdown = formatPlanMarkdown(plan);

      await writeFile(join(plansDir, filename), markdown, "utf-8");
      plan.id = id;
    } catch {
      // plan persistence is best-effort, not critical
    }
  }

  private parse(raw: string, goal: string): Plan {
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

    try {
      const parsed = JSON.parse(jsonStr) as {
        goal?: string;
        estimatedSteps?: number;
        steps?: Array<{
          id?: string;
          description?: string;
          toolHints?: string[];
          dependsOn?: string[];
        }>;
      };

      const steps: PlanStep[] = (parsed.steps ?? []).map((s, i) => ({
        id: s.id ?? `step-${i + 1}`,
        description: s.description ?? `Step ${i + 1}`,
        toolHints: s.toolHints ?? [],
        dependsOn: s.dependsOn ?? [],
        status: 'pending',
      }));

      return {
        goal: parsed.goal ?? goal,
        steps,
        estimatedSteps: parsed.estimatedSteps ?? steps.length,
        createdAt: Date.now(),
      };
    } catch {
      // Fallback: parse numbered lines
      const lines = raw.split('\n').filter(l => /^\d+\./.test(l.trim()));
      const steps: PlanStep[] = lines.map((l, i) => ({
        id: `step-${i + 1}`,
        description: l.replace(/^\d+\.\s*/, '').trim(),
        toolHints: [],
        status: 'pending',
      }));

      return {
        goal,
        steps: steps.length > 0 ? steps : [{ id: 'step-1', description: goal, toolHints: [], status: 'pending' }],
        estimatedSteps: steps.length,
        createdAt: Date.now(),
      };
    }
  }
}
