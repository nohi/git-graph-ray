import { t } from '@vscode/l10n';

/** A commit row in graph order. Index 0 is the top of the graph (newest). */
export type HistoryCommit = { hash: string; parents: string[] };

/**
 * Toggle one commit in a cherry-pick selection.
 * An empty selection treats `implicit` (the open commit) as already selected, so the first
 * Ctrl/Cmd+click after a plain click still pairs those two commits.
 * The uncommitted row is never part of the selection.
 */
export function toggleCommitSelection(current: readonly string[], hash: string, implicit?: string | null, uncommitted = '*'): string[] {
  if (!hash || hash === uncommitted) return current.filter((item) => item !== uncommitted);
  const selected = current.filter((item) => item && item !== uncommitted);
  const base = selected.length > 0 ? selected : implicit && implicit !== uncommitted ? [implicit] : [];
  const index = base.indexOf(hash);
  if (index >= 0) return [...base.slice(0, index), ...base.slice(index + 1)];
  return [...base, hash];
}

/** Inclusive span of displayed rows between two commits, top to bottom. */
export function displayedRange(commits: readonly { hash: string }[], anchor: string, target: string): string[] {
  const a = commits.findIndex((commit) => commit.hash === anchor);
  const b = commits.findIndex((commit) => commit.hash === target);
  if (a < 0 || b < 0) return [];
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return commits.slice(start, end + 1).map((commit) => commit.hash);
}

/**
 * Commits to cherry-pick from a displayed selection.
 * Oldest first. Merge commits and the uncommitted row are left out.
 */
export function cherryPickPlan(
  commits: readonly HistoryCommit[],
  selected: readonly string[],
  uncommitted = '*',
): { commits: HistoryCommit[]; skippedMerges: number } {
  const index = new Map(commits.map((commit, i) => [commit.hash, i]));
  const rows = [...new Set(selected)]
    .map((hash) => {
      const i = index.get(hash);
      return i == null ? null : { commit: commits[i]!, i };
    })
    .filter((row): row is { commit: HistoryCommit; i: number } => row != null)
    .sort((a, b) => b.i - a.i);
  const picked: HistoryCommit[] = [];
  let skippedMerges = 0;
  for (const row of rows) {
    if (row.commit.hash === uncommitted) continue;
    if (row.commit.parents.length > 1) {
      skippedMerges++;
      continue;
    }
    picked.push(row.commit);
  }
  return { commits: picked, skippedMerges };
}

export type SquashCheck =
  | { ok: true; hashes: string[]; base: string }
  | { ok: false; reason: string };

/**
 * Whether a selection can squash into one commit with a soft reset.
 * The range must be the tip run of the branch: two or more commits starting
 * at the tip with no gaps, merges, or the root commit. `hashes` come back
 * oldest first with `base` as the parent to reset to. The uncommitted row
 * is ignored.
 */
export function checkSquashRange(opts: {
  commits: readonly HistoryCommit[];
  range: readonly string[];
  tip: string | null;
  branch: string | null;
  busy: boolean;
  uncommitted?: string;
}): SquashCheck {
  if (opts.busy) return { ok: false, reason: t('A Git operation is already in progress') };
  if (opts.branch == null || opts.tip == null) return { ok: false, reason: t('Check out a branch to squash.') };
  const wanted = new Set(opts.range.filter((hash) => hash && hash !== (opts.uncommitted ?? '*')));
  if (wanted.size < 2) return { ok: false, reason: t('Select two or more commits to squash.') };
  if (!wanted.has(opts.tip)) return { ok: false, reason: t('Select consecutive commits starting at the branch tip.') };
  const byHash = new Map(opts.commits.map((commit) => [commit.hash, commit]));
  const chain: string[] = [];
  let cursor: string | null = opts.tip;
  while (cursor != null && wanted.has(cursor)) {
    chain.push(cursor);
    const commit = byHash.get(cursor);
    cursor = commit && commit.parents.length === 1 ? commit.parents[0]! : null;
  }
  if (chain.length !== wanted.size) return { ok: false, reason: t('Select consecutive commits with no gaps.') };
  if (chain.some((hash) => (byHash.get(hash)?.parents.length ?? 0) > 1)) {
    return { ok: false, reason: t('Merge commits cannot be squashed.') };
  }
  const oldest = byHash.get(chain[chain.length - 1]!);
  if (!oldest) return { ok: false, reason: t('Cannot squash past the loaded history.') };
  if (oldest.parents.length !== 1) return { ok: false, reason: t('The root commit cannot be squashed.') };
  return { ok: true, hashes: [...chain].reverse(), base: oldest.parents[0]! };
}

/** `format-patch` mail starts with `From <sha>`. A raw diff does not. */
export function detectPatchKind(text: string): 'am' | 'apply' {
  const sample = text.slice(0, 4096).replace(/^\uFEFF/, '');
  return /^From [0-9a-f]{40} /m.test(sample) ? 'am' : 'apply';
}

export function patchFileName(label: string): string {
  const cleaned = label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${cleaned || 'changes'}.patch`;
}

/** Repo-relative paths git can take after `--`. Rejects absolute paths and `..`. */
export function safeRepoPaths(paths: readonly string[]): string[] {
  return paths.map((raw) => {
    const normalized = raw.replaceAll('\\', '/').replace(/^\.\//, '');
    const parts = normalized.split('/');
    if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || parts.includes('..') || parts.includes('')) {
      throw new Error(`Invalid path: ${raw}`);
    }
    return normalized;
  });
}
