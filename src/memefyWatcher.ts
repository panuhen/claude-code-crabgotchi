import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CrabWebviewProvider } from './webviewProvider';

interface QueueEntry {
  ts: number;
  query: string;
  duration?: number;
}

/**
 * Watches `~/.claude/skills/memefy/queue.jsonl` for new entries appended by
 * the memefy Skill, fetches a GIF URL from Giphy, and tells the Crabgotchi
 * webview to overlay it on the crab.
 *
 * The queue file is append-only; we keep a byte offset and only read the
 * tail on each change event.
 */
export class MemefyWatcher {
  private webview: CrabWebviewProvider;
  private queueFile: string;
  private offset = 0;
  private watcher: fs.FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(webview: CrabWebviewProvider, skillDir: string) {
    this.webview = webview;
    this.queueFile = path.join(skillDir, 'queue.jsonl');
  }

  start() {
    try {
      fs.mkdirSync(path.dirname(this.queueFile), { recursive: true });
      // Touch the file so fs.watch has a target.
      if (!fs.existsSync(this.queueFile)) {
        fs.writeFileSync(this.queueFile, '');
      }
      // Skip everything that was already in the queue when we started.
      this.offset = fs.statSync(this.queueFile).size;

      this.watcher = fs.watch(this.queueFile, () => this.drain());
      // fs.watch is unreliable on some setups; poll as a backstop.
      this.pollTimer = setInterval(() => this.drain(), 1500);
    } catch (err) {
      console.error('[crabgotchi] memefy watcher failed to start:', err);
    }
  }

  dispose() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private drain() {
    if (!fs.existsSync(this.queueFile)) return;

    const stat = fs.statSync(this.queueFile);
    if (stat.size < this.offset) {
      // File was truncated/recreated — start fresh.
      this.offset = 0;
    }
    if (stat.size === this.offset) return;

    const fd = fs.openSync(this.queueFile, 'r');
    try {
      const len = stat.size - this.offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, this.offset);
      this.offset = stat.size;

      for (const line of buf.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const entry: QueueEntry = JSON.parse(line);
          // Don't await — let entries process in parallel and don't block the watcher.
          this.handle(entry).catch((e) =>
            console.error('[crabgotchi] memefy handle error:', e)
          );
        } catch (e) {
          console.warn('[crabgotchi] bad queue line:', line, e);
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  private async handle(entry: QueueEntry) {
    const config = vscode.workspace.getConfiguration('crabgotchi.memefy');
    if (!config.get<boolean>('enabled', true)) return;

    const apiKey = config.get<string>('giphyApiKey', '').trim();
    if (!apiKey) {
      vscode.window.showWarningMessage(
        'Memefy: set crabgotchi.memefy.giphyApiKey in Settings to enable GIFs.'
      );
      return;
    }

    const url = await this.fetchGifUrl(apiKey, entry.query);
    if (!url) return;

    this.webview.showMemefy({
      query: entry.query,
      url,
      duration: (entry.duration ?? config.get<number>('duration', 4)) * 1000,
    });
  }

  private async fetchGifUrl(apiKey: string, query: string): Promise<string | null> {
    const params = new URLSearchParams({
      api_key: apiKey,
      q: query,
      limit: '8',
      rating: 'pg-13',
    });
    const endpoint = `https://api.giphy.com/v1/gifs/search?${params}`;
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        console.warn('[crabgotchi] giphy responded', res.status);
        return null;
      }
      const json = (await res.json()) as { data?: Array<{ images?: { downsized_medium?: { url?: string }; original?: { url?: string } } }> };
      const hits = json.data ?? [];
      if (!hits.length) return null;
      const pick = hits[Math.floor(Math.random() * hits.length)];
      return (
        pick.images?.downsized_medium?.url ??
        pick.images?.original?.url ??
        null
      );
    } catch (e) {
      console.error('[crabgotchi] giphy fetch failed:', e);
      return null;
    }
  }
}
