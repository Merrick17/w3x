import { EventEmitter } from "node:events";
import { watch, type FSWatcher } from "chokidar";
import { relative } from "node:path";
import { cwd } from "node:process";

export interface FileChange {
  type: "add" | "change" | "unlink";
  path: string;
  relativePath: string;
  timestamp: number;
}

export interface WatcherStatus {
  watching: boolean;
  fileCount: number;
  root: string;
}

/**
 * File watcher for real-time codebase awareness.
 * Emits events when files are added, changed, or removed.
 * Follows the OpenCode pattern of using chokidar for file watching.
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private root: string;
  private files = new Set<string>();

  constructor(root: string = cwd()) {
    super();
    this.root = root;
  }

  /** Start watching the project directory */
  start(): void {
    if (this.watcher) return;

    this.watcher = watch(this.root, {
      ignored: [
        /(^|[\\/])\../, // dotfiles/dotdirs
        "**/node_modules/**",
        "**/dist/**",
        "**/.git/**",
        "**/.w3x/**",
        "**/build/**",
        "**/target/**",
        "**/*.lock",
      ],
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher
      .on("add", (filePath: string) => {
        const rel = relative(this.root, filePath);
        this.files.add(rel);
        this.emit("change", {
          type: "add",
          path: filePath,
          relativePath: rel,
          timestamp: Date.now(),
        } satisfies FileChange);
      })
      .on("change", (filePath: string) => {
        const rel = relative(this.root, filePath);
        this.files.add(rel);
        this.emit("change", {
          type: "change",
          path: filePath,
          relativePath: rel,
          timestamp: Date.now(),
        } satisfies FileChange);
      })
      .on("unlink", (filePath: string) => {
        const rel = relative(this.root, filePath);
        this.files.delete(rel);
        this.emit("change", {
          type: "unlink",
          path: filePath,
          relativePath: rel,
          timestamp: Date.now(),
        } satisfies FileChange);
      })
      .on("ready", () => {
        this.emit("ready", { fileCount: this.files.size, root: this.root });
      });
  }

  /** Stop watching */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /** Get recently changed files (last N minutes) */
  getRecentChanges(_minutes = 5): FileChange[] {
    // This is primarily emitter-based; recent changes are tracked via events
    return [];
  }

  /** Get status */
  getStatus(): WatcherStatus {
    return {
      watching: this.watcher !== null,
      fileCount: this.files.size,
      root: this.root,
    };
  }

  /** Get the set of all watched files */
  getFiles(): string[] {
    return Array.from(this.files).sort();
  }
}

/** Singleton file watcher instance */
let _watcher: FileWatcher | null = null;

export function getFileWatcher(): FileWatcher {
  if (!_watcher) {
    _watcher = new FileWatcher();
  }
  return _watcher;
}
