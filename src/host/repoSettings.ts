import * as vscode from 'vscode';
import { defaultRepoSettings, type RepoSettings } from '../shared/dialogs';

const KEY = 'ggr.repoSettings';

export function loadRepoSettings(ctx: vscode.ExtensionContext, repoPath: string): RepoSettings {
  const all = ctx.workspaceState.get<Record<string, RepoSettings>>(KEY, {});
  return all[repoPath] ?? defaultRepoSettings();
}

export async function saveRepoSettings(ctx: vscode.ExtensionContext, repoPath: string, settings: RepoSettings): Promise<void> {
  const all = { ...ctx.workspaceState.get<Record<string, RepoSettings>>(KEY, {}) };
  all[repoPath] = settings;
  await ctx.workspaceState.update(KEY, all);
}
