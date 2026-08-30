import * as vscode from 'vscode';
import { gitOk } from './runner';

export async function runInteractiveRebase(cwd: string, ref: string, shellPath?: string): Promise<void> {
  const term = vscode.window.createTerminal({
    name: 'Git Graph Ray Rebase',
    cwd,
    shellPath: shellPath || undefined,
  });
  term.show();
  term.sendText(`git rebase --interactive ${shellQuote(ref)}`);
}

function shellQuote(value: string): string {
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}
