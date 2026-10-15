import { describe, expect, it } from 'vitest';
import { addTagDialogHtml, parsePushMode, preferredPushRemote, pushBranchDialogHtml, pushTagDialogHtml, tagOnRemoteIcon, tagRemoteLoadingIcon } from './pushDialog';

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

describe('pushTagDialogHtml', () => {
  it('uses a select when there is a single remote', () => {
    const html = pushTagDialogHtml(['origin']);
    expect(html).toContain('<select id="rm">');
    expect(html).toContain('value="origin"');
    expect(html).not.toContain('type="checkbox" name="rm"');
  });

  it('uses checkboxes when there are multiple remotes and checks origin', () => {
    const html = pushTagDialogHtml(['upstream', 'origin']);
    expect(html).toContain('type="checkbox" name="rm" value="origin" checked');
    expect(html).toContain('type="checkbox" name="rm" value="upstream"');
    expect(html).not.toContain('value="upstream" checked');
    expect(html).not.toContain('<select id="rm">');
  });

  it('shows an empty select when there are no remotes', () => {
    expect(pushTagDialogHtml([])).toContain('No remotes');
  });

  it('reserves a mark beside each remote and a hidden lookup error', () => {
    expect(pushTagDialogHtml(['origin'])).toContain('id="tag-remote-err" class="dlg-warn" hidden');
    expect(pushTagDialogHtml(['origin'])).toContain('id="rm-mark"');
    const html = pushTagDialogHtml(['upstream', 'origin']);
    expect(html).toContain('data-tag-mark="origin"');
    expect(html).toContain('data-tag-mark="upstream"');
  });
});

describe('tagOnRemoteIcon', () => {
  it('uses a check when the remote tag matches and a warning when the commit differs', () => {
    expect(tagOnRemoteIcon('pushed')).toContain('dlg-ok-ic');
    expect(tagOnRemoteIcon('pushed')).toContain('Already on this remote');
    expect(tagOnRemoteIcon('mismatch')).toContain('dlg-warn-ic');
    expect(tagOnRemoteIcon('mismatch')).toContain('different commit');
    expect(tagOnRemoteIcon(null)).toBe('');
  });

  it('shows a spinner while remote tags are still loading', () => {
    expect(tagRemoteLoadingIcon()).toContain('dlg-tag-spin');
    expect(tagRemoteLoadingIcon()).toContain('Checking this remote');
  });
});

describe('addTagDialogHtml', () => {
  it('leaves every remote unchecked by default, including a single remote', () => {
    const html = addTagDialogHtml(['origin'], { annotated: true, pushToRemote: false });
    expect(html).toContain('id="tn"');
    expect(html).toContain('id="an" checked');
    expect(html).toContain('data-push-optional');
    expect(html).toContain('id="tag-remote-err" class="dlg-warn" hidden');
    expect(html).toContain('data-tag-mark="origin"');
    expect(html).toContain('type="checkbox" name="rm" value="origin"');
    expect(html).not.toContain('value="origin" checked');
    expect(html).not.toContain('<select id="rm">');
  });

  it('leaves multiple remotes unchecked unless the dialog default pre-selects origin', () => {
    const open = addTagDialogHtml(['upstream', 'origin'], { annotated: false, pushToRemote: false });
    expect(open).not.toContain('checked');
    const preset = addTagDialogHtml(['upstream', 'origin'], { annotated: false, pushToRemote: true });
    expect(preset).toContain('value="origin" checked');
    expect(preset).not.toContain('value="upstream" checked');
  });

  it('omits push destinations when the repository has no remotes', () => {
    expect(addTagDialogHtml([], { annotated: false, pushToRemote: true })).not.toContain('name="rm"');
  });
});

describe('pushBranchDialogHtml', () => {
  it('uses a select when there is a single remote', () => {
    const html = pushBranchDialogHtml(['origin']);
    expect(html).toContain('<select id="rm">');
    expect(html).toContain('value="origin"');
    expect(html).not.toContain('type="checkbox" name="rm"');
    expect(html).not.toContain('dlg-tag-mark');
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
