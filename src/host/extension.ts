import * as vscode from 'vscode';
import { startAskpassServer } from './askpass/server';
import { AvatarStore } from './avatars';
import { registerCommands } from './commands';
import { cfg, getGitPathSetting } from './config';
import { DiffFiles } from './diff/provider';
import { GraphEditorProvider } from './editor/provider';
import { findGit, gitVersionString } from './git/executable';
import { createStatusBar } from './statusBar';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const git = await findGit(getGitPathSetting());
  const version = await gitVersionString(git);
  await startAskpassServer(context);
  const avatars = new AvatarStore(context.globalStorageUri.fsPath);
  const provider = new GraphEditorProvider(context, avatars);
  provider.setGit(git, version);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      'git-graph-ray-file',
      new DiffFiles(
        () => git,
        (uri) => vscode.workspace.getConfiguration('git-graph-ray', uri).get('fileEncoding', 'utf8'),
      ),
    ),
    vscode.window.registerWebviewPanelSerializer(GraphEditorProvider.viewType, provider),
  );

  registerCommands(context, () => git, provider, avatars);
  createStatusBar(context);
  context.subscriptions.push({ dispose: () => provider.dispose() });
  void provider.restorePins();
}

export function deactivate(): void {}
