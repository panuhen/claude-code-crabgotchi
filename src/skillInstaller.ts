import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Copies the bundled `skill/memefy/` directory into `~/.claude/skills/memefy/`
 * so Claude Code can discover and invoke it. Safe to run on every activation:
 * compares mtimes and only overwrites when the bundled copy is newer.
 */
export function installMemefySkill(context: vscode.ExtensionContext): string {
  const src = path.join(context.extensionPath, 'skill', 'memefy');
  const dst = path.join(os.homedir(), '.claude', 'skills', 'memefy');

  if (!fs.existsSync(src)) {
    console.warn(`[crabgotchi] bundled skill missing at ${src}`);
    return dst;
  }

  fs.mkdirSync(dst, { recursive: true });

  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dst, name);
    const fromStat = fs.statSync(from);
    if (!fromStat.isFile()) continue;

    let needCopy = true;
    if (fs.existsSync(to)) {
      const toStat = fs.statSync(to);
      needCopy = fromStat.mtimeMs > toStat.mtimeMs;
    }
    if (needCopy) {
      fs.copyFileSync(from, to);
      // render.sh must be executable
      if (name.endsWith('.sh')) fs.chmodSync(to, 0o755);
    }
  }

  return dst;
}
