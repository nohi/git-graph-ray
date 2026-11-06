import { describe, expect, it } from 'vitest';
import { bindScmCommits, sameRepoPath, type ScmCommitApi, type ScmCommitRepo, type ScmDisposable } from './scmRefresh';

describe('sameRepoPath', () => {
  it('matches a Windows root across slashes and case', () => {
    expect(sameRepoPath('I:/ws/git-graph-ray', 'I:\\ws\\git-graph-ray')).toBe(true);
    expect(sameRepoPath('I:/ws/git-graph-ray', 'i:/ws/git-graph-ray')).toBe(true);
    expect(sameRepoPath('I:/ws/git-graph-ray', 'I:/ws/other')).toBe(false);
    expect(sameRepoPath('', 'I:/ws/git-graph-ray')).toBe(false);
  });
});

function bus() {
  type Listener = () => void;
  const commit = new Set<Listener>();
  return {
    fire() {
      for (const listener of [...commit]) listener();
    },
    onDidCommit(listener: Listener): ScmDisposable {
      commit.add(listener);
      return { dispose: () => commit.delete(listener) };
    },
    size: () => commit.size,
  };
}

type FakeRepo = ScmCommitRepo & { fire(): void; listeners(): number };

function repo(root: string): FakeRepo {
  const commits = bus();
  return {
    root,
    fire: () => commits.fire(),
    listeners: () => commits.size(),
    onDidCommit: (listener) => commits.onDidCommit(listener),
  };
}

function api(state: ScmCommitApi['state'], repositories: FakeRepo[]): ScmCommitApi & {
  setState(next: ScmCommitApi['state']): void;
  open(next: FakeRepo): void;
  close(next: FakeRepo): void;
} {
  const stateListeners = new Set<() => void>();
  const openListeners = new Set<(repo: ScmCommitRepo) => void>();
  const closeListeners = new Set<(repo: ScmCommitRepo) => void>();
  const live = [...repositories];
  return {
    state,
    repositories: live,
    setState(next) {
      this.state = next;
      for (const listener of [...stateListeners]) listener();
    },
    open(next) {
      live.push(next);
      for (const listener of [...openListeners]) listener(next);
    },
    close(next) {
      const index = live.indexOf(next);
      if (index >= 0) live.splice(index, 1);
      for (const listener of [...closeListeners]) listener(next);
    },
    onDidChangeState(listener) {
      stateListeners.add(listener);
      return { dispose: () => stateListeners.delete(listener) };
    },
    onDidOpenRepository(listener) {
      openListeners.add(listener);
      return { dispose: () => openListeners.delete(listener) };
    },
    onDidCloseRepository(listener) {
      closeListeners.add(listener);
      return { dispose: () => closeListeners.delete(listener) };
    },
  };
}

describe('bindScmCommits', () => {
  it('reports a commit once the Git API is initialized', () => {
    const main = repo('I:/ws/git-graph-ray');
    const git = api('uninitialized', [main]);
    const roots: string[] = [];
    const sub = bindScmCommits(git, (root) => roots.push(root));
    main.fire();
    expect(roots).toEqual([]);
    git.setState('initialized');
    main.fire();
    expect(roots).toEqual(['I:/ws/git-graph-ray']);
    sub.dispose();
    main.fire();
    expect(roots).toEqual(['I:/ws/git-graph-ray']);
    expect(main.listeners()).toBe(0);
  });

  it('follows repositories that open and close', () => {
    const git = api('initialized', []);
    const roots: string[] = [];
    bindScmCommits(git, (root) => roots.push(root));
    const main = repo('I:/ws/git-graph-ray');
    git.open(main);
    git.open(main);
    main.fire();
    expect(roots).toEqual(['I:/ws/git-graph-ray']);
    expect(main.listeners()).toBe(1);
    git.close(main);
    main.fire();
    expect(roots).toEqual(['I:/ws/git-graph-ray']);
    expect(main.listeners()).toBe(0);
  });
});
