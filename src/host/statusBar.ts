import * as vscode from 'vscode';
import { cfg } from './config';

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
  item.text = 'Git Graph Ray';
  item.tooltip = vscode.l10n.t('View Git Graph Ray');
  item.command = 'git-graph-ray.view';
  const refresh = () => {
    if (cfg('startup.statusBar', true)) item.show();
    else item.hide();
  };
  refresh();
  context.subscriptions.push(item, vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('git-graph-ray.startup.statusBar')) refresh();
  }));
  return item;
}
