import * as vscode from 'vscode';
import { exitShellOnSuccess, interactiveRebaseCommand } from './terminalCommand';

/**
 * Runs `git rebase --interactive` in the integrated terminal and returns immediately.
 * The shell exits only when the rebase exits 0. VS Code then closes that terminal.
 * A rebase that stops leaves the shell running so its output stays visible.
 */
export function runInteractiveRebase(cwd: string, ref: string, shellPath?: string): void {
  const term = vscode.window.createTerminal({
    name: 'Git Graph Ray Rebase',
    cwd,
    shellPath: shellPath || undefined,
  });
  term.show();
  const shell = shellPath || vscode.env.shell;
  term.sendText(exitShellOnSuccess(shell, interactiveRebaseCommand(ref)));
}
