import { describe, expect, it } from 'vitest';
import type { GraphSnapshot } from '../../shared/protocol';
import { defaultViewConfig } from '../../shared/graph';
import { defaultRepoSettings } from '../../shared/dialogs';
import { UNCOMMITTED, type GraphCommit } from '../../shared/types';
import { isNoisyGitWatchPath, snapshotFingerprint } from './gitWatch';

describe('isNoisyGitWatchPath', () => {
  it('ignores object packs, lock files, and git message files', () => {
    expect(isNoisyGitWatchPath('I:/repo/.git/objects/pack/foo.pack')).toBe(true);
    expect(isNoisyGitWatchPath('I:\\repo\\.git\\index.lock')).toBe(true);
    expect(isNoisyGitWatchPath('I:/repo/.git/HEAD.lock')).toBe(true);
    expect(isNoisyGitWatchPath('I:/repo/.git/COMMIT_EDITMSG')).toBe(true);
    expect(isNoisyGitWatchPath('I:/repo/.git/FETCH_HEAD')).toBe(true);
    expect(isNoisyGitWatchPath('I:/repo/.git/gc.pid')).toBe(true);
    expect(isNoisyGitWatchPath('I:/repo/.git/logs/HEAD')).toBe(true);
  });

  it('keeps refs, HEAD, and the index so real git mutations still refresh', () => {
    expect(isNoisyGitWatchPath('I:/repo/.git/HEAD')).toBe(false);
    expect(isNoisyGitWatchPath('I:/repo/.git/index')).toBe(false);
    expect(isNoisyGitWatchPath('I:/repo/.git/packed-refs')).toBe(false);
    expect(isNoisyGitWatchPath('I:/repo/.git/refs/heads/main')).toBe(false);
    expect(isNoisyGitWatchPath('I:/repo/src/app.ts')).toBe(false);
  });
});

function commit(hash: string, extra?: Partial<GraphCommit>): GraphCommit {
  return {
    hash,
    parents: [],
    authorName: '',
    authorEmail: '',
    authorDate: 1,
    committerName: '',
    committerEmail: '',
    committerDate: 1,
    subject: 'x',
    refs: [],
    ...extra,
  };
}

function snap(over: Partial<GraphSnapshot> = {}): GraphSnapshot {
  return {
    repos: [],
    repoPath: '/repo',
    head: 'aaa',
    currentBranch: 'main',
    branches: ['main'],
    remotes: [],
    repoSettings: defaultRepoSettings(),
    customPrProviders: [],
    globPatterns: [],
    filterRefs: [],
    selectedBranches: 'all',
    commits: [commit('aaa')],
    hasMore: false,
    config: defaultViewConfig(),
    loading: false,
    menuVisibility: {},
    emoji: [],
    ...over,
  };
}

describe('snapshotFingerprint', () => {
  it('stays stable when only uncommitted timestamps change', () => {
    const a = snap({
      commits: [commit(UNCOMMITTED, { parents: ['aaa'], authorDate: 10, committerDate: 10 }), commit('aaa')],
    });
    const b = snap({
      commits: [commit(UNCOMMITTED, { parents: ['aaa'], authorDate: 99, committerDate: 99 }), commit('aaa')],
    });
    expect(snapshotFingerprint(a)).toBe(snapshotFingerprint(b));
  });

  it('changes when HEAD or refs move', () => {
    const a = snap({ head: 'aaa', currentBranch: 'main' });
    const b = snap({ head: 'bbb', currentBranch: 'topic', commits: [commit('bbb')] });
    expect(snapshotFingerprint(a)).not.toBe(snapshotFingerprint(b));
  });
});
