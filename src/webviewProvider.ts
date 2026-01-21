import * as vscode from 'vscode';
import { CrabStateManager, CrabState } from './crabState';
import { getEmotionFrames, emotionLabels, Emotion } from './ascii/crabArt';

export class CrabWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeCrab.tamagotchi';

  private view?: vscode.WebviewView;
  private stateManager: CrabStateManager;
  private animationFrame: number = 0;
  private animationTimer?: NodeJS.Timeout;

  constructor(
    private readonly extensionUri: vscode.Uri,
    stateManager: CrabStateManager
  ) {
    this.stateManager = stateManager;

    // Listen for state changes
    this.stateManager.onStateChange((state) => {
      this.updateWebview(state);
    });

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('crabgotchi')) {
        // Reload webview with new colors
        if (this.view) {
          this.view.webview.html = this.getHtmlContent();
          this.updateWebview(this.stateManager.getState());
        }
      }
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlContent();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'feed':
          this.stateManager.feed();
          break;
        case 'pet':
          this.stateManager.pet();
          break;
        case 'setEmotion':
          this.stateManager.setEmotion(message.emotion as Emotion, 10000);
          break;
        case 'setColor':
          const colorConfig = vscode.workspace.getConfiguration('crabgotchi');
          colorConfig.update(message.setting, message.color, vscode.ConfigurationTarget.Global);
          break;
        case 'setSetting':
          const settingConfig = vscode.workspace.getConfiguration('crabgotchi');
          settingConfig.update(message.setting, message.value, vscode.ConfigurationTarget.Global);
          break;
        case 'timerComplete':
          vscode.window.showInformationMessage('🦀 Time for a break! Your crab says: Take care of yourself!', 'OK', 'Snooze 5min')
            .then(selection => {
              if (selection === 'Snooze 5min' && this.view) {
                this.view.webview.postMessage({ type: 'snoozeTimer', minutes: 5 });
              }
            });
          this.stateManager.setEmotion('excited', 10000);
          break;
      }
    });

    // Start animation loop
    this.startAnimation();

    // Initial update
    this.updateWebview(this.stateManager.getState());
  }

  private startAnimation(): void {
    this.animationTimer = setInterval(() => {
      this.animationFrame++;
      this.updateWebview(this.stateManager.getState());
    }, 300);
  }

  private updateWebview(state: CrabState): void {
    if (!this.view) return;

    const frames = getEmotionFrames(state.emotion);
    const frameIndex = this.animationFrame % frames.length;
    const frame = frames[frameIndex];

    this.view.webview.postMessage({
      type: 'update',
      art: frame.art,  // Now an array of lines
      bubble: frame.bubble || '',
      emotion: emotionLabels[state.emotion],
      stats: state.stats
    });
  }

  private getColors(): { crabColor: string; bubbleColor: string } {
    const config = vscode.workspace.getConfiguration('crabgotchi');
    return {
      crabColor: config.get('crabColor', '#e5c07b'),
      bubbleColor: config.get('bubbleColor', '#e5c07b')
    };
  }

  private getTimerSettings(): { enabled: boolean; minutes: number } {
    const config = vscode.workspace.getConfiguration('crabgotchi');
    return {
      enabled: config.get('breakTimer.enabled', false),
      minutes: config.get('breakTimer.minutes', 25)
    };
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private getHtmlContent(): string {
    const colors = this.getColors();
    const crabGlow = this.hexToRgba(colors.crabColor, 0.3);
    const timer = this.getTimerSettings();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Crab</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Courier New', monospace;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground);
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }

    .crab-container {
      position: relative;
      text-align: center;
      margin-bottom: 20px;
    }

    .bubble {
      position: absolute;
      top: -10px;
      right: 10px;
      font-size: 20px;
      color: ${colors.bubbleColor};
      text-shadow:
        -1px -1px 0 #000,
        1px -1px 0 #000,
        -1px 1px 0 #000,
        1px 1px 0 #000;
      animation: float 1s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }

    .crab-art {
      font-size: 12px;
      line-height: 1.1;
      color: ${colors.crabColor};
      text-shadow: 0 0 10px ${crabGlow};
      font-family: monospace;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .crab-line {
      white-space: pre;
    }

    .emotion-label {
      font-size: 16px;
      font-weight: bold;
      margin: 10px 0;
      color: var(--vscode-textLink-foreground);
    }

    .stats-container {
      width: 100%;
      max-width: 200px;
      margin-top: 20px;
      font-family: monospace;
    }

    .stat {
      margin: 6px 0;
      font-size: 12px;
    }

    .stat-name {
      display: inline-block;
      width: 70px;
    }

    .stat-bar.good {
      color: var(--vscode-terminal-ansiGreen, #98c379);
    }

    .stat-bar.medium {
      color: var(--vscode-terminal-ansiYellow, #e5c07b);
    }

    .stat-bar.low {
      color: var(--vscode-terminal-ansiRed, #e06c75);
    }

    .buttons {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }

    button {
      padding: 8px 16px;
      font-family: inherit;
      font-size: 12px;
      border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder));
      border-radius: 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      transition: background 0.2s;
    }

    button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .test-section {
      margin-top: 20px;
      width: 100%;
      max-width: 220px;
    }

    .test-label {
      font-size: 11px;
      opacity: 0.7;
      margin-bottom: 8px;
      text-align: center;
    }

    .emotion-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
    }

    .emotion-buttons button {
      padding: 4px 8px;
      font-size: 10px;
    }

    .credits {
      margin-top: auto;
      padding-top: 20px;
      font-size: 10px;
      opacity: 0.6;
    }

    .settings-toggle {
      margin-top: 20px;
      font-size: 11px;
      opacity: 0.6;
      cursor: pointer;
      user-select: none;
    }

    .settings-toggle:hover {
      opacity: 1;
    }

    .settings-content {
      display: none;
      margin-top: 10px;
      width: 100%;
      max-width: 220px;
    }

    .settings-content.open {
      display: block;
    }

    .color-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0;
    }

    .color-label {
      font-size: 11px;
      width: 50px;
      opacity: 0.7;
    }

    .color-swatches {
      display: flex;
      gap: 4px;
    }

    .color-swatch {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      transition: transform 0.1s, border-color 0.1s;
    }

    .color-swatch:hover {
      transform: scale(1.2);
    }

    .color-swatch.selected {
      border-color: #fff;
    }

    .stat.timer-stat {
      display: none;
      cursor: pointer;
    }

    .stat.timer-stat:hover {
      opacity: 0.8;
    }

    .stat.timer-stat.enabled {
      display: block;
    }

    .stat.timer-stat.completed {
      opacity: 0.4;
    }

    .timer-bar-running {
      color: var(--vscode-terminal-ansiGreen, #98c379);
    }

    .timer-bar-low {
      color: var(--vscode-terminal-ansiRed, #e06c75);
    }

    .timer-bar-medium {
      color: var(--vscode-terminal-ansiYellow, #e5c07b);
    }

    .timer-settings-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 8px 0;
    }

    .timer-icon-btn {
      cursor: pointer;
      opacity: 0.6;
      font-size: 12px;
    }

    .timer-icon-btn:hover {
      opacity: 1;
    }

    .timer-checkbox {
      cursor: pointer;
    }

    .timer-input {
      width: 50px;
      padding: 2px 4px;
      font-family: monospace;
      font-size: 11px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <div class="crab-container">
    <div class="bubble" id="bubble"></div>
    <div class="crab-art" id="crab-art">
      <div class="crab-line">Loading...</div>
    </div>
  </div>

  <div class="emotion-label" id="emotion">Waking up...</div>

  <div class="stats-container">
    <div class="stat">
      <span class="stat-name">Food</span>
      <span class="stat-bar" id="hunger-bar">[----------]</span>
    </div>
    <div class="stat">
      <span class="stat-name">Happy</span>
      <span class="stat-bar" id="happiness-bar">[----------]</span>
    </div>
    <div class="stat">
      <span class="stat-name">Energy</span>
      <span class="stat-bar" id="energy-bar">[----------]</span>
    </div>
    <div class="stat timer-stat${timer.enabled ? ' enabled' : ''}" id="timer-stat" title="Click to start/pause">
      <span class="stat-name" id="timer-label">Break</span>
      <span class="stat-bar" id="timer-bar">[##########]</span>
    </div>
  </div>

  <div class="buttons">
    <button id="feed-btn">Feed</button>
    <button id="pet-btn">Pet</button>
  </div>

  <div class="test-section">
    <div class="test-label">Test Emotions</div>
    <div class="emotion-buttons">
      <button data-emotion="neutral">Neutral</button>
      <button data-emotion="happy">Happy</button>
      <button data-emotion="excited">Excited</button>
      <button data-emotion="curious">Curious</button>
      <button data-emotion="thinking">Thinking</button>
      <button data-emotion="sad">Sad</button>
      <button data-emotion="tired">Tired</button>
      <button data-emotion="hungry">Hungry</button>
      <button data-emotion="angry">Angry</button>
      <button data-emotion="surprised">Surprised</button>
    </div>
  </div>

  <div class="settings-toggle" id="settings-toggle">&#9881; Settings</div>
  <div class="settings-content" id="settings-content">
    <div class="timer-settings-row">
      <input type="checkbox" id="timer-enabled" class="timer-checkbox"${timer.enabled ? ' checked' : ''}>
      <label for="timer-enabled" style="font-size: 11px; opacity: 0.7;">Break</label>
      <input type="number" id="timer-minutes" class="timer-input" value="${timer.minutes}" min="1" max="120">
      <span style="font-size: 11px; opacity: 0.7;">min</span>
      <span id="timer-reset" class="timer-icon-btn" title="Reset">⏹</span>
    </div>
    <div class="color-row">
      <span class="color-label">Crab</span>
      <div class="color-swatches" id="crab-colors">
        <div class="color-swatch${colors.crabColor === '#e5c07b' ? ' selected' : ''}" data-color="#e5c07b" style="background: #e5c07b;" title="Amber"></div>
        <div class="color-swatch${colors.crabColor === '#98c379' ? ' selected' : ''}" data-color="#98c379" style="background: #98c379;" title="Green"></div>
        <div class="color-swatch${colors.crabColor === '#61afef' ? ' selected' : ''}" data-color="#61afef" style="background: #61afef;" title="Blue"></div>
        <div class="color-swatch${colors.crabColor === '#c678dd' ? ' selected' : ''}" data-color="#c678dd" style="background: #c678dd;" title="Purple"></div>
        <div class="color-swatch${colors.crabColor === '#e06c75' ? ' selected' : ''}" data-color="#e06c75" style="background: #e06c75;" title="Red"></div>
        <div class="color-swatch${colors.crabColor === '#56b6c2' ? ' selected' : ''}" data-color="#56b6c2" style="background: #56b6c2;" title="Cyan"></div>
        <div class="color-swatch${colors.crabColor === '#ffffff' ? ' selected' : ''}" data-color="#ffffff" style="background: #ffffff;" title="White"></div>
      </div>
    </div>
    <div class="color-row">
      <span class="color-label">Bubble</span>
      <div class="color-swatches" id="bubble-colors">
        <div class="color-swatch${colors.bubbleColor === '#e5c07b' ? ' selected' : ''}" data-color="#e5c07b" style="background: #e5c07b;" title="Amber"></div>
        <div class="color-swatch${colors.bubbleColor === '#98c379' ? ' selected' : ''}" data-color="#98c379" style="background: #98c379;" title="Green"></div>
        <div class="color-swatch${colors.bubbleColor === '#61afef' ? ' selected' : ''}" data-color="#61afef" style="background: #61afef;" title="Blue"></div>
        <div class="color-swatch${colors.bubbleColor === '#c678dd' ? ' selected' : ''}" data-color="#c678dd" style="background: #c678dd;" title="Purple"></div>
        <div class="color-swatch${colors.bubbleColor === '#e06c75' ? ' selected' : ''}" data-color="#e06c75" style="background: #e06c75;" title="Red"></div>
        <div class="color-swatch${colors.bubbleColor === '#56b6c2' ? ' selected' : ''}" data-color="#56b6c2" style="background: #56b6c2;" title="Cyan"></div>
        <div class="color-swatch${colors.bubbleColor === '#ffffff' ? ' selected' : ''}" data-color="#ffffff" style="background: #ffffff;" title="White"></div>
      </div>
    </div>
  </div>

  <div class="credits">Claude Code Crabgotchi</div>

  <script>
    const vscode = acquireVsCodeApi();

    const crabArt = document.getElementById('crab-art');
    const bubble = document.getElementById('bubble');
    const emotion = document.getElementById('emotion');
    const hungerBar = document.getElementById('hunger-bar');
    const happinessBar = document.getElementById('happiness-bar');
    const energyBar = document.getElementById('energy-bar');

    function makeAsciiBar(value) {
      const filled = Math.round(value / 10);
      const empty = 10 - filled;
      return '[' + '#'.repeat(filled) + '-'.repeat(empty) + ']';
    }

    function getBarClass(value) {
      if (value < 30) return 'stat-bar low';
      if (value < 60) return 'stat-bar medium';
      return 'stat-bar good';
    }

    document.getElementById('feed-btn').addEventListener('click', () => {
      vscode.postMessage({ command: 'feed' });
    });

    document.getElementById('pet-btn').addEventListener('click', () => {
      vscode.postMessage({ command: 'pet' });
    });

    // Emotion test buttons
    document.querySelectorAll('.emotion-buttons button').forEach(btn => {
      btn.addEventListener('click', () => {
        const emotion = btn.getAttribute('data-emotion');
        vscode.postMessage({ command: 'setEmotion', emotion });
      });
    });

    // Settings toggle
    document.getElementById('settings-toggle').addEventListener('click', () => {
      const content = document.getElementById('settings-content');
      content.classList.toggle('open');
    });

    // Color swatches - Crab
    document.querySelectorAll('#crab-colors .color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = swatch.getAttribute('data-color');
        vscode.postMessage({ command: 'setColor', setting: 'crabColor', color });
      });
    });

    // Color swatches - Bubble
    document.querySelectorAll('#bubble-colors .color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = swatch.getAttribute('data-color');
        vscode.postMessage({ command: 'setColor', setting: 'bubbleColor', color });
      });
    });

    // Timer
    let timerInterval = null;
    let timerSeconds = ${timer.minutes} * 60;
    let timerRunning = false;
    let timerCompleted = false;
    let timerTotal = timerSeconds;

    const timerStat = document.getElementById('timer-stat');
    const timerBar = document.getElementById('timer-bar');

    function updateTimerBar() {
      const remaining = timerTotal > 0 ? timerSeconds / timerTotal : 1;
      const filled = Math.round(remaining * 10);
      const empty = 10 - filled;
      timerBar.textContent = '[' + '#'.repeat(filled) + '-'.repeat(empty) + ']';

      // Update bar color based on state
      timerBar.className = 'stat-bar';
      if (timerRunning || timerSeconds < timerTotal) {
        if (remaining < 0.2) {
          timerBar.classList.add('timer-bar-low');
        } else if (remaining < 0.5) {
          timerBar.classList.add('timer-bar-medium');
        } else {
          timerBar.classList.add('timer-bar-running');
        }
      }

      // Dim whole row when completed
      timerStat.classList.toggle('completed', timerCompleted);
    }

    function toggleTimer() {
      // If completed, reset instead
      if (timerCompleted) {
        resetTimer();
        return;
      }

      if (timerRunning) {
        // Pause
        clearInterval(timerInterval);
        timerRunning = false;
      } else {
        // Start
        timerRunning = true;
        timerInterval = setInterval(() => {
          timerSeconds--;
          updateTimerBar();
          if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            timerRunning = false;
            timerCompleted = true;
            updateTimerBar();
            vscode.postMessage({ command: 'timerComplete' });
          }
        }, 1000);
      }
    }

    function resetTimer() {
      clearInterval(timerInterval);
      timerRunning = false;
      timerCompleted = false;
      const mins = parseInt(document.getElementById('timer-minutes').value) || 25;
      timerSeconds = mins * 60;
      timerTotal = timerSeconds;
      updateTimerBar();
    }

    // Click row to toggle start/pause or reset if completed
    timerStat.addEventListener('click', toggleTimer);

    // Reset button in settings
    document.getElementById('timer-reset').addEventListener('click', resetTimer);

    // Timer settings
    document.getElementById('timer-enabled').addEventListener('change', (e) => {
      const enabled = e.target.checked;
      timerStat.classList.toggle('enabled', enabled);
      vscode.postMessage({ command: 'setSetting', setting: 'breakTimer.enabled', value: enabled });
      if (enabled) resetTimer();
    });

    document.getElementById('timer-minutes').addEventListener('change', (e) => {
      const mins = parseInt(e.target.value) || 25;
      vscode.postMessage({ command: 'setSetting', setting: 'breakTimer.minutes', value: mins });
      if (!timerRunning) resetTimer();
    });

    // Initialize
    updateTimerBar();

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'update') {
        // Render each line centered
        crabArt.innerHTML = message.art
          .map(line => '<div class="crab-line">' + line + '</div>')
          .join('');
        bubble.textContent = message.bubble;
        emotion.textContent = message.emotion;

        const stats = message.stats;
        hungerBar.textContent = makeAsciiBar(stats.hunger);
        hungerBar.className = getBarClass(stats.hunger);
        happinessBar.textContent = makeAsciiBar(stats.happiness);
        happinessBar.className = getBarClass(stats.happiness);
        energyBar.textContent = makeAsciiBar(stats.energy);
        energyBar.className = getBarClass(stats.energy);
      } else if (message.type === 'snoozeTimer') {
        // Snooze - set timer to snooze minutes and start
        timerCompleted = false;
        timerSeconds = message.minutes * 60;
        timerTotal = timerSeconds;
        updateTimerBar();
        toggleTimer(); // Start it
      }
    });
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
    }
  }
}
