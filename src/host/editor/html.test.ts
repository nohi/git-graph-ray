import { describe, expect, it } from 'vitest';
import { graphHtml } from './html';

describe('graphHtml', () => {
  it('embeds toolbar and table chrome the webview script binds to', () => {
    const html = graphHtml('https://csp.example', 'webview.js', 'style.css', 'n0nce');
    for (const id of ['repo', 's-theme', 's-raycat', 's-raycat-count', 'scroll', 'rows', 'fail', 'fail-msg', 'fail-close', 'head', 'svg', 'g-clip', 'ray-cats', 'inline-details', 'btn-settings', 'btn-date', 'date-jump-go', 'date-kind-author', 'date-kind-committer', 'show-remotes', 'ref-ok', 'btn-repo-help', 'find-case', 'find-regex', 'find-diff', 'find-prev', 'find-next', 'help-settings', 'help-keys', 's-prune', 's-prune-tags', 'pop-confirm', 'confirm-ok', 'confirm-cancel']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('Filter');
    expect(html).not.toContain('>Refs</button>');
    expect(html).toContain('Go back to Date');
    expect(html).toContain('class="col-resizer"');
    expect(html).not.toContain('type="module"');
    expect(html).toContain('<script nonce="n0nce" src="webview.js"></script>');
    expect(html).toContain("script-src https://csp.example 'nonce-n0nce'");
    expect(html).toContain('style="margin:0;padding:0;width:100%"');
    expect(html).toContain('id="btn-settings"');
    expect(html).toContain('popover="manual"');
    expect(html).not.toContain('commandfor="pop-settings"');
    expect(html).not.toContain('commandfor="pop-date"');
    expect(html).toContain('id="pop-date" popover="manual"');
    expect(html).toContain('class="settings-h"');
    expect(html).toContain('class="settings-stack"');
    expect(html).toContain('Show Ray Cat');
    expect(html).toContain('class="settings-warn"');
    expect(html).toContain('Ray themes and Ray Cat use more CPU and battery.');
    expect(html).toContain('id="fail-close"');
    expect(html).toContain('Open Settings');
    expect(html).toContain('class="help-list"');
    expect(html).toContain('id="find-count">0/-');
    expect(html).not.toContain('id="dlg-fetch"');
    expect(html).toContain('class="settings-row issue-row"');
    expect(html).toContain('class="settings-save"');
    expect(html.match(/id="s-theme"/g)?.length).toBe(1);
    expect(html).toContain('class="btn-cancel"');
    expect(html).not.toContain('id="app"');
  });
});
