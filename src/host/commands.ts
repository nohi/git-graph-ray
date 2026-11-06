import * as vscode from 'vscode';
import { cfg } from './config';
import { GraphEditorProvider } from './editor/provider';
import { discoverRepos } from './repos/discover';
import { AvatarStore } from './avatars';
import { ContributorsPanel } from './editor/contributorsPanel';
import { gitVersionString } from './git/executable';
import { versionInformationDisplay, versionInformationText } from './versionInfo';

export function registerCommands(
  ctx: vscode.ExtensionContext,
  git: () => string,
  provider: GraphEditorProvider,
  avatars: AvatarStore,
  contributors: ContributorsPanel,
): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('git-graph-ray.view', () => provider.openRepo()),
    vscode.commands.registerCommand('git-graph-ray.contributors', () => contributors.open()),
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
      const repos = await discoverRepos(git(), extra, hidden, cfg('startup.searchDepth', 0));
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
    vscode.commands.registerCommand('git-graph-ray.version', async () => {
      const ver = ctx.extension.packageJSON.version as string;
      const gitVer = await gitVersionString(git());
      const choice = await vscode.window.showInformationMessage(versionInformationDisplay(ver, gitVer), 'Copy');
      if (choice === 'Copy') await vscode.env.clipboard.writeText(versionInformationText(ver, gitVer));
    }),
    vscode.commands.registerCommand('git-graph-ray.graph.refresh', () => {
      provider.postShortcut('refresh');
    }),
    vscode.commands.registerCommand('git-graph-ray.graph.scrollToStash', (arg?: { previous?: boolean }) => {
      provider.postShortcut('stash', arg?.previous === true);
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
