import * as path from 'node:path';

/** Identity for a repository root. Windows and UNC paths compare case-insensitively. */
export function repoPathKey(p: string): string {
  if (!p.trim()) return '';
  // A drive or UNC path is resolved as Windows on every platform, so the result does not depend on the host OS.
  const windows = /^[a-zA-Z]:([\\/]|$)/.test(p) || /^[\\/]{2}[^\\/]/.test(p);
  const n = (windows ? path.win32.resolve(p) : path.resolve(p)).replaceAll('\\', '/');
  if (/^[a-zA-Z]:/.test(n) || n.startsWith('//')) return n.toLowerCase();
  return n;
}

export function sameRepoPath(a: string, b: string): boolean {
  const left = repoPathKey(a);
  const right = repoPathKey(b);
  return left !== '' && left === right;
}

export type ScmDisposable = { dispose(): void };

export type ScmCommitRepo = {
  root: string;
  onDidCommit(listener: () => void): ScmDisposable;
};

export type ScmCommitApi = {
  state: 'uninitialized' | 'initialized';
  onDidChangeState(listener: () => void): ScmDisposable;
  repositories: readonly ScmCommitRepo[];
  onDidOpenRepository(listener: (repo: ScmCommitRepo) => void): ScmDisposable;
  onDidCloseRepository(listener: (repo: ScmCommitRepo) => void): ScmDisposable;
};

/** Listen for Source Control commits on an already-open Git API. */
export function bindScmCommits(api: ScmCommitApi, onCommit: (root: string) => void): ScmDisposable {
  const hooked = new Map<string, ScmDisposable>();
  const hook = (repo: ScmCommitRepo) => {
    const key = repoPathKey(repo.root);
    if (!key || hooked.has(key)) return;
    hooked.set(
      key,
      repo.onDidCommit(() => onCommit(repo.root)),
    );
  };
  const unhook = (repo: ScmCommitRepo) => {
    const key = repoPathKey(repo.root);
    hooked.get(key)?.dispose();
    hooked.delete(key);
  };
  const attachOpen = () => {
    if (api.state !== 'initialized') return;
    for (const repo of api.repositories) hook(repo);
  };
  attachOpen();
  const stateSub = api.onDidChangeState(attachOpen);
  const openSub = api.onDidOpenRepository(hook);
  const closeSub = api.onDidCloseRepository(unhook);
  return {
    dispose() {
      stateSub.dispose();
      openSub.dispose();
      closeSub.dispose();
      for (const sub of hooked.values()) sub.dispose();
      hooked.clear();
    },
  };
}
