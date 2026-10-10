import * as vscode from 'vscode';

let channel: vscode.LogOutputChannel | undefined;

export function logChannel(): vscode.LogOutputChannel {
  channel ??= vscode.window.createOutputChannel('Git Graph Ray', { log: true });
  return channel;
}
