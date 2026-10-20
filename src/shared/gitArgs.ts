import type { GitAction } from './protocol';

export function mergeArgs(action: Extract<GitAction, { kind: 'merge' }>): string[] {
  const args = ['merge'];
  if (action.noFastForward) args.push('--no-ff');
  if (action.noCommit || action.squash) args.push('--no-commit');
  if (action.squash) args.push('--squash');
  args.push(action.ref);
  return args;
}

export function rebaseArgs(action: Extract<GitAction, { kind: 'rebase' }>): string[] {
  const args = ['rebase'];
  if (action.ignoreDate) args.push('--committer-date-is-author-date');
  args.push(action.ref);
  return args;
}

/**
 * Revision passed to `git rebase`. Remote-tracking branches and tags are fully
 * qualified so a local branch of the same name is not used instead.
 */
export function rebaseRevision(kind: 'head' | 'remote' | 'tag' | 'commit', name: string): string {
  if (kind === 'remote') return `refs/remotes/${name}`;
  if (kind === 'tag') return `refs/tags/${name}`;
  return name;
}

/** Rebase one named branch onto another. `git rebase <onto> <branch>` checks that branch out. */
export function rebaseBranchArgs(onto: string, branch: string, ignoreDate: boolean): string[] {
  const args = ['rebase'];
  if (ignoreDate) args.push('--committer-date-is-author-date');
  args.push(onto, branch);
  return args;
}

export function cherryPickArgs(action: Extract<GitAction, { kind: 'cherryPick' }>): string[] {
  const args = ['cherry-pick'];
  if (action.noCommit) args.push('--no-commit');
  if (action.recordOrigin) args.push('-x');
  if (action.parent != null && action.hashes.length === 1) args.push('-m', String(action.parent));
  args.push(...action.hashes);
  return args;
}

export function revertArgs(action: Extract<GitAction, { kind: 'revert' }>): string[] {
  const args = ['revert', '--no-edit'];
  if (action.noCommit) args.push('--no-commit');
  if (action.parent != null) args.push('-m', String(action.parent));
  args.push(action.hash);
  return args;
}

export function stashPushArgs(action: Extract<GitAction, { kind: 'stash' }>): string[] {
  const args = ['stash', 'push'];
  if (action.paths?.length) {
    args.push('--include-untracked');
    if (action.message) args.push('-m', action.message);
    args.push('--', ...action.paths);
    return args;
  }
  if (action.includeUntracked) args.push('-u');
  if (action.message) args.push('-m', action.message);
  return args;
}

export function pullArgs(action: {
  remote: string;
  branch: string;
  rebase: boolean;
  noFastForward: boolean;
  squash: boolean;
}): string[] {
  const args = ['pull'];
  if (action.rebase) args.push('--rebase');
  else {
    if (action.noFastForward) args.push('--no-ff');
    if (action.squash) args.push('--squash', '--no-commit');
  }
  args.push(action.remote, action.branch);
  return args;
}

export function applyPatchArgs(commits: boolean, file: string): string[] {
  return commits ? ['am', '--3way', '--', file] : ['apply', '--3way', '--', file];
}

export function stashApplyArgs(action: Extract<GitAction, { kind: 'stashApply' }>): string[] {
  const args = ['stash', action.pop ? 'pop' : 'apply'];
  if (action.reinstateIndex) args.push('--index');
  args.push(action.name);
  return args;
}

export function parseGitVersionTuple(text: string): [number, number] {
  const m = text.match(/(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

export function pushBranchArgs(
  action: Extract<GitAction, { kind: 'pushBranch' }>,
  remote: string,
  setUpstream: boolean,
): string[] {
  const args = ['push'];
  if (setUpstream) args.push('-u');
  if (action.mode === 'force-with-lease') args.push('--force-with-lease');
  else if (action.mode === 'force') args.push('--force');
  args.push(remote, action.name);
  return args;
}
