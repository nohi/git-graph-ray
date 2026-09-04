import { describe, expect, it } from 'vitest';
import { parsePushMode, preferredPushRemote, pushBranchDialogHtml } from './pushDialog';

describe('preferredPushRemote', () => {
  it('prefers origin when present', () => {
    expect(preferredPushRemote(['upstream', 'origin'])).toBe('origin');
  });

  it('falls back to the first remote', () => {
    expect(preferredPushRemote(['fork'])).toBe('fork');
  });
});

describe('parsePushMode', () => {
  it('accepts force modes and defaults to normal', () => {
    expect(parsePushMode('force')).toBe('force');
    expect(parsePushMode('force-with-lease')).toBe('force-with-lease');
    expect(parsePushMode('normal')).toBe('normal');
    expect(parsePushMode(undefined)).toBe('normal');
  });
});

describe('pushBranchDialogHtml', () => {
  it('uses a select when there is a single remote', () => {
    const html = pushBranchDialogHtml(['origin']);
    expect(html).toContain('<select id="rm">');
    expect(html).toContain('value="origin"');
    expect(html).not.toContain('type="checkbox" name="rm"');
  });

  it('uses checkboxes when there are multiple remotes and checks origin', () => {
    const html = pushBranchDialogHtml(['upstream', 'origin']);
    expect(html).toContain('type="checkbox" name="rm" value="origin" checked');
    expect(html).toContain('type="checkbox" name="rm" value="upstream"');
    expect(html).not.toContain('value="upstream" checked');
    expect(html).not.toContain('<select id="rm">');
  });

  it('shows an empty select when there are no remotes', () => {
    expect(pushBranchDialogHtml([])).toContain('No remotes');
  });

  it('includes set-upstream and stacked push methods with a warning on force', () => {
    const html = pushBranchDialogHtml(['origin']);
    expect(html).toContain('id="su" checked');
    expect(html).toContain('set-upstream');
    expect(html).toContain('value="normal" checked');
    expect(html).toContain('value="force-with-lease"');
    expect(html).toContain('value="force"');
    expect(html).toContain('class="dlg-warn-ic"');
    expect(html).toContain('title="Warning: overwrites remote history"');
    expect(html).toContain('class="dlg-stack"');
  });
});
