import { t } from '@vscode/l10n';
import { refDisplayName } from './refsList';
import type { CompareOverlap, CompareRelation, CompareSplit, FileChange, GraphRef } from './types';

/** Shown when the two revisions have no merge base, including a worktree comparison. */
export function noCommonParentNote(): string {
  return t('No common parent. Showing the snapshot diff.');
}

export type CompareView = 'diverge' | 'snapshot';

/**
 * Path of the file at the common parent.
 * A rename uses its old path so it matches an edit of the original on the other side.
 */
export function compareFileKey(file: { path: string; oldPath?: string }): string {
  return file.oldPath ?? file.path;
}

export function classifyCompareFiles(
  left: readonly FileChange[],
  right: readonly FileChange[],
): Pick<CompareSplit, 'leftOnly' | 'rightOnly' | 'both'> {
  const rightByKey = new Map<string, FileChange[]>();
  for (const file of right) {
    const key = compareFileKey(file);
    const bucket = rightByKey.get(key);
    if (bucket) bucket.push(file);
    else rightByKey.set(key, [file]);
  }
  const used = new Set<FileChange>();
  const leftOnly: FileChange[] = [];
  const both: CompareOverlap[] = [];
  for (const file of left) {
    const key = compareFileKey(file);
    const match = rightByKey.get(key)?.find((item) => !used.has(item));
    if (!match) {
      leftOnly.push(file);
      continue;
    }
    used.add(match);
    both.push({ key, left: file, right: match });
  }
  return { leftOnly, rightOnly: right.filter((file) => !used.has(file)), both };
}

/** `left` contains `right` when the merge base is `right` (right is the ancestor). */
export function compareRelation(base: string, left: string, right: string): CompareRelation {
  if (left === right) return 'same';
  if (base === right) return 'left-contains-right';
  if (base === left) return 'right-contains-left';
  return 'diverged';
}

export function compareBanners(opts: {
  relation: CompareRelation;
  leftLabel: string;
  rightLabel: string;
  severalParents: boolean;
  baseLabel: string;
  leftEmpty: boolean;
  rightEmpty: boolean;
}): string[] {
  const lines: string[] = [];
  if (opts.severalParents) lines.push(t('Several common parents. Using {0}.', opts.baseLabel));
  if (opts.relation === 'same') {
    lines.push(t('These commits are the same.'));
    return lines;
  }
  if (opts.relation === 'left-contains-right') {
    lines.push(t('{0} is an ancestor of {1}.', opts.rightLabel, opts.leftLabel));
    return lines;
  }
  if (opts.relation === 'right-contains-left') {
    lines.push(t('{0} is an ancestor of {1}.', opts.leftLabel, opts.rightLabel));
    return lines;
  }
  if (opts.leftEmpty) lines.push(t('{0} has no file changes since the common parent.', opts.leftLabel));
  if (opts.rightEmpty) lines.push(t('{0} has no file changes since the common parent.', opts.rightLabel));
  return lines;
}

export type CompareOpenDiff = { hash: string; parent?: string; compare?: string };

/** Since diverge opens the file against the common parent. Snapshot keeps the direct diff. */
export function compareOpenDiff(opts: {
  view: CompareView;
  hash: string;
  compare?: string;
  base?: string;
  rev?: string;
}): CompareOpenDiff {
  if (opts.view === 'diverge' && opts.base && opts.rev) return { hash: opts.rev, parent: opts.base };
  return opts.compare ? { hash: opts.hash, compare: opts.compare } : { hash: opts.hash };
}

/**
 * Name of the branch at `rev`, from refs already loaded.
 * One local branch wins. With no local branch, one remote branch wins.
 * Several branches return undefined so the caller keeps the hash.
 */
export function branchNameAt(rev: string, refs: readonly GraphRef[]): string | undefined {
  const locals = refs.filter((ref) => ref.kind === 'head' && ref.hash === rev && ref.name !== 'HEAD' && !ref.name.startsWith('glob:'));
  if (locals.length === 1) return refDisplayName(locals[0]!);
  if (locals.length > 1) return undefined;
  const remotes = refs.filter((ref) => ref.kind === 'remote' && ref.hash === rev && !ref.name.startsWith('glob:'));
  if (remotes.length === 1) return refDisplayName(remotes[0]!);
  return undefined;
}
