import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
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
  private fileSizes: Map<string, number> = new Map(); // Track size per file
  private pollTimer: NodeJS.Timeout | null = null;
  private claudeProjectDir: string | null = null;

  private patterns: PatternMatch[] = [
    // Ferris easter egg - lovestruck (fellow crab!) - only from user messages
    {
      pattern: /"role"\s*:\s*"user"\s*,\s*"content"\s*:\s*"[^"]*\bferris\b/i,
      handler: (m) => m.onLovestruck(),
      cooldown: 10000
    },
    // Claude easter egg - proud of creator! - only from user messages
    {
      pattern: /"role"\s*:\s*"user"\s*,\s*"content"\s*:\s*"[^"]*\bclaude\b/i,
      handler: (m) => m.onClaudeFan(),
      cooldown: 10000
    },
    // Plan/Explore agents - curious (exclusive trigger for curious)
    {
      pattern: /"subagent_type"\s*:\s*"(Plan|Explore)"/i,
      handler: (m) => m.onQuestion(),
      cooldown: 3000
    },
    // Force push - "USE THE FORCE" easter egg
    {
      pattern: /"command":\s*"[^"]*git push[^"]*(?:--force|-f)/i,
      handler: (m) => {
        const username = this.getUsername();
        m.onForcePush(username);
      },
      cooldown: 5000
    },
    // Git commit - "ALL YOUR CODE ARE BELONG TO" easter egg
    {
      pattern: /"command":\s*"[^"]*git commit\s+-/i,
      handler: (m) => {
        const branch = this.getBranch();
        m.onCommit(branch);
      },
      cooldown: 5000
    },
    // Git success (push, PR) - surprised!
    {
      pattern: /git push|pushed to|pull request|PR created/i,
      handler: (m) => m.onSurprise(),
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
        if (this.errorCount >= 5) {
          // 5+ errors: angry + stress poop!
          m.onRepeatedErrors();
          m.addPoop();
          this.errorCount = 0;
        } else if (this.errorCount >= 3) {
          // 3+ errors: just angry
          m.onRepeatedErrors();
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
  ];

  constructor(stateManager: CrabStateManager) {
    this.stateManager = stateManager;
  }

  private getUsername(): string {
    try {
      // Try git config first
      const gitName = execSync('git config user.name', { encoding: 'utf8', timeout: 2000 }).trim();
      if (gitName) return gitName;
    } catch {
      // Git config failed
    }

    try {
      // Try GitHub CLI
      const ghUser = execSync('gh api user --jq .login', { encoding: 'utf8', timeout: 5000 }).trim();
      if (ghUser) return ghUser;
    } catch {
      // gh CLI not available or not authenticated
    }

    return 'JEDI';
  }

  private getBranch(): string {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 2000 }).trim();
      if (branch) return branch;
    } catch {
      // Git command failed
    }
    return 'MAIN';
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

  private getClaudeProjectDir(): string | null {
    // Check for custom path setting first
    const config = vscode.workspace.getConfiguration('crabgotchi');
    const customPath = config.get<string>('claudeLogsPath', '');

    let claudeBase: string;

    console.log('Crabgotchi: Custom path setting:', customPath);

    // Default to native path
    claudeBase = path.join(os.homedir(), '.claude', 'projects');

    if (customPath) {
      // Normalize path - try both backslash and forward slash versions
      const normalizedPath = customPath.replace(/\\/g, '/');
      const pathsToTry = [customPath, normalizedPath];

      for (const tryPath of pathsToTry) {
        try {
          fs.accessSync(tryPath, fs.constants.R_OK);
          claudeBase = tryPath;
          console.log('Crabgotchi: Using custom path:', claudeBase);
          break;
        } catch (e) {
          console.log('Crabgotchi: Path not accessible:', tryPath, e);
        }
      }
    } else {
      // Claude Code stores logs in ~/.claude/projects/{sanitized-workspace-path}/
      // First try native path
      claudeBase = path.join(os.homedir(), '.claude', 'projects');

      // On Windows, also check WSL paths if native path doesn't exist
      if (!fs.existsSync(claudeBase) && process.platform === 'win32') {
        console.log('Crabgotchi: Native path not found, trying WSL...');
        claudeBase = this.findWslClaudePath() || claudeBase;
      }
    }

    console.log('Crabgotchi: Final claudeBase:', claudeBase);

    if (!fs.existsSync(claudeBase)) {
      console.log('Crabgotchi: claudeBase does not exist');
      return null;
    }

    // Get current workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      // Claude sanitizes paths: /home/user/project -> -home-user-project
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const sanitizedPath = workspacePath.replace(/\//g, '-').replace(/\\/g, '-');
      const projectDir = path.join(claudeBase, sanitizedPath);

      if (fs.existsSync(projectDir)) {
        return projectDir;
      }
    }

    // Fallback: watch the entire projects directory
    return claudeBase;
  }

  private findWslClaudePath(): string | null {
    try {
      // Get list of installed WSL distros
      const { execSync } = require('child_process');
      const distroOutput = execSync('wsl -l -q', { encoding: 'utf16le', timeout: 5000 }).trim();
      const distros = distroOutput.split('\n').map((d: string) => d.trim()).filter((d: string) => d.length > 0);

      const wslRoots = ['\\\\wsl.localhost', '\\\\wsl$'];

      for (const wslRoot of wslRoots) {
        for (const distro of distros) {
          try {
            const homePath = path.join(wslRoot, distro, 'home');
            if (!fs.existsSync(homePath)) continue;

            // List users in /home and find one with .claude
            const users = fs.readdirSync(homePath);
            for (const user of users) {
              const claudePath = path.join(homePath, user, '.claude', 'projects');
              if (fs.existsSync(claudePath)) {
                console.log('Found Claude logs in WSL:', claudePath);
                return claudePath;
              }
            }
          } catch {
            // Skip inaccessible paths
          }
        }
      }
    } catch {
      // WSL not available or command failed
    }
    return null;
  }

  private watchClaudeLogFiles(): void {
    this.claudeProjectDir = this.getClaudeProjectDir();

    if (!this.claudeProjectDir) {
      console.log('Crabgotchi: Claude log directory not found, using fallback triggers');
      return;
    }

    console.log('Crabgotchi: Watching directory:', this.claudeProjectDir);

    // Initialize file sizes to current sizes (don't process old content on reload)
    this.initializeFileSizes(this.claudeProjectDir);

    // Use polling for cross-platform reliability (fs.watch recursive is unreliable on Linux)
    this.pollTimer = setInterval(() => {
      this.pollLogFiles();
    }, 1000); // Poll every second

    // Also listen for workspace changes
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.claudeProjectDir = this.getClaudeProjectDir();
      })
    );
  }

  private initializeFileSizes(dir: string): void {
    // Set current file sizes so we only process NEW content after reload
    if (!fs.existsSync(dir)) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.initializeFileSizes(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const stats = fs.statSync(fullPath);
          this.fileSizes.set(fullPath, stats.size);
        }
      }
    } catch {
      // Ignore errors during initialization
    }
  }

  private pollLogFiles(): void {
    if (!this.claudeProjectDir) return;

    try {
      this.scanDirectory(this.claudeProjectDir);
    } catch {
      // Directory might not exist yet
    }
  }

  private scanDirectory(dir: string): void {
    try {
      if (!fs.existsSync(dir)) {
        console.log('Crabgotchi: Directory does not exist:', dir);
        return;
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Recurse into subdirectories (for subagents/)
          this.scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          this.checkFileForChanges(fullPath);
        }
      }
    } catch (e) {
      console.log('Crabgotchi: Error scanning directory:', dir, e);
    }
  }

  private checkFileForChanges(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      const lastSize = this.fileSizes.get(filePath) || 0;

      if (stats.size > lastSize) {
        console.log('Crabgotchi: New content in', filePath, '- reading', stats.size - lastSize, 'bytes');
        // New content was added, read only the new part
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(stats.size - lastSize);
        fs.readSync(fd, buffer, 0, buffer.length, lastSize);
        fs.closeSync(fd);

        const newContent = buffer.toString('utf8');
        this.processLogContent(newContent);
        this.fileSizes.set(filePath, stats.size);
      }
    } catch (e) {
      console.log('Crabgotchi: Error checking file:', filePath, e);
    }
  }

  private processLogContent(content: string): void {
    const now = Date.now();

    // Drain energy on Claude tool activity
    if (/"type"\s*:\s*"tool_use"/.test(content)) {
      this.stateManager.onActivity();
    }

    // Token-based energy drain: parse output_tokens from log entries
    // Drain -1 per 5000 output tokens, capped at -6
    const lines = content.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const outputTokens = entry?.message?.usage?.output_tokens;
        if (outputTokens && outputTokens > 0) {
          const drain = Math.min(6, Math.floor(outputTokens / 5000));
          if (drain > 0) {
            this.stateManager.onTokenUsage(drain);
          }
        }
      } catch {
        // Not valid JSON, skip
      }
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
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }
}
