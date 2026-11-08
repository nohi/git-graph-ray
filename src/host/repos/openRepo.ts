import type { RepoInfo } from '../../shared/types';
import { repoPathKey, sameRepoPath } from '../editor/scmRefresh';

/** Folder index for a repo, or -1 when it is not that folder, inside it, or its parent. */
export function workspaceIndexFor(repoPath: string, folders: readonly string[]): number {
  return folders.findIndex((folder) => sameRepoPath(repoPath, folder) || pathInside(folder, repoPath) || pathInside(repoPath, folder));
}

/**
 * Listed path for the graph dropdown.
 * An existing worktree choice is kept. Otherwise the open folder's worktree wins over the first listed repo.
 */
export function resolveOpenRepo(current: string, repos: readonly { path: string }[], folders: readonly string[]): string {
  const known = repos.find((repo) => sameRepoPath(repo.path, current));
  if (known) return known.path;
  for (const hint of [current, ...folders]) {
    const containing = longestContaining(repos, hint);
    if (containing) return containing.path;
  }
  return repos[0]?.path ?? current;
}

/** Workspace folders come first. Repos outside every folder sort by path after them. */
export function compareRepos(order: string, a: RepoInfo, b: RepoInfo): number {
  if (order === 'name') return a.name.localeCompare(b.name);
  if (order === 'workspace' && a.workspaceIndex !== b.workspaceIndex) {
    const diff = workspaceRank(a.workspaceIndex) - workspaceRank(b.workspaceIndex);
    if (diff !== 0) return diff;
  }
  return a.path.localeCompare(b.path);
}

function workspaceRank(index: number): number {
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function longestContaining(repos: readonly { path: string }[], hint: string): { path: string } | undefined {
  let best: { path: string } | undefined;
  let bestLen = -1;
  for (const repo of repos) {
    if (!sameRepoPath(repo.path, hint) && !pathInside(repo.path, hint)) continue;
    const len = repoPathKey(repo.path).length;
    if (len > bestLen) {
      best = repo;
      bestLen = len;
    }
  }
  return best;
}

/** `child` is strictly inside `parent`. `repo` does not contain `repo-feature`. */
function pathInside(parent: string, child: string): boolean {
  const base = repoPathKey(parent);
  const nested = repoPathKey(child);
  if (!base || !nested || base === nested) return false;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return nested.startsWith(prefix);
}
