import { fileTools } from "./file";
import { editTools } from "./edit";
import { shellTools } from "./shell";
import { gitTools } from "./git";
import { searchTools } from "./search";
import { webTools } from "./web";
import { web3Tools } from "./web3";
import { memoryTools } from "./memory";
import { screenshotTools } from "./screenshot";
import { pinTools } from "./pin";
import { delegateTool } from "./delegate";

// Phase 4: Claude Code-level tools
import { globTool } from "./glob";
import { grepTool } from "./grep";
import { exactEditTool } from "./exact-edit";
import { taskTools } from "./tasks";
import { agentTool } from "./agent-delegate";
import { askTool } from "./ask";
import { cronTools } from "./cron";

export { PINNED_FILES } from "./pin";
export { getWorkspaceRoot, setWorkspaceRoot } from "./file";
export { setDelegationModel } from "./delegate";

export const allTools = {
  // File tools (readFile/read, writeFile/write, listFiles, treeView, getWorkspace, setWorkspace)
  ...fileTools,
  // Edit tools (replaceFileContent, multiReplaceFileContent)
  ...editTools,
  // Shell tools (runCommand/bash)
  ...shellTools,
  // Git tools (gitStatus, gitDiff, gitLog)
  ...gitTools,
  // Search tools (searchCodebase)
  ...searchTools,
  // Web tools (fetchUrl/webFetch, webSearch)
  ...webTools,
  // Web3 tools (readChain, sendTransaction, getSolanaBalance)
  ...web3Tools,
  // Memory tools (saveMemory, recallMemory)
  ...memoryTools,
  // Screenshot tools (takeScreenshot)
  ...screenshotTools,
  // Pin tools (pinFile, unpinFile, getPinnedFiles)
  ...pinTools,
  // Delegation tool (delegateTask)
  ...delegateTool,

  // Phase 4: Claude Code-parity tools
  glob: globTool,
  grep: grepTool,
  edit: exactEditTool,
  ...taskTools,
  agent: agentTool,
  ask: askTool,
  ...cronTools,
};
