import { streamText, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import { ToolRegistry } from './tool-registry';
import type { Plan, PlanStep, CLIEvent } from '../types';

// ─── Executor ─────────────────────────────────────────────────────────────────

const EXECUTOR_PREFIX = `You are executing a specific step in a structured plan.
Focus ONLY on the current step. Use the tool hints as guidance.
Be concise and precise. After completing the step, confirm what was done.`;

export class Executor {
  constructor(
    private model: LanguageModel,
    private maxStepsPerTask = 8,
  ) {}

  /**
   * Execute a full plan, yielding CLIEvents for each step.
   * Emits plan-step-start / plan-step-done around each step.
   */
  async *execute(plan: Plan, systemBase: string): AsyncGenerator<CLIEvent> {
    for (const step of plan.steps) {
      yield { type: 'plan-step-start', step: { ...step, status: 'running' } };

      const stepPrompt = this.buildStepPrompt(step, plan);
      let success = true;

      try {
        const result = streamText({
          model: this.model,
          system: `${EXECUTOR_PREFIX}\n\n${systemBase}`,
          messages: [{ role: 'user', content: stepPrompt }],
          tools: ToolRegistry.getTools(),
          stopWhen: stepCountIs(this.maxStepsPerTask),
        });

        for await (const event of result.fullStream) {
          switch (event.type) {
            case 'text-delta':
              yield { type: 'text', content: event.text };
              break;
            case 'reasoning-delta':
              yield { type: 'thinking', content: event.text };
              break;
            case 'tool-call': {
              const streamEvent = event as { input?: unknown; args?: unknown };
              const input = streamEvent.input ?? streamEvent.args ?? {};
              const toolArgs = typeof input === 'object' && input !== null
                ? input as Record<string, unknown>
                : {};
              yield { type: 'step-start', toolName: event.toolName, args: toolArgs };
              break;
            }
            case 'tool-result': {
              const output = typeof event.output === 'string'
                ? event.output
                : JSON.stringify(event.output);
              const ok = !output.includes('"error"') && !output.includes('"success":false');
              if (!ok) success = false;
              yield { type: 'step-end', toolName: event.toolName, success: ok, output: output.slice(0, 2000) };
              break;
            }
            case 'error': {
              success = false;
              const msg = typeof event.error === 'object' && event.error && 'message' in event.error
                ? String((event.error as { message?: unknown }).message).slice(0, 200)
                : String(event.error).slice(0, 200);
              yield { type: 'error', message: msg };
              break;
            }
          }
        }

      } catch (err) {
        success = false;
        const msg = (err instanceof Error ? err.message : String(err)).slice(0, 200);
        yield { type: 'error', message: `Step ${step.id} failed: ${msg}` };
      }

      yield { type: 'plan-step-done', stepId: step.id, success };

      // Abort remaining steps on critical failure
      if (!success) {
        yield { type: 'log', level: 'warn', message: `Stopping plan execution after step ${step.id} failed` };
        break;
      }
    }
  }

  private buildStepPrompt(step: PlanStep, plan: Plan): string {
    const hints = step.toolHints.length > 0
      ? `\nSuggested tools: ${step.toolHints.join(', ')}`
      : '';
    const deps = step.dependsOn && step.dependsOn.length > 0
      ? `\nDepends on completed steps: ${step.dependsOn.join(', ')}`
      : '';
    const progress = `\nPlan progress: step ${plan.steps.findIndex(s => s.id === step.id) + 1} of ${plan.steps.length}`;

    return `Overall goal: ${plan.goal}\n\nCurrent step [${step.id}]: ${step.description}${hints}${deps}${progress}\n\nExecute this step now.`;
  }
}
