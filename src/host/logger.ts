import * as vscode from 'vscode';

export function logChannel(): vscode.OutputChannel {
  const ch = vscode.window.createOutputChannel('Git Graph Ray');
  return ch;
}
