import { tool } from "ai";
import { z } from "zod/v4";

export interface Task {
  id: string;
  status: "pending" | "in_progress" | "completed" | "deleted";
  subject: string;
  description: string;
  blocks: string[];
  blockedBy: string[];
  createdAt: number;
}

const tasks = new Map<string, Task>();
let nextId = 1;

export const taskTools = {
  taskCreate: tool({
    description:
      "Create a new task for tracking work. Tasks support dependencies (blocks/blockedBy) for ordering.",
    inputSchema: z.object({
      subject: z.string().describe("Brief, actionable title in imperative form"),
      description: z.string().describe("What needs to be done"),
      blockedBy: z
        .array(z.string())
        .optional()
        .describe("Task IDs that must complete before this one can start"),
    }),
    execute: async ({
      subject,
      description,
      blockedBy,
    }: {
      subject: string;
      description: string;
      blockedBy?: string[];
    }) => {
      const id = String(nextId++);
      const task: Task = {
        id,
        status: "pending",
        subject,
        description,
        blocks: [],
        blockedBy: blockedBy ?? [],
        createdAt: Date.now(),
      };

      for (const depId of task.blockedBy) {
        const dep = tasks.get(depId);
        if (dep) {
          dep.blocks.push(id);
        }
      }

      tasks.set(id, task);
      return { task, message: `Task #${id} created: ${subject}` };
    },
  }),

  taskUpdate: tool({
    description: "Update a task's status or dependencies. Use status='deleted' to remove.",
    inputSchema: z.object({
      taskId: z.string().describe("The task ID to update"),
      status: z
        .enum(["pending", "in_progress", "completed", "deleted"])
        .optional()
        .describe("New status"),
      addBlockedBy: z.array(z.string()).optional().describe("Add task IDs this depends on"),
    }),
    execute: async ({
      taskId,
      status,
      addBlockedBy,
    }: {
      taskId: string;
      status?: "pending" | "in_progress" | "completed" | "deleted";
      addBlockedBy?: string[];
    }) => {
      const task = tasks.get(taskId);
      if (!task) {
        return { success: false, error: `Task #${taskId} not found` };
      }

      if (status) {
        task.status = status;
      }
      if (addBlockedBy) {
        for (const depId of addBlockedBy) {
          if (!task.blockedBy.includes(depId)) {
            task.blockedBy.push(depId);
            const dep = tasks.get(depId);
            if (dep && !dep.blocks.includes(taskId)) {
              dep.blocks.push(taskId);
            }
          }
        }
      }

      return { success: true, task };
    },
  }),

  taskList: tool({
    description: "List all tasks with their status and dependencies.",
    inputSchema: z.object({}),
    execute: async () => {
      const all = Array.from(tasks.values()).filter((t) => t.status !== "deleted");
      return {
        tasks: all.sort((a, b) => a.createdAt - b.createdAt),
        count: all.length,
      };
    },
  }),

  taskGet: tool({
    description: "Get full details for a specific task including its dependency graph.",
    inputSchema: z.object({
      taskId: z.string().describe("The task ID"),
    }),
    execute: async ({ taskId }: { taskId: string }) => {
      const task = tasks.get(taskId);
      if (!task) {
        return { success: false, error: `Task #${taskId} not found` };
      }
      return {
        task,
        blockedBy: task.blockedBy.map((id) => tasks.get(id)?.subject ?? `#${id}`),
        blocks: task.blocks.map((id) => tasks.get(id)?.subject ?? `#${id}`),
      };
    },
  }),
};
