import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabStateManager } from './crabState';

interface PatternMatch {
  pattern: RegExp;
  handler: (manager: CrabStateManager) => void;
  cooldown: number; // ms between triggers
}

export class TerminalWatcher {
  private disposables: vscode.Disposable[] = [];
  private stateManager: CrabStateManager;
  private lastTriggers: Map<string, number> = new Map();
  private errorCount: number = 0;
  private successCount: number = 0;
  private outputBuffer: string = '';
  private bufferTimer: NodeJS.Timeout | null = null;
  private fileWatcher: fs.FSWatcher | null = null;
  private lastFileSize: number = 0;

  private patterns: PatternMatch[] = [
    // Plan/Explore agents - curious (exclusive trigger for curious)
    {
      pattern: /"subagent_type"\s*:\s*"(Plan|Explore)"/i,
      handler: (m) => m.onQuestion(),
      cooldown: 3000
    },
    // Git success - excited!
    {
      pattern: /git commit|git push|committed|pushed to|pull request|PR created/i,
      handler: (m) => m.onMultipleSuccesses(),
      cooldown: 3000
    },
    // Tests passing - excited!
    {
      pattern: /tests? pass|all tests|✓.*test|passed.*tests|\d+ passing/i,
      handler: (m) => m.onMultipleSuccesses(),
      cooldown: 3000
    },
    // Success patterns - happy
    {
      pattern: /✓|completed|success(?:fully)?|done|created|wrote\s+\d+|file created|saved|updated/i,
      handler: (m) => {
        this.successCount++;
        if (this.successCount >= 3) {
          m.onMultipleSuccesses();
          this.successCount = 0;
        } else {
          m.onSuccess();
        }
        this.errorCount = 0;
      },
      cooldown: 2000
    },
    // Writing/editing code - happy
    {
      pattern: /Write|Edit|NotebookEdit|file has been|updated successfully/i,
      handler: (m) => m.onSuccess(),
      cooldown: 2000
    },
    // Actual errors from logs (not pattern matching on "error" word)
    {
      pattern: /"is_error"\s*:\s*true|"exitCode"\s*:\s*[1-9]/,
      handler: (m) => {
        this.errorCount++;
        if (this.errorCount >= 3) {
          m.onRepeatedErrors();
          this.errorCount = 0;
        } else {
          m.onError();
        }
        this.successCount = 0;
      },
      cooldown: 2000
    },
    // Tests failing - sad (keeping test-specific pattern)
    {
      pattern: /tests? fail|\d+ failing|✗.*test|FAIL\s/i,
      handler: (m) => m.onError(),
      cooldown: 2000
    },
    // Reading/exploring - thinking
    {
      pattern: /Read|Glob|Grep|searching|looking for|finding|exploring/i,
      handler: (m) => m.onThinking(),
      cooldown: 3000
    },
    // Web activities - thinking
    {
      pattern: /WebFetch|WebSearch|fetching|searching the web/i,
      handler: (m) => m.onThinking(),
      cooldown: 3000
    },
    // Thinking/planning patterns
    {
      pattern: /thinking|planning|analyzing|Let me|I'll|I will|considering/i,
      handler: (m) => m.onThinking(),
      cooldown: 5000
    },
    // Running commands - thinking
    {
      pattern: /Bash|running|executing|npm|yarn|pip|cargo|go run/i,
      handler: (m) => m.onThinking(),
      cooldown: 3000
    },
    // Installing/building - thinking
    {
      pattern: /install|build|compil|bundl|package/i,
      handler: (m) => m.onThinking(),
      cooldown: 5000
    },
    // Task/TodoWrite - thinking (but Plan/Explore agents handled above as curious)
    {
      pattern: /TodoWrite|todo|breaking down/i,
      handler: (m) => m.onThinking(),
      cooldown: 3000
    },
    // Question patterns - thinking
    {
      pattern: /\?$|asking|clarif|question|AskUser|what do you|how should/i,
      handler: (m) => m.onThinking(),
      cooldown: 3000
    },
    // Large output / surprise reactions
    {
      pattern: /\d{3,}\s+lines?|large\s+(?:file|output)|diff.*\+\d{2,}|unexpected|wow|whoa|interesting|that's a lot|huh|surprisingly|didn't expect|unusual|quite a few|more than expected|impressive|extensive|remarkable|turns out/i,
      handler: (m) => m.onSurprise(),
      cooldown: 10000
    },
    // Long session indicator
    {
      pattern: /context|tokens|summariz|compacting/i,
      handler: (m) => m.onLongSession(),
      cooldown: 30000
    }
  ];

  constructor(stateManager: CrabStateManager) {
    this.stateManager = stateManager;
  }

  public start(): void {
    // Watch terminal state changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTerminal(() => {
        // Terminal activity - show thinking
        this.stateManager.onThinking();
      })
    );

    // Watch for tasks completing
    this.disposables.push(
      vscode.tasks.onDidEndTask((e) => {
        if (e.execution.task.execution) {
          this.stateManager.onSuccess();
        }
      })
    );

    this.disposables.push(
      vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.exitCode === 0) {
          this.stateManager.onSuccess();
        } else if (e.exitCode !== undefined) {
          this.stateManager.onError();
        }
      })
    );

    // Watch for diagnostics (errors/warnings)
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics((e) => {
        for (const uri of e.uris) {
          const diagnostics = vscode.languages.getDiagnostics(uri);
          const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
          if (errors.length > 0) {
            this.stateManager.onError();
          }
        }
      })
    );

    // Watch for document saves (success indicator)
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(() => {
        this.stateManager.onSuccess();
      })
    );

    // Try to watch Claude Code log files
    this.watchClaudeLogFiles();
  }

  private watchClaudeLogFiles(): void {
    // Claude Code stores logs in ~/.claude/projects/
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');

    try {
      if (fs.existsSync(claudeDir)) {
        // Watch for changes in the Claude directory
        this.fileWatcher = fs.watch(claudeDir, { recursive: true }, (eventType, filename) => {
          if (filename && filename.endsWith('.jsonl')) {
            this.handleLogFileChange(path.join(claudeDir, filename));
          }
        });
      }
    } catch {
      // Log directory doesn't exist or not accessible - that's fine
      console.log('Claude log directory not found, using fallback triggers');
    }
  }

  private handleLogFileChange(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > this.lastFileSize) {
        // New content was added, read the tail
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(stats.size - this.lastFileSize);
        fs.readSync(fd, buffer, 0, buffer.length, this.lastFileSize);
        fs.closeSync(fd);

        const newContent = buffer.toString('utf8');
        this.processLogContent(newContent);
        this.lastFileSize = stats.size;
      }
    } catch {
      // File might be locked or deleted
    }
  }

  private processLogContent(content: string): void {
    const now = Date.now();

    // Drain energy on any Claude tool activity
    if (/"type"\s*:\s*"tool_use"/.test(content)) {
      this.stateManager.onActivity();
    }

    for (const { pattern, handler, cooldown } of this.patterns) {
      const patternKey = pattern.source;
      const lastTrigger = this.lastTriggers.get(patternKey) || 0;

      if (now - lastTrigger >= cooldown && pattern.test(content)) {
        this.lastTriggers.set(patternKey, now);
        handler(this.stateManager);
        break;
      }
    }
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
    }
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }
  }
}
