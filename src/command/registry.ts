import type { CommandDef } from '../types';

// ─── Command Registry ────────────────────────────────────────────────────────
export const COMMAND_REGISTRY: CommandDef[] = [
  {
    name: '/plan',
    aliases: ['/p'],
    description: 'Decompose a task into numbered steps without executing',
    usage: '/plan <task description>',
    taskType: 'planning',
    systemPromptSuffix: `
TASK MODE: PLANNING
Your only job is to produce a structured, numbered plan. DO NOT write code or edit files.
Output format:
1. Step description (tool hints: readFile, searchCodebase, etc.)
2. ...
End with an estimated step count and any risks/assumptions.
`,
  },
  {
    name: '/code',
    aliases: ['/c'],
    description: 'Write or generate new code files',
    usage: '/code <description of what to implement>',
    taskType: 'coding',
    systemPromptSuffix: `
TASK MODE: CODE GENERATION
Focus on writing clean, typed, production-quality code.
Always: read existing files first, check imports, write complete implementations.
After writing: verify by reading the file back and checking for obvious errors.
`,
  },
  {
    name: '/edit',
    aliases: ['/e'],
    description: 'Surgically edit a specific file',
    usage: '/edit <filepath> — <what to change>',
    taskType: 'coding',
    systemPromptSuffix: `
TASK MODE: SURGICAL EDIT
Steps:
1. readFile to get current content
2. glob/grep to understand structure
3. Use replaceFileContent for targeted changes (preferred over writeFile)
4. Read the file back to verify
5. Show a brief diff summary of what changed
`,
  },
  {
    name: '/refactor',
    aliases: ['/rf'],
    description: 'Refactor a file or module with git safety',
    usage: '/refactor <filepath or module>',
    taskType: 'planning',
    systemPromptSuffix: `
TASK MODE: REFACTOR
Steps:
1. gitStatus to check for uncommitted changes
2. readFile and glob/grep to understand current structure
3. Plan refactor steps (do NOT execute without listing them first)
4. Apply changes incrementally using replaceFileContent
5. gitDiff to review all changes
6. Run tests if available (npm test / npx vitest)
`,
  },
  {
    name: '/search',
    aliases: ['/s'],
    description: 'Search the web and summarise results',
    usage: '/search <query>',
    taskType: 'search',
    systemPromptSuffix: `
TASK MODE: WEB SEARCH
Use the webSearch tool to find relevant information.
Summarise findings concisely. Include source URLs.
If looking for documentation, also use fetchUrl to get the actual docs page.
`,
  },
  {
    name: '/review',
    aliases: ['/rv'],
    description: 'Review current git diff and give feedback',
    usage: '/review',
    taskType: 'planning',
    systemPromptSuffix: `
TASK MODE: CODE REVIEW
1. gitStatus to see what changed
2. gitDiff to see the full diff
3. Analyse: correctness, types, edge cases, naming, architecture
4. Give numbered feedback items: [CRITICAL] / [SUGGESTION] / [NITPICK]
5. Suggest fixes for CRITICAL items
`,
  },
  {
    name: '/test',
    aliases: ['/t'],
    description: 'Run tests and analyse failures',
    usage: '/test [test file or pattern]',
    taskType: 'fast',
    systemPromptSuffix: `
TASK MODE: TEST RUNNER
1. runCommand to execute tests (npm test / npx vitest / npx jest)
2. If failures: readFile the failing test files
3. Identify root cause of each failure
4. Suggest or apply fixes
5. Re-run to confirm fixes
`,
  },
  {
    name: '/commit',
    aliases: ['/cm'],
    description: 'Stage all changes and create a git commit',
    usage: '/commit <message>',
    taskType: 'fast',
    systemPromptSuffix: `
TASK MODE: GIT COMMIT
1. gitStatus to confirm there are changes
2. gitDiff to review what will be committed
3. Run: git add -A && git commit -m "<message>"
SAFETY: Never force-push. Never amend public commits.
`,
  },
  {
    name: '/cd',
    aliases: ['/workspace', '/open'],
    description: "Switch the agent's working directory to another project",
    usage: '/cd <absolute path>',
    taskType: 'fast',
    systemPromptSuffix: `
TASK MODE: WORKSPACE SWITCH
Use the setWorkspace tool to change the current directory.
After switching, use treeView to confirm you can see the new files.
`,
  },
  {
    name: '/vision',
    aliases: ['/see', '/screenshot'],
    description: "Capture a screenshot of your application to 'see' the UI",
    usage: '/vision <url>',
    taskType: 'fast',
    systemPromptSuffix: `
TASK MODE: VISION ANALYSIS
Use the takeScreenshot tool to capture the UI.
Analyze the visual layout and suggest improvements or confirm it matches requirements.
`,
  },
  {
    name: '/pin',
    aliases: ['/add'],
    description: "Pin a file to the active conversation context",
    usage: '/pin <path>',
    taskType: 'fast',
    systemPromptSuffix: `
TASK MODE: CONTEXT PINNING
Use the pinFile tool to add the file to the context.
Confirm to the user that the file is now pinned.
`,
  },
  {
    name: '/config',
    aliases: ['/cfg'],
    description: "View or modify the current configuration",
    usage: '/config [key] [value]',
    taskType: 'fast',
    systemPromptSuffix: `
TASK MODE: CONFIGURATION
Display the current merged settings.
If a key is provided without a value, show just that key.
If both key and value are provided, suggest the user update the settings file.
`,
  },
  {
    name: '/security-review',
    aliases: ['/sec', '/audit'],
    description: "Scan recent changes for security issues: secrets, dangerous patterns, injection risks",
    usage: '/security-review',
    taskType: 'fast',
    systemPromptSuffix: `
TASK MODE: SECURITY REVIEW
Steps:
1. Use glob to find recently modified files (src/**/*.ts, src/**/*.tsx)
2. Use read to check each file's content
3. Flag any of these security issues:
   - Hardcoded secrets (API keys, private keys, tokens)
   - Dangerous patterns: eval(), new Function(), innerHTML assignment
   - Command injection risks: exec() with string concatenation
   - SQL injection: raw string concatenation with SQL keywords
   - Unsafe path resolution (path traversal)
4. Report findings grouped by severity: CRITICAL > HIGH > MEDIUM > LOW
5. If no issues, report \"No security issues found\"`,
  },
];

/** Look up a command by its primary name or alias */
export function findCommand(input: string): CommandDef | undefined {
  const token = input.toLowerCase().split(/\s+/)[0];
  return COMMAND_REGISTRY.find(
    c => c.name === token || c.aliases.includes(token)
  );
}
