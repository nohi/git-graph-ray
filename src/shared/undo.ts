import type { GitAction } from './protocol';
import type { GraphCommit, GraphRef } from './types';

export const UNDO_LIMIT = 50;

export const REMOTE_BRANCH_WARNING =
  'A remote-tracking branch points at a commit this change moves. Only the local branch is restored.';

export const DIRTY_RESET_WARNING = 'Uncommitted changes will be discarded.';

export type RefPoint = { name: string; hash: string };

export type TagPoint = { name: string; hash: string; commit: string };

export type StashPoint = { hash: string; message: string };

export type LocalCheckpoint = {
  headHash: string | null;
  branch: string | null;
  branches: RefPoint[];
  tags: TagPoint[];
  stashes: StashPoint[];
};

export type RemoteTip = { name: string; hash: string };

export type UndoEntry = {
  label: string;
  actionWarning: string | null;
  before: LocalCheckpoint;
  after: LocalCheckpoint;
  /** `soft` puts a commit's changes back in the index instead of discarding them. */
  tipReset?: 'soft' | 'hard';
};

export type UndoStack = { undo: UndoEntry[]; redo: UndoEntry[] };

export type RefChange = {
  kind: 'branch' | 'tag' | 'head' | 'stash';
  name: string;
  from: string | null;
  to: string | null;
};

export type RestorePlan = {
  args: string[][];
  commands: string[];
  warning: string | null;
  hardReset: boolean;
  changes: RefChange[];
};

const PULL_WARNING = 'This pull updated remote-tracking branches. Only the local branch is restored.';
const FETCH_INTO_WARNING = 'This fetched into a local branch. Only the local branch is restored.';
const CHECKOUT_PULL_WARNING = 'The checkout also pulled from the remote. Only local refs are restored.';
const DELETE_REMOTE_BRANCH_WARNING = 'The remote branch was deleted and will not be restored.';
const DELETE_REMOTE_TAG_WARNING = 'The remote tag was deleted and will not be restored.';
const PUSH_TAG_WARNING = 'The tag was pushed. The remote tag is left unchanged.';

export function undoPolicy(action: GitAction): { record: boolean; warning: string | null } {
  switch (action.kind) {
    case 'worktreeAdd':
    case 'worktreeRemove':
    case 'worktreeOpen':
    case 'openScm':
    case 'fetchRemote':
    case 'pushBranch':
    case 'pushTag':
    case 'deleteRemoteBranch':
    case 'cleanUntracked':
    case 'continueOperation':
    case 'abortOperation':
      return { record: false, warning: null };
    case 'rebase':
      return action.interactive ? { record: false, warning: null } : { record: true, warning: null };
    case 'rebaseBranches':
      return { record: true, warning: null };
    case 'checkoutBranch':
      return { record: true, warning: action.pullAfterwards ? CHECKOUT_PULL_WARNING : null };
    case 'deleteBranch':
      return { record: true, warning: action.deleteOnRemote ? DELETE_REMOTE_BRANCH_WARNING : null };
    case 'deleteTag':
      return { record: true, warning: action.deleteOnRemote ? DELETE_REMOTE_TAG_WARNING : null };
    case 'addTag':
      return { record: true, warning: action.pushTo?.length ? PUSH_TAG_WARNING : null };
    case 'pullBranch':
      return { record: true, warning: PULL_WARNING };
    case 'fetchIntoLocal':
      return { record: true, warning: FETCH_INTO_WARNING };
    default:
      return { record: true, warning: null };
  }
}

export function undoLabel(action: GitAction): string {
  switch (action.kind) {
    case 'checkoutCommit':
      return `Checkout ${shortHash(action.hash)}`;
    case 'checkoutBranch':
      return `Checkout ${action.name}`;
    case 'checkoutRemote':
      return `Checkout ${action.localName}`;
    case 'createBranch':
      return `Create branch ${action.name}`;
    case 'renameBranch':
      return `Rename branch ${action.oldName} to ${action.newName}`;
    case 'deleteBranch':
      return `Delete branch ${action.name}`;
    case 'deleteRemoteBranch':
      return `Delete remote branch ${action.name}`;
    case 'merge':
      return `Merge ${action.ref}`;
    case 'rebase':
      return `Rebase onto ${action.ref}`;
    case 'rebaseBranches': {
      const count = action.branches.length;
      return `Rebase ${count} ${count === 1 ? 'branch' : 'branches'} onto ${action.onto}`;
    }
    case 'cherryPick':
      return `Cherry-pick ${shortHash(action.hash)}`;
    case 'revert':
      return `Revert ${shortHash(action.hash)}`;
    case 'reset':
      return `Reset to ${action.hash === 'HEAD' ? 'HEAD' : shortHash(action.hash)}`;
    case 'dropCommit':
      return `Drop ${shortHash(action.hash)}`;
    case 'reword':
      return `Reword ${shortHash(action.hash)}`;
    case 'addTag':
      return `Create tag ${action.name}`;
    case 'deleteTag':
      return `Delete tag ${action.name}`;
    case 'pushTag':
      return `Push tag ${action.name}`;
    case 'stash':
      return 'Stash';
    case 'stashApply':
      return action.pop ? 'Pop stash' : 'Apply stash';
    case 'stashDrop':
      return 'Drop stash';
    case 'stashCreateBranch':
      return `Create branch ${action.name} from stash`;
    case 'cleanUntracked':
      return 'Clean untracked files';
    case 'pushBranch':
      return `Push ${action.name}`;
    case 'pullBranch':
      return `Pull ${action.remote}/${action.branch}`;
    case 'fetchRemote':
      return 'Fetch';
    case 'fetchIntoLocal':
      return `Fetch into ${action.local}`;
    case 'worktreeAdd':
      return 'Add worktree';
    case 'worktreeOpen':
      return 'Open worktree';
    case 'worktreeRemove':
      return 'Remove worktree';
    case 'openScm':
      return 'Open Source Control';
    case 'continueOperation':
      return `Continue ${action.operation}`;
    case 'abortOperation':
      return `Abort ${action.operation}`;
  }
}

export function checkpointsEqual(a: LocalCheckpoint, b: LocalCheckpoint): boolean {
  return (
    a.headHash === b.headHash &&
    a.branch === b.branch &&
    samePoints(a.branches, b.branches) &&
    sameTags(a.tags, b.tags) &&
    sameStashes(a.stashes, b.stashes)
  );
}

export function pushUndo(stack: UndoStack, entry: UndoEntry, limit = UNDO_LIMIT): void {
  stack.undo.push(entry);
  if (stack.undo.length > limit) stack.undo.splice(0, stack.undo.length - limit);
  stack.redo.length = 0;
}

export function moveUndo(stack: UndoStack, direction: 'undo' | 'redo', limit = UNDO_LIMIT): UndoEntry | null {
  const from = direction === 'undo' ? stack.undo : stack.redo;
  const to = direction === 'undo' ? stack.redo : stack.undo;
  const entry = from.pop();
  if (!entry) return null;
  to.push(entry);
  if (to.length > limit) to.splice(0, to.length - limit);
  return entry;
}

export function moveUndoSteps(stack: UndoStack, direction: 'undo' | 'redo', steps: number, limit = UNDO_LIMIT): UndoEntry[] {
  const moved: UndoEntry[] = [];
  for (let i = 0; i < steps; i++) {
    const entry = moveUndo(stack, direction, limit);
    if (!entry) break;
    moved.push(entry);
  }
  return moved;
}

/** Entries are oldest-first, matching the stack arrays. `steps` counts from the newest end. */
export function historyRange(
  entries: UndoEntry[],
  direction: 'undo' | 'redo',
  steps: number,
): { entries: UndoEntry[]; from: LocalCheckpoint; to: LocalCheckpoint } | null {
  if (!Number.isInteger(steps) || steps < 1 || steps > entries.length) return null;
  const slice = entries.slice(-steps);
  for (let i = 0; i < slice.length - 1; i++) {
    const older = direction === 'undo' ? slice[i]! : slice[i + 1]!;
    const newer = direction === 'undo' ? slice[i + 1]! : slice[i]!;
    if (!checkpointsEqual(older.after, newer.before)) return null;
  }
  const top = slice[slice.length - 1]!;
  const far = slice[0]!;
  if (direction === 'undo') return { entries: slice, from: top.after, to: far.before };
  return { entries: slice, from: top.before, to: far.after };
}

export function rangeTipReset(entries: UndoEntry[]): 'soft' | 'hard' {
  return entries.length > 0 && entries.every((entry) => entry.tipReset === 'soft') ? 'soft' : 'hard';
}

export function rangeWarning(entries: UndoEntry[]): string | null {
  const parts = [...new Set(entries.map((entry) => entry.actionWarning).filter((warning): warning is string => Boolean(warning)))];
  return parts.length ? parts.join(' ') : null;
}

export function rangeLabel(entries: UndoEntry[]): string {
  const top = entries[entries.length - 1];
  if (!top) return '';
  if (entries.length === 1) return top.label;
  return `${top.label} (+${entries.length - 1} more)`;
}

export function undoEnds(entry: UndoEntry, direction: 'undo' | 'redo'): { from: LocalCheckpoint; to: LocalCheckpoint } {
  return direction === 'undo' ? { from: entry.after, to: entry.before } : { from: entry.before, to: entry.after };
}

export function needsUndoDialog(plan: RestorePlan, preview: boolean): boolean {
  return preview || plan.warning != null || plan.hardReset;
}

export function planRestore(input: {
  current: LocalCheckpoint;
  target: LocalCheckpoint;
  remotes: RemoteTip[];
  dirty: boolean;
  actionWarning: string | null;
  tipReset?: 'soft' | 'hard';
}): RestorePlan {
  const current = input.current;
  const target = input.target;
  const curBranches = branchMap(current.branches);
  const tgtBranches = branchMap(target.branches);
  const args: string[][] = [];

  for (const name of sortedNames(curBranches, tgtBranches)) {
    if (name === current.branch) continue;
    const next = tgtBranches.get(name);
    const prev = curBranches.get(name);
    if (!next || next === prev) continue;
    args.push(prev ? ['update-ref', `refs/heads/${name}`, next, prev] : ['update-ref', `refs/heads/${name}`, next]);
  }

  const nextHead = target.branch ? (tgtBranches.get(target.branch) ?? target.headHash) : target.headHash;
  const resetMode = input.tipReset === 'soft' ? '--soft' : '--hard';
  if (current.branch && current.branch === target.branch) {
    if (nextHead && nextHead !== current.headHash) args.push(['reset', resetMode, nextHead]);
  } else if (target.branch) {
    args.push(['checkout', target.branch]);
  } else if (nextHead && current.branch) {
    args.push(['checkout', '--detach', nextHead]);
  } else if (nextHead && nextHead !== current.headHash) {
    args.push(['reset', resetMode, nextHead]);
  }

  if (current.branch && current.branch !== target.branch) {
    const want = tgtBranches.get(current.branch);
    const had = curBranches.get(current.branch);
    if (want && had && want !== had) args.push(['update-ref', `refs/heads/${current.branch}`, want, had]);
  }

  for (const name of sortedNames(curBranches, tgtBranches)) {
    if (tgtBranches.has(name)) continue;
    const prev = curBranches.get(name);
    if (!prev) continue;
    args.push(['update-ref', '-d', `refs/heads/${name}`, prev]);
  }

  const curTags = new Map(input.current.tags.map((tag) => [tag.name, tag.hash]));
  const tgtTags = new Map(input.target.tags.map((tag) => [tag.name, tag.hash]));
  for (const name of sortedNames(curTags, tgtTags)) {
    const next = tgtTags.get(name);
    const prev = curTags.get(name);
    if (next === prev) continue;
    if (!next) {
      if (prev) args.push(['update-ref', '-d', `refs/tags/${name}`, prev]);
      continue;
    }
    args.push(prev ? ['update-ref', `refs/tags/${name}`, next, prev] : ['update-ref', `refs/tags/${name}`, next]);
  }

  if (!sameStashes(current.stashes, target.stashes)) {
    if (current.stashes.length) args.push(['update-ref', '-d', 'refs/stash']);
    // stash@{0} is the newest entry. store pushes onto the front, so write oldest first.
    for (const stash of [...target.stashes].reverse()) {
      args.push(stash.message ? ['stash', 'store', '-m', stash.message, stash.hash] : ['stash', 'store', stash.hash]);
    }
  }

  const hardReset = input.dirty && args.some((cmd) => cmd[0] === 'reset' && cmd[1] === '--hard');
  const warning = joinWarnings([
    input.actionWarning,
    remoteOverlap(current, target, input.remotes) ? REMOTE_BRANCH_WARNING : null,
    hardReset ? DIRTY_RESET_WARNING : null,
  ]);
  return {
    args,
    commands: args.map(formatGitCommand),
    warning,
    hardReset,
    changes: refChanges(current, target),
  };
}

export function formatGitCommand(args: string[]): string {
  return `git ${args.map(quoteGitArg).join(' ')}`;
}

export function formatRefChange(change: RefChange): string {
  return `${change.name}: ${shortenHashes(change.from ?? '(none)')} → ${shortenHashes(change.to ?? '(none)')}`;
}

export function checkpointRefs(checkpoint: LocalCheckpoint, remoteRefs: GraphRef[]): GraphRef[] {
  const refs: GraphRef[] = [];
  for (const branch of checkpoint.branches) refs.push({ kind: 'head', name: branch.name, hash: branch.hash });
  if (!checkpoint.branch && checkpoint.headHash) refs.push({ kind: 'head', name: 'HEAD', hash: checkpoint.headHash });
  for (const tag of checkpoint.tags) refs.push({ kind: 'tag', name: tag.name, hash: tag.commit });
  checkpoint.stashes.forEach((stash, index) => {
    const name = stash.message ? `stash@{${index}} ${stash.message}` : `stash@{${index}}`;
    refs.push({ kind: 'stash', name, hash: stash.hash });
  });
  for (const remote of remoteRefs) {
    if (remote.kind !== 'remote' || remote.name.endsWith('/HEAD')) continue;
    refs.push(remote);
  }
  return refs;
}

export type PreviewHead = { branch: string | null; hash: string | null };

export function previewWindow(
  before: GraphCommit[],
  after: GraphCommit[],
  head?: PreviewHead | null,
): { before: GraphCommit[]; after: GraphCommit[] } {
  const related = relatedCommitSet(before, after);
  const headKeep = head ? headCommitSet(before, after, related, head) : new Set<string>();
  return {
    before: pickPreviewCommits(before, related, headKeep),
    after: pickPreviewCommits(after, related, headKeep),
  };
}

/**
 * Align both sides on the commits that explain the change.
 * Commits and branch labels that exist on only one side are marked `ghost`
 * so a deleted branch or merge commit stays visible on the other graph.
 * Unrelated branches that merely sit inside that span are omitted unless `showUnrelated` is set.
 */
export type PreviewOptions = {
  showUnrelated?: boolean;
  showHead?: boolean;
  head?: PreviewHead | null;
};

export function presentPreview(
  before: GraphCommit[],
  after: GraphCommit[],
  options: boolean | PreviewOptions = {},
): { before: GraphCommit[]; after: GraphCommit[] } {
  const opts: PreviewOptions = typeof options === 'boolean' ? { showUnrelated: options } : options;
  const showUnrelated = opts.showUnrelated === true;
  const showHead = opts.showHead === true;
  const related = relatedCommitSet(before, after);
  const relatedKeys = relatedRefKeys(before, after);
  const headKeep = opts.head ? headCommitSet(before, after, related, opts.head) : new Set<string>();
  const headKey = showHead ? headRefKey(opts.head) : null;
  const keepKeys = new Set<string>(headKey ? [headKey] : []);
  const wanted = (commits: GraphCommit[], hash: string) => {
    if (related.has(hash)) return true;
    if (showHead && headKeep.has(hash)) return true;
    return showUnrelated && spanHashes(commits, related).has(hash);
  };
  const pick = (commits: GraphCommit[]) => commits.filter((commit) => wanted(commits, commit.hash));
  const union = orderPreview(dedupeCommits([...pick(before), ...pick(after)]));
  return {
    before: projectSide(before, union, related, relatedKeys, showUnrelated, keepKeys),
    after: projectSide(after, union, related, relatedKeys, showUnrelated, keepKeys),
  };
}

export function externalCommitChange(input: {
  prev: LocalCheckpoint;
  next: LocalCheckpoint;
  parentOfNext: string | null;
  parentOfPrev: string | null;
  subject: string;
}): { label: string; tipReset: 'soft' } | null {
  if (input.prev.branch !== input.next.branch) return null;
  if (!input.prev.headHash || !input.next.headHash || input.prev.headHash === input.next.headHash) return null;
  if (!sameTags(input.prev.tags, input.next.tags) || !sameStashes(input.prev.stashes, input.next.stashes)) return null;
  if (!onlyCurrentBranchMoved(input.prev, input.next)) return null;
  if (input.parentOfNext === input.prev.headHash) return { label: commitLabel('Commit', input.subject), tipReset: 'soft' };
  if (input.parentOfPrev && input.parentOfNext === input.parentOfPrev) return { label: commitLabel('Amend', input.subject), tipReset: 'soft' };
  return null;
}

const PREVIEW_CAP = 80;

function refKey(ref: GraphRef): string {
  return `${ref.kind}:${ref.name}`;
}

function combinedCommits(before: GraphCommit[], after: GraphCommit[]): Map<string, GraphCommit> {
  const map = new Map<string, GraphCommit>();
  for (const commit of [...before, ...after]) {
    const prev = map.get(commit.hash);
    if (!prev) {
      map.set(commit.hash, { ...commit, refs: [...commit.refs] });
      continue;
    }
    const refs = new Map(prev.refs.map((ref) => [refKey(ref), ref]));
    for (const ref of commit.refs) refs.set(refKey(ref), ref);
    const base = commit.parents.length > prev.parents.length ? commit : prev;
    map.set(commit.hash, { ...base, refs: [...refs.values()] });
  }
  return map;
}

function refsByKey(commits: GraphCommit[]): Map<string, GraphRef> {
  const map = new Map<string, GraphRef>();
  for (const commit of commits) {
    for (const ref of commit.refs) {
      if (ref.kind === 'worktree') continue;
      map.set(refKey(ref), ref);
    }
  }
  return map;
}

function ancestorSet(byHash: Map<string, GraphCommit>, seeds: Iterable<string>): Set<string> {
  const seen = new Set<string>();
  const stack = [...seeds];
  while (stack.length) {
    const hash = stack.pop()!;
    if (seen.has(hash) || !byHash.has(hash)) continue;
    seen.add(hash);
    for (const parent of byHash.get(hash)?.parents ?? []) stack.push(parent);
  }
  return seen;
}

function relatedRefKeys(before: GraphCommit[], after: GraphCommit[]): Set<string> {
  const left = refsByKey(before);
  const right = refsByKey(after);
  const keys = new Set<string>();
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(key);
    const b = right.get(key);
    if (!a || !b || a.hash !== b.hash) keys.add(key);
  }
  const byHash = combinedCommits(before, after);
  for (const key of [...keys]) {
    const olderHash = left.get(key)?.hash ?? null;
    const newerHash = right.get(key)?.hash ?? null;
    if (!olderHash || !newerHash || olderHash === newerHash) continue;
    const fromOlder = ancestorSet(byHash, [olderHash]);
    const fromNewer = ancestorSet(byHash, [newerHash]);
    let newer = '';
    let older = '';
    if (fromNewer.has(olderHash)) {
      newer = newerHash;
      older = olderHash;
    } else if (fromOlder.has(newerHash)) {
      newer = olderHash;
      older = newerHash;
    } else continue;
    const exclusive = ancestorSet(byHash, [newer]);
    for (const hash of ancestorSet(byHash, [older])) exclusive.delete(hash);
    if (exclusive.size === 0) continue;
    for (const commit of byHash.values()) {
      for (const ref of commit.refs) {
        if (ref.kind === 'worktree') continue;
        if (exclusive.has(ref.hash)) keys.add(refKey(ref));
      }
    }
  }
  return keys;
}

function relatedCommitSet(before: GraphCommit[], after: GraphCommit[]): Set<string> {
  const byHash = combinedCommits(before, after);
  const keys = relatedRefKeys(before, after);
  const seeds = new Set<string>();
  const otherTips: string[] = [];
  for (const commit of byHash.values()) {
    for (const ref of commit.refs) {
      if (ref.kind === 'worktree') continue;
      if (keys.has(refKey(ref))) seeds.add(ref.hash);
      else otherTips.push(ref.hash);
    }
  }
  if (seeds.size === 0) return new Set();
  return selectFromSeeds(byHash, [...seeds], otherTips);
}

function selectFromSeeds(byHash: Map<string, GraphCommit>, seeds: string[], otherTips: string[]): Set<string> {
  const present = seeds.filter((hash) => byHash.has(hash));
  const keep = new Set<string>();
  if (present.length === 0) return keep;
  if (present.length >= 2) {
    let common: Set<string> | null = null;
    for (const seed of present) {
      const anc = ancestorSet(byHash, [seed]);
      if (!common) common = new Set(anc);
      else for (const hash of [...common]) if (!anc.has(hash)) common.delete(hash);
    }
    const base = common && common.size > 0 ? newest(byHash, common) : [];
    if (base.length === 0) {
      for (const seed of present) keep.add(seed);
      return keep;
    }
    const stop = new Set(base);
    for (const seed of present) walkUntil(byHash, seed, stop, keep);
    for (const hash of base) keep.add(hash);
    addParents(byHash, base, keep);
    return keep;
  }
  const seed = present[0]!;
  const stable = ancestorSet(byHash, otherTips.filter((hash) => hash !== seed));
  const boundary = firstBoundary(byHash, seed, stable);
  if (!boundary) {
    takeNewest(byHash, seed, PREVIEW_CAP, keep);
    return keep;
  }
  walkUntil(byHash, seed, new Set([boundary]), keep);
  keep.add(boundary);
  addParents(byHash, [boundary], keep);
  return keep;
}

function newest(byHash: Map<string, GraphCommit>, common: Set<string>): string[] {
  const older = new Set<string>();
  for (const hash of common) {
    for (const parent of byHash.get(hash)?.parents ?? []) if (common.has(parent)) older.add(parent);
  }
  const top = [...common].filter((hash) => !older.has(hash));
  return top.length > 0 ? top : [...common];
}

function walkUntil(byHash: Map<string, GraphCommit>, start: string, stop: Set<string>, keep: Set<string>): void {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const hash = stack.pop()!;
    if (seen.has(hash) || !byHash.has(hash) || stop.has(hash)) continue;
    seen.add(hash);
    keep.add(hash);
    for (const parent of byHash.get(hash)?.parents ?? []) stack.push(parent);
  }
}

function addParents(byHash: Map<string, GraphCommit>, hashes: Iterable<string>, keep: Set<string>): void {
  for (const hash of hashes) {
    for (const parent of byHash.get(hash)?.parents ?? []) if (byHash.has(parent)) keep.add(parent);
  }
}

function firstBoundary(byHash: Map<string, GraphCommit>, start: string, stable: Set<string>): string | null {
  if (stable.has(start)) return start;
  const seen = new Set<string>([start]);
  let queue = [...(byHash.get(start)?.parents ?? [])];
  while (queue.length) {
    const next: string[] = [];
    for (const hash of queue) {
      if (seen.has(hash) || !byHash.has(hash)) continue;
      seen.add(hash);
      if (stable.has(hash)) return hash;
      next.push(...(byHash.get(hash)?.parents ?? []));
    }
    queue = next;
  }
  return null;
}

function takeNewest(byHash: Map<string, GraphCommit>, start: string, limit: number, keep: Set<string>): void {
  const seen = new Set<string>();
  let queue = [start];
  while (queue.length && keep.size < limit) {
    const next: string[] = [];
    for (const hash of queue) {
      if (seen.has(hash) || !byHash.has(hash)) continue;
      seen.add(hash);
      keep.add(hash);
      if (keep.size >= limit) return;
      next.push(...(byHash.get(hash)?.parents ?? []));
    }
    queue = next;
  }
}

const HEAD_CAP = 12;

function headRefKey(head: PreviewHead | null | undefined): string | null {
  if (!head) return null;
  if (head.branch) return `head:${head.branch}`;
  if (head.hash) return 'head:HEAD';
  return null;
}

function headTip(byHash: Map<string, GraphCommit>, head: PreviewHead): string | null {
  if (head.branch) {
    for (const commit of byHash.values()) {
      if (commit.refs.some((ref) => ref.kind === 'head' && ref.name === head.branch)) return commit.hash;
    }
  }
  if (head.hash && byHash.has(head.hash)) return head.hash;
  return null;
}

function headCommitSet(before: GraphCommit[], after: GraphCommit[], related: Set<string>, head: PreviewHead): Set<string> {
  const byHash = combinedCommits(before, after);
  const tip = headTip(byHash, head);
  if (!tip) return new Set();
  const keep = new Set<string>();
  const seen = new Set<string>();
  let queue = [tip];
  while (queue.length && keep.size < HEAD_CAP) {
    const next: string[] = [];
    for (const hash of queue) {
      if (seen.has(hash) || !byHash.has(hash)) continue;
      seen.add(hash);
      keep.add(hash);
      if (related.has(hash) || keep.size >= HEAD_CAP) continue;
      next.push(...(byHash.get(hash)?.parents ?? []));
    }
    queue = next;
  }
  return keep;
}

function spanHashes(commits: GraphCommit[], related: Set<string>): Set<string> {
  return new Set(expandSpan(commits, related).map((commit) => commit.hash));
}

function pickPreviewCommits(commits: GraphCommit[], related: Set<string>, headKeep: Set<string>): GraphCommit[] {
  const span = spanHashes(commits, related);
  return commits.filter((commit) => span.has(commit.hash) || headKeep.has(commit.hash));
}

function expandSpan(commits: GraphCommit[], keep: Set<string>): GraphCommit[] {
  let min = -1;
  let max = -1;
  commits.forEach((commit, index) => {
    if (!keep.has(commit.hash)) return;
    if (min < 0) min = index;
    max = index;
  });
  if (min < 0) return [];
  return commits.slice(Math.max(0, min - 1), Math.min(commits.length, max + 2));
}

function dedupeCommits(commits: GraphCommit[]): GraphCommit[] {
  return [...combinedCommits(commits, []).values()];
}

function orderPreview(commits: GraphCommit[]): GraphCommit[] {
  const byHash = combinedCommits(commits, []);
  const cache = new Map<string, Set<string>>();
  const ancestorsOf = (hash: string) => {
    const hit = cache.get(hash);
    if (hit) return hit;
    const set = ancestorSet(byHash, [hash]);
    cache.set(hash, set);
    return set;
  };
  return [...commits].sort((a, b) => {
    if (a.hash === b.hash) return 0;
    if (ancestorsOf(a.hash).has(b.hash)) return -1;
    if (ancestorsOf(b.hash).has(a.hash)) return 1;
    return b.committerDate - a.committerDate || a.hash.localeCompare(b.hash);
  });
}

function projectSide(
  side: GraphCommit[],
  union: GraphCommit[],
  related: Set<string>,
  relatedKeys: Set<string>,
  showUnrelated: boolean,
  keepKeys: Set<string>,
): GraphCommit[] {
  const have = new Map(side.map((commit) => [commit.hash, commit]));
  const rows: GraphCommit[] = [];
  for (const commit of union) {
    const real = have.get(commit.hash) ?? null;
    if (!real && !related.has(commit.hash)) continue;
    const ghost = !real;
    rows.push({
      ...(real ?? commit),
      refs: decorateRefs(real?.refs ?? null, refsForHash(union, commit.hash), relatedKeys, showUnrelated, ghost, keepKeys),
      ghost,
    });
  }
  return rows;
}

function refsForHash(commits: GraphCommit[], hash: string): GraphRef[] {
  const map = new Map<string, GraphRef>();
  for (const commit of commits) {
    if (commit.hash !== hash) continue;
    for (const ref of commit.refs) map.set(refKey(ref), ref);
  }
  return [...map.values()];
}

function decorateRefs(
  realRefs: GraphRef[] | null,
  combined: GraphRef[],
  relatedKeys: Set<string>,
  showUnrelated: boolean,
  commitGhost: boolean,
  keepKeys: Set<string>,
): GraphRef[] {
  const mine = new Set((realRefs ?? []).map(refKey));
  const chosen: GraphRef[] = [];
  const seen = new Set<string>();
  const take = (ref: GraphRef) => {
    if (ref.kind === 'worktree' && !showUnrelated) return;
    const key = refKey(ref);
    if (seen.has(key)) return;
    const related = relatedKeys.has(key) || keepKeys.has(key);
    if (commitGhost) {
      if (!related && !showUnrelated) return;
    } else if (!related && !(showUnrelated && mine.has(key))) {
      return;
    }
    seen.add(key);
    chosen.push({ ...ref, ghost: commitGhost || !mine.has(key) });
  };
  for (const ref of realRefs ?? []) take(ref);
  for (const ref of combined) take(ref);
  return chosen;
}

function onlyCurrentBranchMoved(prev: LocalCheckpoint, next: LocalCheckpoint): boolean {
  const prevMap = branchMap(prev.branches);
  const nextMap = branchMap(next.branches);
  for (const name of new Set([...prevMap.keys(), ...nextMap.keys()])) {
    const before = prevMap.get(name) ?? null;
    const after = nextMap.get(name) ?? null;
    if (before === after) continue;
    if (name !== next.branch) return false;
    if (before !== prev.headHash || after !== next.headHash) return false;
  }
  return true;
}

function commitLabel(kind: 'Commit' | 'Amend', subject: string): string {
  const line = (subject.split(/\r?\n/, 1)[0] ?? '').replace(/\s+/g, ' ').trim();
  const text = line.length > 72 ? `${line.slice(0, 72)}…` : line;
  return text ? `${kind} ${text}` : kind;
}

function refChanges(current: LocalCheckpoint, target: LocalCheckpoint): RefChange[] {
  const changes: RefChange[] = [];
  const curBranches = branchMap(current.branches);
  const tgtBranches = branchMap(target.branches);
  if (current.branch !== target.branch || (current.branch == null && current.headHash !== target.headHash)) {
    changes.push({ kind: 'head', name: 'HEAD', from: headLabel(current), to: headLabel(target) });
  }
  for (const name of sortedNames(curBranches, tgtBranches)) {
    const from = curBranches.get(name) ?? null;
    const to = tgtBranches.get(name) ?? null;
    if (from === to) continue;
    changes.push({ kind: 'branch', name, from, to });
  }
  const curTags = new Map(current.tags.map((tag) => [tag.name, tag.hash]));
  const tgtTags = new Map(target.tags.map((tag) => [tag.name, tag.hash]));
  for (const name of sortedNames(curTags, tgtTags)) {
    const from = curTags.get(name) ?? null;
    const to = tgtTags.get(name) ?? null;
    if (from === to) continue;
    changes.push({ kind: 'tag', name, from, to });
  }
  if (!sameStashes(current.stashes, target.stashes)) {
    changes.push({
      kind: 'stash',
      name: 'stash',
      from: current.stashes.map((stash) => stash.hash).join(' ') || null,
      to: target.stashes.map((stash) => stash.hash).join(' ') || null,
    });
  }
  return changes;
}

function remoteOverlap(current: LocalCheckpoint, target: LocalCheckpoint, remotes: RemoteTip[]): boolean {
  const tips = new Set(remotes.map((remote) => remote.hash));
  if (tips.size === 0) return false;
  const curBranches = branchMap(current.branches);
  const tgtBranches = branchMap(target.branches);
  for (const name of sortedNames(curBranches, tgtBranches)) {
    const from = curBranches.get(name) ?? null;
    const to = tgtBranches.get(name) ?? null;
    if (from === to) continue;
    if ((from && tips.has(from)) || (to && tips.has(to))) return true;
  }
  if (current.headHash !== target.headHash) {
    if ((current.headHash && tips.has(current.headHash)) || (target.headHash && tips.has(target.headHash))) return true;
  }
  return false;
}

function headLabel(checkpoint: LocalCheckpoint): string | null {
  if (checkpoint.branch && checkpoint.headHash) return `${checkpoint.branch} ${checkpoint.headHash}`;
  return checkpoint.headHash;
}

function branchMap(points: RefPoint[]): Map<string, string> {
  return new Map(points.map((point) => [point.name, point.hash]));
}

function sortedNames(left: Map<string, string>, right: Map<string, string>): string[] {
  return [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a.localeCompare(b));
}

function samePoints(a: RefPoint[], b: RefPoint[]): boolean {
  return a.length === b.length && a.every((point, index) => point.name === b[index]?.name && point.hash === b[index]?.hash);
}

function sameTags(a: TagPoint[], b: TagPoint[]): boolean {
  return (
    a.length === b.length &&
    a.every((tag, index) => tag.name === b[index]?.name && tag.hash === b[index]?.hash && tag.commit === b[index]?.commit)
  );
}

function sameStashes(a: StashPoint[], b: StashPoint[]): boolean {
  return a.length === b.length && a.every((stash, index) => stash.hash === b[index]?.hash && stash.message === b[index]?.message);
}

function joinWarnings(parts: Array<string | null>): string | null {
  const text = parts.filter((part): part is string => Boolean(part)).join(' ');
  return text || null;
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

function shortenHashes(value: string): string {
  return value
    .split(/(\s+)/)
    .map((part) => (/^[0-9a-f]{8,}$/i.test(part) ? part.slice(0, 7) : part))
    .join('');
}

export function quoteGitArg(arg: string): string {
  if (arg.length === 0) return "''";
  if (/[\s"'\\]/.test(arg)) return `'${arg.replaceAll("'", "'\\''")}'`;
  return arg;
}
