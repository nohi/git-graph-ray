import type { GraphSnapshot } from '../../shared/protocol';
import { relativeToGitRoot } from '../git/gitDir';

const NOISY_GIT_DIR = /^(objects|hooks|info|logs)(\/|$)/i;
const NOISY_GIT_FILE = /^(COMMIT_EDITMSG|FETCH_HEAD|ORIG_HEAD|gc\.pid)$/i;
const HISTORY_GIT_FILE = /^(HEAD|packed-refs)$/i;
const HISTORY_GIT_REF = /^refs\/(heads|remotes|tags|stash)(\/|$)/i;

/**
 * Paths under .git that change as a side effect of read-only git commands or locks.
 * `roots` are the watched git dirs (see `resolveGitWatchDirs`). Without them the
 * path must contain `/.git/`.
 */
export function isNoisyGitWatchPath(fsPath: string, roots?: readonly string[]): boolean {
  const rel = gitRel(fsPath, roots);
  if (!rel) return false;
  if (NOISY_GIT_DIR.test(rel)) return true;
  if (/\.lock$/i.test(rel)) return true;
  return NOISY_GIT_FILE.test(rel);
}

/** HEAD and refs. A change here can add or move a commit. Index writes do not. */
export function isHistoryWatchPath(fsPath: string, roots?: readonly string[]): boolean {
  const rel = gitRel(fsPath, roots);
  if (!rel) return false;
  return HISTORY_GIT_FILE.test(rel) || HISTORY_GIT_REF.test(rel);
}

export type ExternalReload = 'reload' | 'ignore';

/**
 * Whether a `.git` watch event should reload the graph.
 * Ref and HEAD changes during the post-reload quiet window are kept when
 * automatic refresh is on: a Source Control commit often lands there, after
 * the index write that started the previous reload. Index writes in that
 * window are ignored so a status refresh cannot reload forever.
 */
export function externalReloadAction(opts: {
  enabled: boolean;
  acting: boolean;
  disposed: boolean;
  noisy: boolean;
  quiet: boolean;
  history: boolean;
}): ExternalReload {
  if (opts.disposed || opts.acting || opts.noisy) return 'ignore';
  if (!opts.quiet) return 'reload';
  return opts.enabled && opts.history ? 'reload' : 'ignore';
}

function gitRel(fsPath: string, roots?: readonly string[]): string | undefined {
  if (roots?.length) return relativeToGitRoot(fsPath, roots);
  const p = fsPath.replace(/\\/g, '/');
  return p.match(/\/\.git\/(.+)$/i)?.[1];
}

/** Stable identity of graph data; ignores uncommitted-row timestamps that change every reload. */
export function snapshotFingerprint(payload: GraphSnapshot): string {
  const commits = payload.commits
    .map((c) => `${c.hash}:${c.parents.join(' ')}:${c.refs.map((r) => `${r.kind}:${r.name}:${r.hash}`).join(',')}`)
    .join(';');
  const operation = payload.operation ? `${payload.operation.kind}:${payload.operation.files.join(',')}` : '';
  const divergence = payload.divergence ? `${payload.divergence.ahead}:${payload.divergence.behind}` : '';
  return [
    payload.repoPath,
    payload.head ?? '',
    payload.currentBranch ?? '',
    payload.hasMore ? '1' : '0',
    payload.historyPath ?? '',
    operation,
    divergence,
    payload.branches.join(','),
    commits,
  ].join('|');
}
