import * as vscode from 'vscode';
import { cfg } from './config';
import { GraphEditorProvider } from './editor/provider';
import { discoverRepos } from './repos/discover';
import { AvatarStore } from './avatars';

export function registerCommands(
  ctx: vscode.ExtensionContext,
  git: () => string,
  provider: GraphEditorProvider,
  avatars: AvatarStore,
): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('git-graph-ray.view', () => provider.openRepo()),
    vscode.commands.registerCommand('git-graph-ray.fetch', () => provider.openRepo({ fetch: true })),
    vscode.commands.registerCommand('git-graph-ray.addGitRepository', async () => {
      const pick = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false });
      const p = pick?.[0]?.fsPath;
      if (!p) return;
      const extra = ctx.workspaceState.get<string[]>('ggr.extraRepos', []);
      await ctx.workspaceState.update('ggr.extraRepos', [...new Set([...extra, p])]);
      await provider.openRepo({ repoPath: p });
    }),
    vscode.commands.registerCommand('git-graph-ray.removeGitRepository', async () => {
      const extra = ctx.workspaceState.get<string[]>('ggr.extraRepos', []);
      const hidden = ctx.workspaceState.get<string[]>('ggr.hiddenRepos', []);
      const repos = await discoverRepos(git(), extra, hidden, cfg('maxDepthOfRepoSearch', 0));
      const item = await vscode.window.showQuickPick(
        repos.map((r) => ({ label: r.name, description: r.path, path: r.path })),
      );
      if (!item) return;
      await ctx.workspaceState.update('ggr.hiddenRepos', [...hidden, item.path]);
    }),
    vscode.commands.registerCommand('git-graph-ray.clearAvatarCache', async () => {
      await avatars.clear();
      provider.broadcastFacesCleared();
    }),
    vscode.commands.registerCommand('git-graph-ray.version', () => {
      const ver = ctx.extension.packageJSON.version as string;
      void vscode.window.showInformationMessage(`Git Graph Ray v${ver}`);
    }),
    vscode.commands.registerCommand('git-graph-ray.openFile', async () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      if (!uri || uri.scheme !== 'git-graph-ray-file') return;
      const q = new URLSearchParams(uri.query);
      const root = q.get('root') ?? '';
      const file = uri.path.replace(/^\//, '');
      await vscode.window.showTextDocument(vscode.Uri.file(`${root}/${file}`));
    }),
  );
}
