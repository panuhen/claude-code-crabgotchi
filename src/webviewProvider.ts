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
          const feedResult = this.stateManager.feed();
          // Send result back to webview for appropriate animation
          if (this.view) {
            this.view.webview.postMessage({ type: 'feedResult', result: feedResult });
          }
          break;
        case 'pet':
          this.stateManager.pet();
          break;
        case 'clean':
          this.stateManager.clean();
          break;
        case 'scrub':
          const isClean = this.stateManager.scrub();
          if (this.view) {
            this.view.webview.postMessage({ type: 'scrubResult', isClean });
          }
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
      bubble: state.customBubble || frame.bubble || '',
      emotion: emotionLabels[state.emotion],
      stats: state.stats,
      easterEggType: state.easterEggType,
      crabAge: this.stateManager.getCrabAge(),
      wellbeing: this.stateManager.calculateWellbeing(),
      wellbeingTrend: this.stateManager.getWellbeingTrend(),
      sparkline24h: this.stateManager.getSparkline(24, 8),
      sparkline7d: this.stateManager.getSparkline(168, 8)
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

  private getStatsEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('crabgotchi');
    return config.get('showStats', true);
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
    const showStats = this.getStatsEnabled();

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

    html {
      min-height: 100%;
    }

    body {
      min-height: 100%;
      overflow-y: auto;
    }

    body {
      font-family: 'Cascadia Mono', 'Consolas', 'Courier New', monospace;
      background: var(--vscode-sideBar-background, #1e1e1e);
      color: var(--vscode-sideBar-foreground, #ccc);
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .crab-container {
      position: relative;
      text-align: center;
      margin-top: 24px;
      margin-bottom: 8px;
    }

    .bubble {
      position: absolute;
      top: -8px;
      right: 5px;
      font-size: 14px;
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

    /* Easter egg messages - left side, angled, fixed position */
    .easter-egg-msg {
      position: fixed;
      font-size: 9px;
      font-weight: bold;
      white-space: pre-line;
      text-align: center;
      transform: rotate(-12deg);
      text-shadow:
        -1px -1px 0 #000,
        1px -1px 0 #000,
        -1px 1px 0 #000,
        1px 1px 0 #000;
      animation: easterEggPulse 2s ease-in-out infinite;
      z-index: 100;
      pointer-events: none;
      display: none;
    }

    .easter-egg-msg.force {
      color: #FFE81F; /* Star Wars yellow */
      text-shadow:
        -1px -1px 0 #000,
        1px -1px 0 #000,
        -1px 1px 0 #000,
        1px 1px 0 #000,
        0 0 2px #FFE81F;
    }

    .easter-egg-msg.commit {
      color: #E85820; /* Orange from Zero Wing */
    }

    .easter-egg-msg.friday {
      color: #ff6b6b; /* Warning red for Friday deploys */
      text-shadow:
        -1px -1px 0 #000,
        1px -1px 0 #000,
        -1px 1px 0 #000,
        1px 1px 0 #000,
        0 0 3px #ff6b6b;
    }

    @keyframes easterEggPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.8; }
    }

    .crab-art {
      font-size: 11px;
      line-height: 1.0;
      color: ${colors.crabColor};
      text-shadow: 0 0 8px ${crabGlow};
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .crab-line {
      white-space: pre;
    }

    .white-eyes {
      color: #ffffff;
      text-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
    }

    .emotion-label {
      font-size: 12px;
      font-weight: bold;
      margin: 4px 0;
      color: var(--vscode-textLink-foreground);
    }

    .stats-container {
      width: 100%;
      max-width: 200px;
      margin-top: 8px;
      font-family: monospace;
    }

    .stat {
      margin: 2px 0;
      font-size: 11px;
      color: var(--vscode-foreground, #ccc);
    }

    .stat-name {
      display: inline-block;
      width: 50px;
      color: var(--vscode-descriptionForeground, #aaa);
    }

    .stat-bar {
      color: var(--vscode-foreground, #ccc);
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
      margin-top: 8px;
    }

    button {
      padding: 4px;
      font-family: inherit;
      font-size: 16px;
      border: none;
      background: transparent;
      cursor: pointer;
      opacity: 0.5;
      transition: opacity 0.2s, transform 0.1s;
    }

    button:hover {
      opacity: 0.8;
    }

    button.active {
      opacity: 1;
      transform: scale(1.1);
    }

    .crab-hit-area {
      position: absolute;
      top: -5px;
      left: -15px;
      right: -15px;
      bottom: -5px;
      border-radius: 8px;
      z-index: 10;
    }

    .crab-hit-area.interactive {
      cursor: pointer;
    }

    .credits {
      margin-top: 10px;
      font-size: 9px;
      opacity: 0.5;
      text-align: center;
    }

    .bottom-bar {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      font-size: 10px;
      opacity: 0.6;
    }

    .settings-toggle {
      cursor: pointer;
      user-select: none;
    }

    .settings-toggle:hover {
      opacity: 1;
    }

    .sparklines {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 6px;
      font-size: 9px;
      opacity: 0.7;
    }

    .sparkline-label {
      opacity: 0.6;
    }

    .sparkline-divider {
      opacity: 0.4;
    }

    .sparkline-container {
      position: relative;
      display: inline-block;
    }

    .sparkline-bg {
      color: #61afef;
      letter-spacing: -1px;
      opacity: 0.15;
    }

    .sparkline {
      position: absolute;
      left: 0;
      top: 0;
      color: #61afef;
      letter-spacing: -1px;
    }

    .settings-content {
      display: none;
      margin-top: 6px;
      width: 100%;
      max-width: 200px;
    }

    .settings-content.open {
      display: block;
    }

    .color-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 4px 0;
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
      gap: 4px;
      margin: 4px 0;
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

    /* Night mode */
    body.night-mode {
      background: linear-gradient(to bottom, #0d1117, #161b22);
    }

    body.night-mode .crab-art {
      filter: brightness(0.85) saturate(0.85);
    }

    body.night-mode .bubble {
      filter: brightness(0.8);
    }

    body.night-mode .emotion-label {
      opacity: 0.8;
    }

    .stars {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: hidden;
      z-index: 0;
    }

    body.night-mode .stars {
      display: block;
    }

    .star {
      position: absolute;
      width: 2px;
      height: 2px;
      background: #fff;
      border-radius: 50%;
      animation: twinkle 2s ease-in-out infinite;
    }

    @keyframes twinkle {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }

    .moon {
      display: none;
      position: fixed;
      top: 10px;
      right: 15px;
      font-size: 16px;
      opacity: 0.7;
      z-index: 1;
    }

    body.night-mode .moon {
      display: block;
    }

    /* Pet hearts animation */
    .heart {
      position: fixed;
      font-size: 16px;
      pointer-events: none;
      animation: floatHeart 1.5s ease-out forwards;
      z-index: 100;
    }

    @keyframes floatHeart {
      0% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translateY(-80px) scale(0.5);
      }
    }

    /* Feed nom animation */
    .nom {
      position: fixed;
      font-size: 12px;
      font-weight: bold;
      pointer-events: none;
      animation: nomBounce 1s ease-out forwards;
      z-index: 100;
    }

    .particle {
      position: fixed;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      pointer-events: none;
      animation: particleFade 0.8s ease-out forwards;
      z-index: 99;
    }

    @keyframes nomBounce {
      0% {
        opacity: 1;
        transform: translateY(0) scale(0.5);
      }
      50% {
        opacity: 1;
        transform: translateY(-20px) scale(1.2);
      }
      100% {
        opacity: 0;
        transform: translateY(-40px) scale(0.8);
      }
    }

    @keyframes particleFade {
      0% {
        opacity: 1;
        transform: translate(0, 0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(var(--tx), var(--ty)) scale(0);
      }
    }

    /* Poop & Hygiene styles */
    .hygiene-stat {
      display: none;
    }

    .poop-icons {
      font-size: 10px;
    }

    body.mode-clean {
      cursor: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><text y="18" font-size="18">🧽</text></svg>') 12 12, pointer;
    }

    body.mode-feed {
      cursor: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><text y="18" font-size="18">🦐</text></svg>') 12 12, pointer;
    }

    body.mode-pet {
      cursor: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><text y="18" font-size="18">✋</text></svg>') 12 12, pointer;
    }

    body.mode-clean .crab-hit-area,
    body.mode-feed .crab-hit-area,
    body.mode-pet .crab-hit-area {
      cursor: inherit;
    }

    .hygiene-stat.has-poop {
      display: block;
    }

    .stink {
      position: fixed;
      font-size: 14px;
      color: #98c379;
      opacity: 0.7;
      pointer-events: none;
      animation: stinkFloat 4s ease-out forwards;
      z-index: 100;
    }

    @keyframes stinkFloat {
      0% { transform: translateY(0); opacity: 0.7; }
      100% { transform: translateY(-50px); opacity: 0; }
    }

    .stink-cloud-left,
    .stink-cloud-right {
      position: fixed;
      width: 40px;
      height: 24px;
      background: linear-gradient(135deg, rgba(139, 119, 91, 0.25) 0%, rgba(152, 195, 121, 0.2) 100%);
      border-radius: 50% 50% 50% 50%;
      pointer-events: none;
      z-index: 50;
      filter: blur(3px);
    }

    .stink-cloud-left {
      animation: cloudSwayLeft 6s ease-in-out infinite;
    }

    .stink-cloud-left::before {
      content: '';
      position: absolute;
      width: 28px;
      height: 18px;
      background: linear-gradient(135deg, rgba(139, 119, 91, 0.2) 0%, rgba(152, 195, 121, 0.15) 100%);
      border-radius: 50%;
      top: -10px;
      left: 10px;
    }

    .stink-cloud-right {
      animation: cloudSwayRight 7s ease-in-out infinite;
    }

    .stink-cloud-right::before {
      content: '';
      position: absolute;
      width: 30px;
      height: 20px;
      background: linear-gradient(135deg, rgba(139, 119, 91, 0.2) 0%, rgba(152, 195, 121, 0.15) 100%);
      border-radius: 50%;
      top: -8px;
      right: 6px;
    }

    .stink-cloud-right::after {
      content: '';
      position: absolute;
      width: 18px;
      height: 12px;
      background: linear-gradient(135deg, rgba(139, 119, 91, 0.15) 0%, rgba(152, 195, 121, 0.1) 100%);
      border-radius: 50%;
      top: 28px;
      right: 2px;
    }

    @keyframes cloudSwayLeft {
      0%, 100% { transform: translateX(0); opacity: 0.4; }
      50% { transform: translateX(-4px); opacity: 0.55; }
    }

    @keyframes cloudSwayRight {
      0%, 100% { transform: translateX(0); opacity: 0.4; }
      50% { transform: translateX(4px); opacity: 0.55; }
    }
  </style>
</head>
<body>
  <div class="stars" id="stars"></div>
  <div class="moon">☽</div>
  <div class="easter-egg-msg" id="easter-egg-msg"></div>
  <div class="crab-container">
    <div class="crab-hit-area" id="crab-hit-area"></div>
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
    <div class="stat hygiene-stat" id="hygiene-stat">
      <span class="stat-name">Hygiene</span>
      <span class="stat-bar" id="hygiene-bar">[----------]</span>
    </div>
    <div class="stat timer-stat${timer.enabled ? ' enabled' : ''}" id="timer-stat" title="Click to start/pause">
      <span class="stat-name" id="timer-label">Break</span>
      <span class="stat-bar" id="timer-bar">[##########]</span>
    </div>
  </div>

  <div class="buttons">
    <button id="feed-btn" title="Feed">🦐</button>
    <button id="pet-btn" title="Pet">✋</button>
    <button id="clean-btn" title="Clean">🧽</button>
  </div>

  <div class="bottom-bar">
    <span class="settings-toggle" id="settings-toggle">&#9881; Settings</span>
  </div>
  <div class="sparklines" id="sparklines" title="Wellbeing: 50%"${showStats ? '' : ' style="display:none"'}>
    <span class="sparkline-label">24h</span><span class="sparkline-container"><span class="sparkline-bg">████████</span><span id="sparkline-24h" class="sparkline">▄▄▄▄▄▄▄▄</span></span>
    <span class="sparkline-divider">|</span>
    <span class="sparkline-label">7d</span><span class="sparkline-container"><span class="sparkline-bg">████████</span><span id="sparkline-7d" class="sparkline">▄▄▄▄▄▄▄▄</span></span>
  </div>
  <div class="settings-content" id="settings-content">
    <div class="timer-settings-row">
      <input type="checkbox" id="timer-enabled" class="timer-checkbox"${timer.enabled ? ' checked' : ''}>
      <label for="timer-enabled" style="font-size: 11px; opacity: 0.7;">Break</label>
      <input type="number" id="timer-minutes" class="timer-input" value="${timer.minutes}" min="1" max="120">
      <span style="font-size: 11px; opacity: 0.7;">min</span>
      <span id="timer-reset" class="timer-icon-btn" title="Reset">⏹</span>
    </div>
    <div class="timer-settings-row">
      <input type="checkbox" id="stats-enabled" class="timer-checkbox"${showStats ? ' checked' : ''}>
      <label for="stats-enabled" style="font-size: 11px; opacity: 0.7;">Show stats</label>
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
    <div class="credits">Claude Code Crabgotchi</div>
    <div class="credits">Crab age: <span id="crab-age">0 days</span></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const crabArt = document.getElementById('crab-art');
    const bubble = document.getElementById('bubble');
    const emotion = document.getElementById('emotion');
    const hungerBar = document.getElementById('hunger-bar');
    const happinessBar = document.getElementById('happiness-bar');
    const energyBar = document.getElementById('energy-bar');
    const hygieneBar = document.getElementById('hygiene-bar');
    const hygieneStat = document.getElementById('hygiene-stat');
    const crabContainer = document.querySelector('.crab-container');
    let stinkCloud = null;

    function makeAsciiBar(value) {
      const filled = Math.round(value / 10);
      const empty = 10 - filled;
      return '[' + '#'.repeat(filled) + '-'.repeat(empty) + ']';
    }

    function makePoopBar(hygiene) {
      // Invert: low hygiene = more poop shown (5 slots to fit emojis)
      const dirty = 5 - Math.round(hygiene / 20);
      const clean = 5 - dirty;
      const poopSpan = dirty > 0 ? '<span class="poop-icons">' + '💩'.repeat(dirty) + '</span>' : '';
      return '[' + poopSpan + '-'.repeat(clean) + ']';
    }

    function getBarClass(value) {
      if (value < 30) return 'stat-bar low';
      if (value < 60) return 'stat-bar medium';
      return 'stat-bar good';
    }

    let interactionMode = null; // 'feed', 'pet', 'clean', or null
    const feedBtn = document.getElementById('feed-btn');
    const petBtn = document.getElementById('pet-btn');
    const cleanBtn = document.getElementById('clean-btn');
    const hitArea = document.getElementById('crab-hit-area');

    function setInteractionMode(mode) {
      // Toggle off if same mode clicked
      if (interactionMode === mode) {
        interactionMode = null;
      } else {
        interactionMode = mode;
      }

      // Update button active states
      feedBtn.classList.toggle('active', interactionMode === 'feed');
      petBtn.classList.toggle('active', interactionMode === 'pet');
      cleanBtn.classList.toggle('active', interactionMode === 'clean');

      // Update hit area visibility
      hitArea.classList.toggle('interactive', interactionMode !== null);

      // Update cursor
      document.body.classList.remove('mode-feed', 'mode-pet', 'mode-clean');
      if (interactionMode) {
        document.body.classList.add('mode-' + interactionMode);
      }
    }

    feedBtn.addEventListener('click', () => setInteractionMode('feed'));
    petBtn.addEventListener('click', () => setInteractionMode('pet'));
    cleanBtn.addEventListener('click', () => setInteractionMode('clean'));

    // Click on hit area to perform action
    hitArea.addEventListener('click', (e) => {
      if (!interactionMode) return;
      e.stopPropagation();

      switch (interactionMode) {
        case 'feed':
          vscode.postMessage({ command: 'feed' });
          break;
        case 'pet':
          vscode.postMessage({ command: 'pet' });
          spawnHearts();
          break;
        case 'clean':
          vscode.postMessage({ command: 'scrub' });
          spawnSparkles();
          break;
      }
    });

    // Click elsewhere to exit interaction mode
    document.body.addEventListener('click', (e) => {
      if (interactionMode && !e.target.closest('.crab-hit-area') && !e.target.closest('.buttons')) {
        setInteractionMode(null);
      }
    });

    function spawnHearts() {
      const hearts = ['♥', '♡', '❤'];
      const crabRect = document.querySelector('.crab-container').getBoundingClientRect();

      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          const heart = document.createElement('div');
          heart.className = 'heart';
          heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
          // Spawn across the width, around crab area
          heart.style.left = (20 + Math.random() * (window.innerWidth - 40)) + 'px';
          heart.style.top = (crabRect.top + Math.random() * 60) + 'px';
          heart.style.color = ['#e06c75', '#c678dd', '#e5c07b'][Math.floor(Math.random() * 3)];
          document.body.appendChild(heart);

          setTimeout(() => heart.remove(), 1500);
        }, i * 80);
      }
    }

    function spawnNoms() {
      const noms = ['nom', 'nom!', 'NOM', 'yum', '*munch*'];
      const crabRect = document.querySelector('.crab-container').getBoundingClientRect();
      const centerX = crabRect.left + crabRect.width / 2;
      const centerY = crabRect.top + crabRect.height / 2;

      // Spawn nom texts
      for (let i = 0; i < 2; i++) {
        setTimeout(() => {
          const nom = document.createElement('div');
          nom.className = 'nom';
          nom.textContent = noms[Math.floor(Math.random() * noms.length)];
          nom.style.left = (centerX - 20 + Math.random() * 40) + 'px';
          nom.style.top = (centerY - 10 + Math.random() * 20) + 'px';
          nom.style.color = ['#98c379', '#e5c07b', '#61afef'][Math.floor(Math.random() * 3)];
          document.body.appendChild(nom);

          setTimeout(() => nom.remove(), 1000);
        }, i * 200);
      }

      // Spawn particles
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          const particle = document.createElement('div');
          particle.className = 'particle';
          particle.style.left = (centerX - 20 + Math.random() * 40) + 'px';
          particle.style.top = (centerY + Math.random() * 20) + 'px';
          particle.style.background = ['#98c379', '#e5c07b', '#56b6c2', '#e06c75'][Math.floor(Math.random() * 4)];
          // Random direction for particle
          const angle = Math.random() * Math.PI * 2;
          const distance = 20 + Math.random() * 30;
          particle.style.setProperty('--tx', Math.cos(angle) * distance + 'px');
          particle.style.setProperty('--ty', Math.sin(angle) * distance + 'px');
          document.body.appendChild(particle);

          setTimeout(() => particle.remove(), 800);
        }, i * 50);
      }
    }

    function spawnSparkles() {
      const crabRect = crabContainer.getBoundingClientRect();
      const centerX = crabRect.left + crabRect.width / 2;
      const centerY = crabRect.top + crabRect.height / 2;

      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          const sparkle = document.createElement('div');
          sparkle.className = 'particle';
          sparkle.textContent = '✨';
          sparkle.style.left = (centerX - 30 + Math.random() * 60) + 'px';
          sparkle.style.top = (centerY - 20 + Math.random() * 40) + 'px';
          sparkle.style.background = 'transparent';
          sparkle.style.width = 'auto';
          sparkle.style.height = 'auto';
          sparkle.style.fontSize = '12px';
          const angle = Math.random() * Math.PI * 2;
          const distance = 15 + Math.random() * 25;
          sparkle.style.setProperty('--tx', Math.cos(angle) * distance + 'px');
          sparkle.style.setProperty('--ty', Math.sin(angle) * distance + 'px');
          document.body.appendChild(sparkle);

          setTimeout(() => sparkle.remove(), 800);
        }, i * 60);
      }
    }

    function spawnStink() {
      const crabRect = crabContainer.getBoundingClientRect();
      const stink = document.createElement('div');
      stink.className = 'stink';
      stink.textContent = '~';
      // Spawn on left or right side of crab
      const onLeft = Math.random() > 0.5;
      if (onLeft) {
        stink.style.left = (crabRect.left - 10 + Math.random() * 15) + 'px';
      } else {
        stink.style.left = (crabRect.right - 5 + Math.random() * 15) + 'px';
      }
      stink.style.top = (crabRect.top + 20 + Math.random() * (crabRect.height - 30)) + 'px';
      document.body.appendChild(stink);
      setTimeout(() => stink.remove(), 3000);
    }

    let stinkInterval = null;

    let lastPoopCount = 0;
    let lastPoopIcons = 0;

    let lastHygiene = 100;

    function updateStinkEffect(poopCount, poopIconsShown, hygiene) {
      // Only update if values changed
      if (poopCount === lastPoopCount && poopIconsShown === lastPoopIcons && hygiene === lastHygiene) return;
      lastPoopCount = poopCount;
      lastPoopIcons = poopIconsShown;
      lastHygiene = hygiene;

      const needsCleaning = hygiene <= 80;

      // Clear existing stink timeout
      if (stinkInterval) {
        clearTimeout(stinkInterval);
        stinkInterval = null;
      }

      // Remove stink clouds if below 4 poop icons or clean
      if ((poopIconsShown < 4 || !needsCleaning) && stinkCloud) {
        stinkCloud.forEach(c => c.remove());
        stinkCloud = null;
      }

      // Only show stink when hygiene <= 80 (same threshold as clean button)
      if (poopCount > 0 && needsCleaning) {
        // Spawn one immediately, then with random intervals
        spawnStink();
        const baseInterval = poopIconsShown >= 4 ? 2500 : 4000;

        function scheduleNextStink() {
          const randomDelay = baseInterval + Math.random() * baseInterval; // 1x to 2x
          stinkInterval = setTimeout(() => {
            spawnStink();
            scheduleNextStink();
          }, randomDelay);
        }
        scheduleNextStink();

        // Add stink clouds for 4+ poop icons (only if not already created)
        if (poopIconsShown >= 4 && !stinkCloud) {
          const crabRect = crabContainer.getBoundingClientRect();

          const leftCloud = document.createElement('div');
          leftCloud.className = 'stink-cloud-left';
          leftCloud.style.left = (crabRect.left - 25) + 'px';
          leftCloud.style.top = (crabRect.top + 35) + 'px';

          const rightCloud = document.createElement('div');
          rightCloud.className = 'stink-cloud-right';
          rightCloud.style.left = (crabRect.right - 15) + 'px';
          rightCloud.style.top = (crabRect.top + 15) + 'px';

          document.body.appendChild(leftCloud);
          document.body.appendChild(rightCloud);
          stinkCloud = [leftCloud, rightCloud];
        }
      } else {
        // No poop - remove clouds
        if (stinkCloud) {
          stinkCloud.forEach(c => c.remove());
          stinkCloud = null;
        }
      }
    }

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

    document.getElementById('stats-enabled').addEventListener('change', (e) => {
      const enabled = e.target.checked;
      document.getElementById('sparklines').style.display = enabled ? '' : 'none';
      vscode.postMessage({ command: 'setSetting', setting: 'showStats', value: enabled });
    });

    document.getElementById('timer-minutes').addEventListener('change', (e) => {
      const mins = parseInt(e.target.value) || 25;
      vscode.postMessage({ command: 'setSetting', setting: 'breakTimer.minutes', value: mins });
      if (!timerRunning) resetTimer();
    });

    // Initialize
    updateTimerBar();

    // Night mode
    const starsContainer = document.getElementById('stars');

    // Generate random stars
    function generateStars() {
      starsContainer.innerHTML = '';
      for (let i = 0; i < 20; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.animationDelay = Math.random() * 2 + 's';
        star.style.width = (Math.random() * 2 + 1) + 'px';
        star.style.height = star.style.width;
        starsContainer.appendChild(star);
      }
    }
    generateStars();

    // Check if it's night time (11pm - 5am local time)
    function isNightTime() {
      const hour = new Date().getHours();
      return hour >= 23 || hour < 5;
    }

    function updateNightMode() {
      document.body.classList.toggle('night-mode', isNightTime());
    }

    // Set initial night mode state
    updateNightMode();

    // Check time every minute to auto-toggle
    setInterval(updateNightMode, 60000);

    const easterEggMsg = document.getElementById('easter-egg-msg');

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'update') {
        const isLovestruck = message.emotion === 'Ferris! ♥' || message.emotion === 'Claude! ♥';
        // Render each line centered, with special eyes in white for lovestruck
        crabArt.innerHTML = message.art
          .map(line => {
            // Make puppy eyes white only when lovestruck
            if (isLovestruck) {
              // Match the eye pattern: █▀ ██▀ █
              line = line.replace(/█▀ ██▀ █/g, '█<span class="white-eyes">▀</span> ██<span class="white-eyes">▀</span> █');
            }
            return '<div class="crab-line">' + line + '</div>';
          })
          .join('');

        // Handle easter egg messages (force push, commit)
        if (message.easterEggType) {
          const crabRect = crabContainer.getBoundingClientRect();
          easterEggMsg.textContent = message.bubble;
          easterEggMsg.className = 'easter-egg-msg ' + message.easterEggType;
          easterEggMsg.style.left = '50px';
          easterEggMsg.style.top = '50px';
          easterEggMsg.style.display = 'block';
          bubble.textContent = '';
        } else {
          easterEggMsg.style.display = 'none';
          bubble.textContent = message.bubble;
        }
        emotion.textContent = message.emotion;

        // Update age and sparklines
        document.getElementById('crab-age').textContent = message.crabAge;
        document.getElementById('sparkline-24h').textContent = message.sparkline24h;
        document.getElementById('sparkline-7d').textContent = message.sparkline7d;
        document.getElementById('sparklines').title = 'Wellbeing: ' + message.wellbeing + '%';

        const stats = message.stats;
        hungerBar.textContent = makeAsciiBar(stats.hunger);
        hungerBar.className = getBarClass(stats.hunger);
        happinessBar.textContent = makeAsciiBar(stats.happiness);
        happinessBar.className = getBarClass(stats.happiness);
        energyBar.textContent = makeAsciiBar(stats.energy);
        energyBar.className = getBarClass(stats.energy);

        // Hygiene and poop - show poop bar (inverted: more poop = dirtier)
        hygieneBar.innerHTML = makePoopBar(stats.hygiene);
        hygieneBar.className = getBarClass(stats.hygiene);
        const poopCount = stats.poopCount || 0;
        const poopIconsShown = 5 - Math.round(stats.hygiene / 20); // Same as makePoopBar
        hygieneStat.classList.toggle('has-poop', poopCount > 0 || stats.hygiene < 100);
        updateStinkEffect(poopCount, poopIconsShown, stats.hygiene);

        // Show/hide hygiene bar and clean button based on hygiene
        const needsCleaning = stats.hygiene <= 80;
        hygieneStat.style.display = needsCleaning ? '' : 'none';
        document.getElementById('clean-btn').style.display = needsCleaning ? '' : 'none';
        // Exit clean mode if button hidden
        if (!needsCleaning && interactionMode === 'clean') {
          setInteractionMode(null);
        }
      } else if (message.type === 'feedResult') {
        // Handle feed result animations
        if (message.result === 'normal') {
          spawnNoms();
        } else if (message.result === 'overfed') {
          spawnNoms();
          // Spawn poop after a short delay
          setTimeout(() => {
            const crabRect = crabContainer.getBoundingClientRect();
            const poop = document.createElement('div');
            poop.textContent = '💩';
            poop.style.position = 'fixed';
            poop.style.left = (crabRect.left + crabRect.width / 2) + 'px';
            poop.style.top = (crabRect.bottom - 10) + 'px';
            poop.style.fontSize = '16px';
            poop.style.zIndex = '100';
            poop.style.animation = 'nomBounce 0.8s ease-out forwards';
            document.body.appendChild(poop);
            setTimeout(() => poop.remove(), 800);
          }, 300);
        } else if (message.result === 'stuffed') {
          // Show "full!" bubble - do nothing, crab will show reaction
        }
      } else if (message.type === 'scrubResult') {
        // Exit cleaning mode if now fully clean
        if (message.isClean) {
          setInteractionMode(null);
        }
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
