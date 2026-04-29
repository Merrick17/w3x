import { tool } from "ai";
import { z } from "zod";
import * as fs from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { execaCommand } from "execa";

const WS = cwd();

export const screenshotTools = {
  takeScreenshot: tool({
    description: "Capture a screenshot of a local web application or website using Playwright.",
    inputSchema: z.object({
      url: z.string().describe("URL to capture (e.g., http://localhost:3000)"),
      output: z.string().optional().describe("Output filename (default: .w3x/screenshot.png)"),
    }),
    execute: async ({ url, output }: { url: string; output?: string }) => {
      const filename = output || ".w3x/screenshot.png";
      const fullPath = resolve(WS, filename);
      await fs.mkdir(resolve(WS, ".w3x"), { recursive: true });
      const cmd = `npx playwright screenshot ${url} "${fullPath}"`;
      const isWindows = process.platform === "win32";
      const r = await execaCommand(cmd, {
        cwd: WS,
        shell: isWindows ? "powershell" : true,
        reject: false,
      });
      return {
        success: r.exitCode === 0,
        message:
          r.exitCode === 0 ? `Screenshot saved to ${filename}` : `Failed: ${r.stderr || r.stdout}`,
        path: filename,
      };
    },
  }),
};
