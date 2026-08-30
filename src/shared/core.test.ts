import { describe, expect, it } from 'vitest';
import { cherryPickArgs, mergeArgs, rebaseArgs } from './gitArgs';
import { parseGitVersion } from './graph';
import { parseWorktreePorcelain } from './worktreePorcelain';
import { startCheckoutFromRef } from './checkout';
import { applyIssueLinks, formatCommitMessageHtml, highlightInlineCode, renderMarkdownLite } from './issueLinks';
import { parseLog, withUncommitted, workingTreeDirty } from '../host/git/log';
import { UNCOMMITTED } from './types';

describe('workingTreeDirty', () => {
  it('is clean when porcelain is empty', () => {
    expect(workingTreeDirty('', true)).toBe(false);
    expect(workingTreeDirty('\n', true)).toBe(false);
  });
  it('ignores git warnings that are not porcelain lines', () => {
    expect(workingTreeDirty('warning: could not open directory\n', true)).toBe(false);
  });
  it('treats modified files as dirty', () => {
    expect(workingTreeDirty(' M src/a.ts\n', true)).toBe(true);
  });
  it('ignores untracked when asked', () => {
    expect(workingTreeDirty('?? scratch.txt\n', false)).toBe(false);
    expect(workingTreeDirty('?? scratch.txt\n', true)).toBe(true);
  });
});

describe('withUncommitted', () => {
  it('does not prepend a row when the working tree is clean', () => {
    const commits = [
      {
        hash: 'abc',
        parents: [],
        authorName: '',
        authorEmail: '',
        authorDate: 0,
        committerName: '',
        committerEmail: '',
        committerDate: 0,
        subject: 'x',
        refs: [],
      },
    ];
    expect(withUncommitted(commits, 'abc', false)).toEqual(commits);
  });
  it('prepends Uncommitted changes when dirty', () => {
    const commits = [
      {
        hash: 'abc',
        parents: [],
        authorName: '',
        authorEmail: '',
        authorDate: 0,
        committerName: '',
        committerEmail: '',
        committerDate: 0,
        subject: 'x',
        refs: [],
      },
    ];
    expect(withUncommitted(commits, 'abc', true)[0]?.hash).toBe(UNCOMMITTED);
  });
});

describe('gitArgs', () => {
  it('adds merge flags', () => {
    expect(mergeArgs({ kind: 'merge', ref: 'dev', noCommit: true, noFastForward: true, squash: false, squashMessageFormat: 'Default' })).toContain('--no-ff');
  });
  it('adds rebase ignore-date', () => {
    expect(rebaseArgs({ kind: 'rebase', ref: 'main', ignoreDate: true, interactive: false })).toContain('--committer-date-is-author-date');
  });
  it('adds cherry-pick -x', () => {
    expect(cherryPickArgs({ kind: 'cherryPick', hash: 'abc', noCommit: false, recordOrigin: true })).toContain('-x');
  });
});

describe('parseGitVersion', () => {
  it('reads major.minor', () => {
    expect(parseGitVersion('git version 2.54.1')).toEqual([2, 54]);
  });
});

describe('worktree porcelain', () => {
  it('parses a worktree', () => {
    const rows = parseWorktreePorcelain('worktree /tmp/a\nHEAD abc\nbranch refs/heads/main\n\n');
    expect(rows[0]).toMatchObject({ path: '/tmp/a', branch: 'main' });
  });
});

describe('checkout', () => {
  it('noops current branch', () => {
    expect(startCheckoutFromRef([], { kind: 'head', name: 'main' }, 'main')).toEqual({ kind: 'noop' });
  });
  it('confirms creating a local branch from a remote', () => {
    expect(startCheckoutFromRef([], { kind: 'remote', name: 'origin/feat', hash: 'abc' }, 'main')).toEqual({
      kind: 'promptCreate',
      remoteBranch: 'origin/feat',
      localName: 'feat',
    });
  });
  it('checks out a same-commit local branch without pull', () => {
    const commits = [
      {
        hash: 'abc',
        parents: [],
        authorName: '',
        authorEmail: '',
        authorDate: 0,
        committerName: '',
        committerEmail: '',
        committerDate: 0,
        subject: '',
        refs: [
          { kind: 'head' as const, name: 'feat', hash: 'abc' },
          { kind: 'remote' as const, name: 'origin/feat', hash: 'abc' },
        ],
      },
    ];
    expect(startCheckoutFromRef(commits, { kind: 'remote', name: 'origin/feat', hash: 'abc' }, 'main')).toEqual({
      kind: 'local',
      name: 'feat',
    });
  });
  it('asks to pull when the local branch is on another commit', () => {
    const commits = [
      {
        hash: 'old',
        parents: [],
        authorName: '',
        authorEmail: '',
        authorDate: 0,
        committerName: '',
        committerEmail: '',
        committerDate: 0,
        subject: '',
        refs: [{ kind: 'head' as const, name: 'feat', hash: 'old' }],
      },
    ];
    expect(startCheckoutFromRef(commits, { kind: 'remote', name: 'origin/feat', hash: 'new' }, 'main')).toEqual({
      kind: 'confirmPull',
      name: 'feat',
      remote: 'origin',
      branch: 'feat',
    });
  });
});

describe('issue links', () => {
  it('wraps matches', () => {
    const html = applyIssueLinks('Fixes #12', '#(\\d+)', 'https://ex/$1');
    expect(html).toContain('href="https://ex/12"');
  });
});

describe('highlightInlineCode', () => {
  it('wraps backtick spans', () => {
    expect(highlightInlineCode('use `foo` now')).toBe('use <code>foo</code> now');
    expect(highlightInlineCode('plain')).toBe('plain');
  });
});

describe('renderMarkdownLite', () => {
  it('treats fenced blocks as pre, not inline code', () => {
    const html = renderMarkdownLite('intro\n```\nconst x = 1\n```\nend', true);
    expect(html).toContain('<pre class="md-fence"><code>const x = 1</code></pre>');
    expect(html).toContain('intro');
    expect(html).toContain('end');
    expect(html).not.toContain('``');
  });
  it('still highlights inline code', () => {
    expect(renderMarkdownLite('use `foo`', true)).toContain('<code>foo</code>');
  });
  it('keeps a single blank line on each side of a fence', () => {
    const html = renderMarkdownLite('start\n\n```\nhogehoge\nthis is codeblock\n```\n\nend', true);
    const parts = html.split(/<pre class="md-fence">[\s\S]*?<\/pre>/);
    expect(parts[0]).toBe('start\n\n');
    expect(parts[1]).toBe('\n\nend');
  });
});

describe('formatCommitMessageHtml', () => {
  it('keeps fences when issue linking is on', () => {
    const html = formatCommitMessageHtml('Fixes #12\n```\ncode\n```', true, { regex: '#(\\d+)', url: 'https://ex/$1' });
    expect(html).toContain('<pre class="md-fence">');
    expect(html).toContain('href="https://ex/12"');
  });
});

describe('parseLog', () => {
  it('splits records', () => {
    const rs = '\u001e';
    const us = '\u001f';
    const rows = parseLog(`${rs}abc${us}def${us}n${us}e${us}1${us}cn${us}ce${us}2${us}hello`);
    expect(rows[0]?.hash).toBe('abc');
    expect(rows[0]?.subject).toBe('hello');
  });
});
