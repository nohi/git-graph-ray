import type { GitAction } from '../../shared/protocol';
import { cherryPickArgs, mergeArgs, pushBranchArgs, rebaseArgs, rebaseBranchArgs, revertArgs, stashApplyArgs } from '../../shared/gitArgs';
import { gitEditorCommand, gitShFromExecPath, posixGitPath, rewordEditorScript, rewordSeqScript } from '../../shared/gitPath';
import { rebaseBranchesReportHtml, rebaseBranchesSequence, rebaseTargetBranches, restoreCheckoutArgs, type HeadCheckout } from '../../shared/rebaseBranches';
import { gitMaybe, gitOk } from './runner';
import { readRepoOperation } from './repoState';
import { workingTreeHasTrackedChanges } from './undo';
import { runInteractiveRebase } from './terminal';
import { PartialRemotePushError, pushTagToRemotes } from './tagPush';
import { addWorktree, removeWorktree } from './worktree';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export async function runGitAction(
  git: string,
  cwd: string,
  action: GitAction,
  opts: { signCommits: boolean; signTags: boolean; shellPath?: string },
): Promise<string | void> {
  switch (action.kind) {
    case 'checkoutCommit':
      await gitOk(git, cwd, ['checkout', action.hash]);
      return;
    case 'checkoutBranch':
      await gitOk(git, cwd, ['checkout', action.name]);
      if (action.pullAfterwards) {
        await pull(git, cwd, action.pullAfterwards, opts.signCommits);
      }
      return;
    case 'checkoutRemote':
      await gitOk(git, cwd, ['checkout', '-b', action.localName, action.remoteBranch]);
      return;
    case 'createBranch': {
      const args = ['branch', action.name, action.hash];
      await gitOk(git, cwd, args);
      if (action.checkout) await gitOk(git, cwd, ['checkout', action.name]);
      return;
    }
    case 'renameBranch':
      await gitOk(git, cwd, ['branch', '-m', action.oldName, action.newName]);
      return;
    case 'deleteBranch':
      await gitOk(git, cwd, ['branch', action.force ? '-D' : '-d', action.name]);
      if (action.deleteOnRemote) await gitOk(git, cwd, ['push', action.deleteOnRemote, '--delete', action.name]);
      return;
    case 'deleteRemoteBranch': {
      const short = action.name.includes('/') ? action.name.slice(action.name.indexOf('/') + 1) : action.name;
      await gitOk(git, cwd, ['push', action.remote, '--delete', short]);
      return;
    }
    case 'merge':
      await gitOk(git, cwd, mergeArgs(action));
      if (action.squash && !action.noCommit) {
        const msg = await squashMessage(git, cwd, action.squashMessageFormat);
        await gitOk(git, cwd, commitArgs(msg, opts.signCommits));
      }
      return;
    case 'rebase':
      if (action.interactive) {
        await runInteractiveRebase(cwd, action.ref, opts.shellPath);
        return;
      }
      await gitOk(git, cwd, rebaseArgs(action));
      return;
    case 'rebaseBranches':
      return rebaseSelectedBranches(git, cwd, action);
    case 'cherryPick':
      await gitOk(git, cwd, cherryPickArgs(action));
      return;
    case 'revert':
      await gitOk(git, cwd, revertArgs(action));
      return;
    case 'reset':
      await gitOk(git, cwd, ['reset', `--${action.mode}`, action.hash]);
      return;
    case 'dropCommit':
      await gitOk(git, cwd, ['rebase', '--onto', `${action.hash}^`, action.hash]);
      return;
    case 'reword':
      await rewordCommit(git, cwd, action.hash, action.message, opts.signCommits);
      return;
    case 'addTag': {
      const args = action.annotated
        ? ['tag', '-a', action.name, action.hash, '-m', action.message || action.name]
        : ['tag', action.name, action.hash];
      if (opts.signTags && action.annotated) args.splice(1, 0, '-s');
      await gitOk(git, cwd, args);
      await pushTagToRemotes(action.pushTo?.filter(Boolean) ?? [], async (remote) => {
        await gitOk(git, cwd, ['push', remote, action.name]);
      });
      return;
    }
    case 'deleteTag':
      await gitOk(git, cwd, ['tag', '-d', action.name]);
      if (action.deleteOnRemote) await gitOk(git, cwd, ['push', action.deleteOnRemote, `--delete`, `refs/tags/${action.name}`]);
      return;
    case 'pushTag': {
      const remotes = action.remotes.filter(Boolean);
      const done: string[] = [];
      for (const remote of remotes) {
        try {
          await gitOk(git, cwd, ['push', remote, action.name]);
          done.push(remote);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new PartialRemotePushError(detail, done);
        }
      }
      return;
    }
    case 'stash': {
      const args = ['stash', 'push'];
      if (action.includeUntracked) args.push('-u');
      if (action.message) args.push('-m', action.message);
      await gitOk(git, cwd, args);
      return;
    }
    case 'stashApply':
      await gitOk(git, cwd, stashApplyArgs(action));
      return;
    case 'stashDrop':
      await gitOk(git, cwd, ['stash', 'drop', action.name]);
      return;
    case 'stashCreateBranch':
      await gitOk(git, cwd, ['stash', 'branch', action.name, action.stash]);
      return;
    case 'cleanUntracked':
      await gitOk(git, cwd, ['clean', '-f', ...(action.directories ? ['-d'] : [])]);
      return;
    case 'pushBranch': {
      const remotes = action.remotes.filter(Boolean);
      for (let i = 0; i < remotes.length; i++) {
        await gitOk(git, cwd, pushBranchArgs(action, remotes[i]!, action.setUpstream && i === 0));
      }
      return;
    }
    case 'pullBranch':
      await pull(git, cwd, action, opts.signCommits);
      return;
    case 'fetchRemote': {
      const args = ['fetch'];
      if (action.remote) args.push(action.remote);
      else args.push('--all');
      if (action.prune) args.push('--prune');
      if (action.pruneTags) args.push('--prune-tags');
      await gitOk(git, cwd, args);
      return;
    }
    case 'fetchIntoLocal':
      await gitOk(git, cwd, [
        'fetch',
        ...(action.force ? ['--force'] : []),
        action.remoteRef.split('/')[0] ?? 'origin',
        `${action.remoteRef.slice(action.remoteRef.indexOf('/') + 1)}:${action.local}`,
      ]);
      return;
    case 'worktreeAdd':
      await addWorktree(git, cwd, action.path, action.hash, action.branch);
      return;
    case 'worktreeRemove':
      await removeWorktree(git, cwd, action.path, action.force);
      return;
    case 'worktreeOpen':
    case 'openScm':
      return;
    case 'abortOperation':
      await gitOk(git, cwd, [action.operation, '--abort']);
      return;
    case 'continueOperation':
      await continueOperation(git, cwd, action.operation);
      return;
  }
}

async function rebaseSelectedBranches(
  git: string,
  cwd: string,
  action: Extract<GitAction, { kind: 'rebaseBranches' }>,
): Promise<string | void> {
  if (await workingTreeHasTrackedChanges(git, cwd)) {
    throw new Error('Commit or stash changes before rebasing branches.');
  }
  const operation = await readRepoOperation(git, cwd);
  if (operation) throw new Error(`A ${operation.kind} is already in progress.`);
  const branches = rebaseTargetBranches(action.branches, action.onto);
  if (!branches.length || !action.onto) return;
  const head = await readHeadCheckout(git, cwd);
  const run = await rebaseBranchesSequence(branches, action.onFailure, {
    rebase: async (branch) => {
      await gitOk(git, cwd, rebaseBranchArgs(action.onto, branch, action.ignoreDate));
    },
    rebaseInProgress: async () => (await readRepoOperation(git, cwd))?.kind === 'rebase',
    abort: async () => {
      await gitOk(git, cwd, ['rebase', '--abort']);
    },
  });
  let restoreError: string | undefined;
  if (action.checkout === 'restore' && !run.blocked) {
    const args = restoreCheckoutArgs(head);
    if (args) {
      try {
        await gitOk(git, cwd, args);
      } catch (error) {
        restoreError = error instanceof Error ? error.message : String(error);
      }
    }
  }
  return rebaseBranchesReportHtml(run.outcomes, restoreError) ?? undefined;
}

async function readHeadCheckout(git: string, cwd: string): Promise<HeadCheckout> {
  const sym = (await gitMaybe(git, cwd, ['symbolic-ref', '-q', 'HEAD'])).trim();
  const branch = sym.startsWith('refs/heads/') ? sym.slice('refs/heads/'.length) : null;
  let hash: string | null = null;
  try {
    const raw = (await gitOk(git, cwd, ['rev-parse', '--verify', '--quiet', 'HEAD'])).trim();
    hash = raw || null;
  } catch {
    hash = null;
  }
  return { branch, hash };
}

async function continueOperation(git: string, cwd: string, operation: 'merge' | 'rebase' | 'cherry-pick' | 'revert'): Promise<void> {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-continue-'));
  try {
    const ed = path.join(dir, 'ed.sh');
    await fs.writeFile(ed, '#!/bin/sh\nexit 0\n', 'utf8');
    let sh = 'sh';
    if (process.platform === 'win32') {
      try {
        const execPath = (await gitOk(git, cwd, ['--exec-path'])).trim();
        sh = gitShFromExecPath(execPath, true);
      } catch {
        sh = 'sh';
      }
    }
    const editor = gitEditorCommand(sh, posixGitPath(ed));
    await gitOk(git, cwd, [operation, '--continue'], { GIT_EDITOR: editor, GIT_SEQUENCE_EDITOR: editor });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function pull(
  git: string,
  cwd: string,
  action: { remote: string; branch: string; noFastForward: boolean; squash: boolean; squashMessageFormat: 'Default' | 'Git SQUASH_MSG' },
  sign: boolean,
): Promise<void> {
  const args = ['pull'];
  if (action.noFastForward) args.push('--no-ff');
  if (action.squash) args.push('--squash', '--no-commit');
  args.push(action.remote, action.branch);
  await gitOk(git, cwd, args);
  if (action.squash) {
    const msg = await squashMessage(git, cwd, action.squashMessageFormat);
    await gitOk(git, cwd, commitArgs(msg, sign));
  }
}

async function squashMessage(git: string, cwd: string, format: 'Default' | 'Git SQUASH_MSG'): Promise<string> {
  if (format === 'Git SQUASH_MSG') {
    try {
      return await gitOk(git, cwd, ['rev-parse', '--git-path', 'SQUASH_MSG']).then(async (p) => {
        const fs = await import('node:fs/promises');
        return fs.readFile(p.trim(), 'utf8');
      });
    } catch {
      /* fall through */
    }
  }
  return 'Squashed commit';
}

function commitArgs(message: string, sign: boolean): string[] {
  const args = ['commit', '-m', message];
  if (sign) args.push('-S');
  return args;
}

async function rewordCommit(git: string, cwd: string, hash: string, message: string, sign: boolean): Promise<void> {
  const head = (await gitOk(git, cwd, ['rev-parse', 'HEAD'])).trim();
  if (head === hash || head.startsWith(hash) || hash.startsWith(head)) {
    await gitOk(git, cwd, ['commit', '--amend', '-m', message, ...(sign ? ['-S'] : [])]);
    return;
  }
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-reword-'));
  try {
    const msgFile = path.join(dir, 'msg.txt');
    await fs.writeFile(msgFile, message);
    const short = hash.slice(0, 7);
    const seq = path.join(dir, 'seq.sh');
    const ed = path.join(dir, 'ed.sh');
    await fs.writeFile(seq, rewordSeqScript(short), { encoding: 'utf8' });
    await fs.writeFile(ed, rewordEditorScript(posixGitPath(msgFile)), { encoding: 'utf8' });
    let sh = 'sh';
    if (process.platform === 'win32') {
      const candidates: string[] = [];
      try {
        const execPath = (await gitOk(git, cwd, ['--exec-path'])).trim();
        candidates.push(gitShFromExecPath(execPath, true));
      } catch {
        /* ignore */
      }
      candidates.push('C:/Program Files/Git/usr/bin/sh.exe', 'C:/Program Files (x86)/Git/usr/bin/sh.exe');
      sh = candidates.find((p) => existsSync(p)) ?? 'sh';
    }
    const env = {
      GIT_SEQUENCE_EDITOR: gitEditorCommand(sh, seq),
      GIT_EDITOR: gitEditorCommand(sh, ed),
    };
    await gitOk(git, cwd, ['rebase', '-i', `${hash}^`], env);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
