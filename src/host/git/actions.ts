import type { GitAction } from '../../shared/protocol';
import { cherryPickArgs, mergeArgs, rebaseArgs, revertArgs, stashApplyArgs } from '../../shared/gitArgs';
import { gitEditorCommand, gitShFromExecPath, posixGitPath, rewordEditorScript, rewordSeqScript } from '../../shared/gitPath';
import { gitOk } from './runner';
import { runInteractiveRebase } from './terminal';
import { addWorktree, removeWorktree } from './worktree';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export async function runGitAction(
  git: string,
  cwd: string,
  action: GitAction,
  opts: { signCommits: boolean; signTags: boolean; shellPath?: string },
): Promise<void> {
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
      if (action.pushTo) await gitOk(git, cwd, ['push', action.pushTo, action.name]);
      return;
    }
    case 'deleteTag':
      await gitOk(git, cwd, ['tag', '-d', action.name]);
      if (action.deleteOnRemote) await gitOk(git, cwd, ['push', action.deleteOnRemote, `--delete`, `refs/tags/${action.name}`]);
      return;
    case 'pushTag':
      await gitOk(git, cwd, ['push', action.remote, action.name]);
      return;
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
      const args = ['push'];
      if (action.setUpstream) args.push('-u');
      if (action.force) args.push('--force-with-lease');
      args.push(action.remote, action.name);
      await gitOk(git, cwd, args);
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
