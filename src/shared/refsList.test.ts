import { describe, expect, it } from 'vitest';
import {
  branchLabelsForFilter,
  cmpRefname,
  filterRefsForTab,
  groupChipRefs,
  refDisplayName,
  refLogArg,
  remoteChipText,
  remoteBranchName,
  remoteLabelsUseIcons,
  remoteShortName,
  sortFilterRefs,
  uniqueRefs,
  windowRefs,
} from './refsList';
import type { GraphRef } from './types';

const r = (kind: GraphRef['kind'], name: string, extra: Partial<GraphRef> = {}): GraphRef => ({
  kind,
  name,
  hash: extra.hash ?? 'h',
  ...extra,
});

describe('uniqueRefs', () => {
  it('drops duplicate names of the same kind', () => {
    expect(uniqueRefs([r('head', 'main'), r('head', 'main'), r('tag', 'v1')]).map((x) => x.name)).toEqual([
      'main',
      'v1',
    ]);
  });
});

describe('refDisplayName', () => {
  it('prefixes remotes', () => {
    expect(refDisplayName(r('remote', 'origin/main'))).toBe('remotes/origin/main');
    expect(refDisplayName(r('head', 'main'))).toBe('main');
  });
});

describe('remoteChipText', () => {
  it('replaces remotes/ with a slash the cloud sits in front of', () => {
    expect(remoteChipText('origin/main', 'Icon')).toBe('/origin/main');
    expect(remoteChipText('remotes/origin/main', 'Icon')).toBe('/origin/main');
  });

  it('keeps the remotes/ word when the prefix is text', () => {
    expect(remoteChipText('origin/main', 'Text')).toBe('remotes/origin/main');
    expect(remoteChipText('remotes/origin/main', 'Text')).toBe('remotes/origin/main');
  });
});

describe('refLogArg', () => {
  it('uses the hash for worktrees', () => {
    expect(refLogArg(r('worktree', 'wt', { hash: 'abc' }))).toBe('abc');
  });
});

describe('sortFilterRefs', () => {
  it('keeps version order regardless of selection', () => {
    const refs = [r('head', 'v2'), r('head', 'v10'), r('head', 'v1')];
    expect(sortFilterRefs(refs, 'branch', 'version:refname', '-version:refname').map((x) => x.name)).toEqual([
      'v1',
      'v2',
      'v10',
    ]);
    expect(sortFilterRefs(refs, 'tag', 'version:refname', '-version:refname').map((x) => x.name)).toEqual([
      'v10',
      'v2',
      'v1',
    ]);
  });
});

describe('filterRefsForTab', () => {
  it('splits kinds and optional remotes', () => {
    const refs = [r('head', 'main'), r('remote', 'origin/main'), r('tag', 'v1'), r('worktree', 'wt')];
    expect(filterRefsForTab(refs, 'branch', { remotes: false, query: '' }).map((x) => x.name)).toEqual(['main']);
    expect(filterRefsForTab(refs, 'branch', { remotes: true, query: '' }).map((x) => x.kind)).toEqual(['head', 'remote']);
    expect(filterRefsForTab(refs, 'tag', { remotes: true, query: '' }).map((x) => x.name)).toEqual(['v1']);
  });

  it('matches incremental search on the display name', () => {
    const refs = [r('remote', 'origin/topic')];
    expect(filterRefsForTab(refs, 'branch', { remotes: true, query: 'remotes/origin' }).map((x) => x.name)).toEqual([
      'origin/topic',
    ]);
  });
});

describe('branchLabelsForFilter', () => {
  const tip = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const older = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const refs = [
    r('head', 'main', { hash: tip }),
    r('head', 'release', { hash: tip }),
    r('remote', 'origin/main', { hash: tip }),
    r('head', 'old', { hash: older }),
    r('tag', 'v1', { hash: tip }),
    r('worktree', 'wt', { hash: tip }),
    r('head', 'HEAD', { hash: tip }),
  ];

  it('keeps every label when the option is on or every ref is loaded', () => {
    expect(branchLabelsForFilter(refs, ['main'], true).map((ref) => ref.name)).toEqual(refs.map((ref) => ref.name));
    expect(branchLabelsForFilter(refs, 'all', false).map((ref) => ref.name)).toEqual(refs.map((ref) => ref.name));
  });

  it('hides unselected branches that share a checked ref commit', () => {
    expect(branchLabelsForFilter(refs, ['main'], false).map((ref) => ref.name)).toEqual(['main', 'old', 'v1', 'wt', 'HEAD']);
  });

  it('hides branches sitting on a checked tag', () => {
    expect(branchLabelsForFilter(refs, ['v1'], false).map((ref) => ref.name)).toEqual(['old', 'v1', 'wt', 'HEAD']);
  });

  it('keeps a branch that was checked on that commit', () => {
    expect(branchLabelsForFilter(refs, ['main', 'origin/main'], false).map((ref) => ref.name)).toEqual([
      'main',
      'origin/main',
      'old',
      'v1',
      'wt',
      'HEAD',
    ]);
  });

  it('leaves labels alone when nothing checked matches a loaded ref', () => {
    expect(branchLabelsForFilter(refs, [], false)).toBe(refs);
    expect(branchLabelsForFilter(refs, ['heads/feature/*'], false)).toBe(refs);
  });
});

describe('windowRefs', () => {
  it('caps the list', () => {
    const refs = [r('head', 'a'), r('head', 'b'), r('head', 'c')];
    expect(windowRefs(refs, 2).map((x) => x.name)).toEqual(['a', 'b']);
  });
});

describe('cmpRefname', () => {
  it('treats digits as versions', () => {
    expect(cmpRefname('v1.9', 'v1.10', 'version:refname')).toBeLessThan(0);
  });
});

describe('groupChipRefs', () => {
  it('pairs a local branch with its upstream remote without dropping either', () => {
    const local = r('head', 'main');
    const remote = r('remote', 'origin/main', { remote: 'origin' });
    expect(groupChipRefs([local, remote], true)).toEqual([{ kind: 'bundle', local, remotes: [remote] }]);
    expect(remoteShortName(remote)).toBe('origin');
    expect(remoteBranchName(remote)).toBe('main');
  });

  it('sticks every remote of the same branch onto the local label', () => {
    const local = r('head', 'main');
    const origin = r('remote', 'origin/main', { remote: 'origin' });
    const hoge = r('remote', 'hoge/main', { remote: 'hoge' });
    const tag = r('tag', 'v1');
    expect(groupChipRefs([origin, local, tag, hoge], true)).toEqual([
      { kind: 'bundle', local, remotes: [hoge, origin] },
      { kind: 'single', ref: tag },
    ]);
  });

  it('keeps both labels separate when combining is off', () => {
    const local = r('head', 'main');
    const remote = r('remote', 'origin/main', { remote: 'origin' });
    expect(groupChipRefs([local, remote], false)).toEqual([
      { kind: 'single', ref: local },
      { kind: 'single', ref: remote },
    ]);
  });

  it('does not pair a nested remote path that only shares a suffix', () => {
    const local = r('head', 'main');
    const remote = r('remote', 'origin/feature/main', { remote: 'origin' });
    expect(groupChipRefs([local, remote], true)).toEqual([
      { kind: 'single', ref: local },
      { kind: 'single', ref: remote },
    ]);
    expect(remoteBranchName(remote)).toBe('feature/main');
  });

  it('leaves same-named remotes separate when the local branch is absent', () => {
    const origin = r('remote', 'origin/main', { remote: 'origin' });
    const hoge = r('remote', 'hoge/main', { remote: 'hoge' });
    expect(groupChipRefs([origin, hoge], true)).toEqual([
      { kind: 'single', ref: origin },
      { kind: 'single', ref: hoge },
    ]);
  });

  it('collapses three or more combined remotes to icons until expanded', () => {
    expect(remoteLabelsUseIcons(2, false)).toBe(false);
    expect(remoteLabelsUseIcons(3, false)).toBe(true);
    expect(remoteLabelsUseIcons(4, true)).toBe(false);
  });
});
