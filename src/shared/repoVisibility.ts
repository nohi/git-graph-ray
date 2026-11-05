import type { RepoSettings } from './dialogs';
import type { ViewConfig } from './types';

const FIELDS = [
  ['showRemotes', 'showRemoteBranches'],
  ['showStashes', 'showStashes'],
  ['showTags', 'showTags'],
  ['showWorktrees', 'showWorktrees'],
  ['showReflogs', 'includeCommitsMentionedByReflogs'],
  ['firstParent', 'onlyFollowFirstParent'],
] as const;

/** Keep a repository value only when it differs from `history.*`. */
export function dropDefaultVisibility(settings: RepoSettings, config: ViewConfig): RepoSettings {
  const next: RepoSettings = { ...settings };
  for (const [field, key] of FIELDS) {
    const value = next[field];
    if (typeof value !== 'boolean' || value === config[key]) next[field] = undefined;
  }
  return next;
}

function storedFlag(value: boolean | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function visibilityChanged(before: RepoSettings, after: RepoSettings): boolean {
  return FIELDS.some(([field]) => storedFlag(before[field]) !== storedFlag(after[field]));
}

/** Overlay repository choices onto the `history.*` defaults. */
export function applyRepoVisibility(config: ViewConfig, settings: RepoSettings): void {
  for (const [field, key] of FIELDS) {
    const value = settings[field];
    if (typeof value === 'boolean' && value !== config[key]) config[key] = value;
  }
}
