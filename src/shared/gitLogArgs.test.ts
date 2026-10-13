import { describe, expect, it } from 'vitest';
import { escapeRegExp, logRevisionArgs, messageGrepArgs, pickaxeArgs } from './gitLogArgs';

describe('logRevisionArgs', () => {
  it('uses --all when showing remotes', () => {
    expect(
      logRevisionArgs({
        branches: 'all',
        showRemote: true,
        showStashes: false,
        showTags: true,
        includeTagOnly: true,
        reflog: false,
        includeHead: true,
      }),
    ).toEqual(['--all']);
  });

  it('adds HEAD when detached and listing local branches', () => {
    expect(
      logRevisionArgs({
        branches: 'all',
        showRemote: false,
        showStashes: false,
        showTags: false,
        includeTagOnly: false,
        reflog: false,
        includeHead: true,
      }),
    ).toEqual(['--branches', 'HEAD']);
  });

  it('adds HEAD to an explicit selection when detached', () => {
    expect(
      logRevisionArgs({
        branches: ['main'],
        showRemote: true,
        showStashes: false,
        showTags: true,
        includeTagOnly: true,
        reflog: false,
        includeHead: true,
      }),
    ).toEqual(['main', 'HEAD']);
  });

  it('appends a followed path after the revisions', () => {
    expect(
      logRevisionArgs({
        branches: ['main'],
        showRemote: false,
        showStashes: false,
        showTags: false,
        includeTagOnly: false,
        reflog: false,
        includeHead: false,
        path: 'src/app.ts',
        follow: true,
      }),
    ).toEqual(['main', '--follow', '--', 'src/app.ts']);
  });

  it('puts the commit order before the revisions', () => {
    expect(
      logRevisionArgs({
        branches: ['main'],
        showRemote: false,
        showStashes: false,
        showTags: false,
        includeTagOnly: false,
        reflog: false,
        includeHead: false,
        order: 'topo',
      }),
    ).toEqual(['--topo-order', 'main']);
  });
});

describe('messageGrepArgs', () => {
  it('uses a fixed string unless the query is a regex', () => {
    expect(messageGrepArgs('a.b', true, false)).toEqual(['--fixed-strings', '-i', '--grep=a.b']);
    expect(messageGrepArgs('a.b', false, true)).toEqual(['--extended-regexp', '--grep=a.b']);
  });
});

describe('pickaxeArgs', () => {
  it('uses -G and optional -i', () => {
    expect(pickaxeArgs('foo.bar', true, true)).toEqual(['-i', '-Gfoo.bar']);
    expect(pickaxeArgs('foo.bar', false, false)).toEqual(['-Gfoo\\.bar']);
  });
});

describe('escapeRegExp', () => {
  it('escapes metacharacters', () => {
    expect(escapeRegExp('a+b')).toBe('a\\+b');
  });
});
