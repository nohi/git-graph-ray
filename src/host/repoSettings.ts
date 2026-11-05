import * as vscode from 'vscode';
import { defaultRepoSettings, type RepoSettings } from '../shared/dialogs';
import { dropDefaultVisibility, visibilityChanged } from '../shared/repoVisibility';
import type { ViewConfig } from '../shared/types';

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

/** `history.*` stays the value for a repository until that repository stores a different one. */
export async function loadCleanRepoSettings(ctx: vscode.ExtensionContext, repoPath: string, config: ViewConfig): Promise<RepoSettings> {
  const stored = loadRepoSettings(ctx, repoPath);
  const cleaned = dropDefaultVisibility(stored, config);
  if (visibilityChanged(stored, cleaned)) await saveRepoSettings(ctx, repoPath, cleaned);
  return cleaned;
}
