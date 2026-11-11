import * as vscode from 'vscode';
import { startAskpassServer } from './askpass/server';
import { AvatarStore } from './avatars';
import { registerCommands } from './commands';
import { getGitPathSetting, migrateLabelColours, migrateLegacySettings } from './config';
import { DiffFiles } from './diff/provider';
import { ContributorsPanel } from './editor/contributorsPanel';
import { GraphEditorProvider } from './editor/provider';
import { findGit, gitVersionString } from './git/executable';
import { setGitCommandLogger } from './git/runner';
import { logChannel } from './logger';
import { createStatusBar } from './statusBar';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = logChannel();
  setGitCommandLogger((line) => output.appendLine(line));
  context.subscriptions.push(output, { dispose: () => setGitCommandLogger(() => {}) });

  try {
    await migrateLegacySettings(context);
  } catch (error) {
    output.appendLine(`Could not copy settings from the keys used before v0.8.0: ${error instanceof Error ? error.message : String(error)}`);
  }
  await migrateLabelColours(context);
  const git = await findGit(getGitPathSetting());
  const version = await gitVersionString(git);
  await startAskpassServer(context);
  const avatars = new AvatarStore(context.globalStorageUri.fsPath);
  const contributors = new ContributorsPanel(context, () => git);
  const provider = new GraphEditorProvider(context, avatars);
  provider.setGit(git, version);
  provider.setContributorsOpener((repoPath) => contributors.open(repoPath));

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      'git-graph-ray-file',
      new DiffFiles(
        () => git,
        (uri) => vscode.workspace.getConfiguration('git-graph-ray', uri).get('files.encoding', 'utf8'),
      ),
    ),
    vscode.window.registerWebviewPanelSerializer(GraphEditorProvider.viewType, provider),
    vscode.window.registerWebviewPanelSerializer(ContributorsPanel.viewType, contributors),
  );

  registerCommands(context, () => git, provider, avatars, contributors);
  createStatusBar(context);
  context.subscriptions.push({ dispose: () => provider.dispose() }, { dispose: () => contributors.dispose() });
  void provider.restorePins();
}

export function deactivate(): void {}
