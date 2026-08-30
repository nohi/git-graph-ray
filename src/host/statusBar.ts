import * as vscode from 'vscode';
import { cfg } from './config';

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
  item.text = 'Git Graph Ray';
  item.tooltip = 'View Git Graph Ray';
  item.command = 'git-graph-ray.view';
  const refresh = () => {
    if (cfg('showStatusBarItem', true)) item.show();
    else item.hide();
  };
  refresh();
  context.subscriptions.push(item, vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('git-graph-ray.showStatusBarItem')) refresh();
  }));
  return item;
}
