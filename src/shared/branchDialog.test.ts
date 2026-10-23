import { describe, expect, it } from 'vitest';
import { mergeDialogHtml, rebaseDialogHtml } from './branchDialog';

describe('mergeDialogHtml', () => {
  it('shows the destination and the branch being merged', () => {
    const html = mergeDialogHtml({
      into: 'main',
      from: 'feature/login',
      noCommit: false,
      noFastForward: true,
      squash: false,
    });
    expect(html).toContain('<dt>into</dt>');
    expect(html).toContain('<code>main</code>');
    expect(html).toContain('<dt>from</dt>');
    expect(html).toContain('<code>feature/login</code>');
    expect(html).toContain('id="nff" checked');
    expect(html).not.toContain('id="nc" checked');
    expect(html).not.toContain('id="sq" checked');
  });

  it('escapes branch names and names a detached HEAD', () => {
    const html = mergeDialogHtml({
      into: null,
      from: 'a<b>&c',
      noCommit: true,
      noFastForward: false,
      squash: true,
    });
    expect(html).toContain('<code>detached HEAD</code>');
    expect(html).toContain('<code>a&lt;b&gt;&amp;c</code>');
    expect(html).toContain('id="nc" checked');
    expect(html).toContain('id="sq" checked');
  });
});

describe('rebaseDialogHtml', () => {
  it('shows the new base and the current branch', () => {
    const html = rebaseDialogHtml({ onto: 'feature/login', from: 'main', ignoreDate: false, interactive: true });
    expect(html).toContain('<dt>onto</dt>');
    expect(html).toContain('<code>feature/login</code>');
    expect(html).toContain('<dt>from</dt>');
    expect(html).toContain('<code>main</code>');
    expect(html).toContain('id="ir" checked');
    expect(html).not.toContain('id="id" checked');
  });

  it('hides interactive when rebasing onto a commit', () => {
    const html = rebaseDialogHtml({ onto: 'abc1234', from: null, ignoreDate: true });
    expect(html).toContain('<code>abc1234</code>');
    expect(html).toContain('<code>detached HEAD</code>');
    expect(html).toContain('id="id" checked');
    expect(html).not.toContain('id="ir"');
  });
});
