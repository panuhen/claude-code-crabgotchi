import * as vscode from 'vscode';
import { CrabStateManager } from './crabState';
import { CrabWebviewProvider } from './webviewProvider';
import { TerminalWatcher } from './terminalWatcher';
import { MemefyWatcher } from './memefyWatcher';
import { installMemefySkill } from './skillInstaller';

let stateManager: CrabStateManager;
let webviewProvider: CrabWebviewProvider;
let terminalWatcher: TerminalWatcher;
let memefyWatcher: MemefyWatcher;

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Crab Tamagotchi is waking up!');

  // Initialize state manager
  stateManager = new CrabStateManager(context);

  // Initialize webview provider
  webviewProvider = new CrabWebviewProvider(context.extensionUri, stateManager);

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CrabWebviewProvider.viewType,
      webviewProvider
    )
  );

  // Initialize and start terminal watcher
  terminalWatcher = new TerminalWatcher(stateManager);
  terminalWatcher.start();

  // Install the bundled memefy Skill into ~/.claude/skills/ and watch its queue.
  const skillDir = installMemefySkill(context);
  memefyWatcher = new MemefyWatcher(webviewProvider, skillDir);
  memefyWatcher.start();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCrab.feed', () => {
      stateManager.feed();
      vscode.window.showInformationMessage('You fed the crab! Om nom nom...');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCrab.pet', () => {
      stateManager.pet();
      vscode.window.showInformationMessage('You petted the crab! It looks happy!');
    })
  );

  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome');
  if (!hasShownWelcome) {
    vscode.window.showInformationMessage(
      'Your Claude Crab has hatched! Check the sidebar to see it.',
      'Show Crab'
    ).then((selection) => {
      if (selection === 'Show Crab') {
        vscode.commands.executeCommand('claudeCrab.tamagotchi.focus');
      }
    });
    context.globalState.update('hasShownWelcome', true);
  }
}

export function deactivate() {
  console.log('Claude Crab is going to sleep...');

  if (terminalWatcher) {
    terminalWatcher.dispose();
  }

  if (memefyWatcher) {
    memefyWatcher.dispose();
  }

  if (webviewProvider) {
    webviewProvider.dispose();
  }

  if (stateManager) {
    stateManager.dispose();
  }
}
