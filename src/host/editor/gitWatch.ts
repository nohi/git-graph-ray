import type { GraphSnapshot } from '../../shared/protocol';

const NOISY_GIT_DIR = /^(objects|hooks|info|logs)(\/|$)/i;
const NOISY_GIT_FILE = /^(COMMIT_EDITMSG|FETCH_HEAD|ORIG_HEAD|gc\.pid)$/i;

/** Paths under .git that change as a side effect of read-only git commands or locks. */
export function isNoisyGitWatchPath(fsPath: string): boolean {
  const p = fsPath.replace(/\\/g, '/');
  const m = p.match(/\/\.git\/(.+)$/i);
  if (!m) return false;
  const rel = m[1]!;
  if (NOISY_GIT_DIR.test(rel)) return true;
  if (/\.lock$/i.test(rel)) return true;
  return NOISY_GIT_FILE.test(rel);
}

/** Stable identity of graph data; ignores uncommitted-row timestamps that change every reload. */
export function snapshotFingerprint(payload: GraphSnapshot): string {
  const commits = payload.commits
    .map((c) => `${c.hash}:${c.parents.join(' ')}:${c.refs.map((r) => `${r.kind}:${r.name}:${r.hash}`).join(',')}`)
    .join(';');
  return [payload.repoPath, payload.head ?? '', payload.currentBranch ?? '', payload.hasMore ? '1' : '0', payload.branches.join(','), commits].join('|');
}
