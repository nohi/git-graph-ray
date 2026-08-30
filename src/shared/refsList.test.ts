import { describe, expect, it } from 'vitest';
import {
  cmpRefname,
  filterRefsForTab,
  groupChipRefs,
  refDisplayName,
  refLogArg,
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
    expect(groupChipRefs([local, remote], true)).toEqual([{ kind: 'pair', local, remote }]);
    expect(remoteShortName(remote)).toBe('origin');
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
  });
});
