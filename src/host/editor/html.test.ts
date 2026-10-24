import { describe, expect, it } from 'vitest';
import { graphHtml } from './html';

describe('graphHtml', () => {
  it('embeds toolbar and table chrome the webview script binds to', () => {
    const html = graphHtml('https://csp.example', 'webview.js', 'style.css', 'n0nce');
    for (const id of ['repo', 's-theme', 's-raycat', 's-raycat-count', 'scroll', 'rows', 'fail', 'fail-msg', 'fail-close', 'conflict', 'conflict-msg', 'conflict-files', 'conflict-continue', 'conflict-abort', 'path-filter', 'path-filter-msg', 'path-filter-clear', 'git-busy-overlay', 'git-busy-hint', 'cols-clip', 'head', 'svg', 'g-clip', 'ray-cats', 'inline-details', 'btn-graph', 'pop-graph', 'lane-list', 'add-lane', 'btn-settings', 'btn-date', 'date-jump-go', 'date-kind-author', 'date-kind-committer', 'btn-dates', 'date-q', 'date-show-all', 'date-tab-author', 'date-tab-committer', 'date-list', 'date-ok', 'btn-contributor', 'pop-contributor', 'person-q', 'person-show-all', 'person-tab-author', 'person-tab-committer', 'person-list', 'person-activity', 'person-ok', 'show-remotes', 'show-same-commit', 'ref-ok', 'ref-jump-miss', 'btn-repo-help', 'find-case', 'find-regex', 'find-diff', 'find-prev', 'find-next', 'help-settings', 'help-keys', 's-prune', 's-prune-tags', 's-auto-fetch', 's-auto-fetch-interval', 'pop-confirm', 'confirm-ok', 'confirm-cancel']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('Branches/Tags');
    expect(html).toContain('>Undo</button>');
    expect(html).toContain('>Refresh</button>');
    expect(html).not.toContain('>Refs</button>');
    expect(html).toContain('Go back to Date');
    expect(html).toContain('class="col-resizer"');
    expect(html).toContain('class="h signature"');
    expect(html).toContain('data-col="Signature"');
    expect(html).not.toContain('type="module"');
    expect(html).toContain('<script nonce="n0nce" src="webview.js"></script>');
    expect(html).toContain("script-src https://csp.example 'nonce-n0nce'");
    expect(html).toContain('style="margin:0;padding:0;width:100%"');
    expect(html).toContain('id="btn-settings"');
    expect(html).toContain('title="Graph Settings"');
    expect(html).toContain('title="Repository Settings"');
    expect(html).toContain('Graph lane priority');
    expect(html).toContain('popover="manual"');
    expect(html).not.toContain('commandfor="pop-settings"');
    expect(html).not.toContain('commandfor="pop-graph"');
    expect(html).not.toContain('commandfor="pop-date"');
    expect(html).toContain('id="pop-date" popover="manual"');
    expect(html).toContain('class="settings-h"');
    expect(html).toContain('class="settings-stack"');
    expect(html).toContain('<div id="ray-cats" class="ray-cats" hidden></div>');
    expect(html).not.toContain('<canvas id="ray-cats"');
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
    expect(html).toContain('id="git-ok" value="ok" type="submit" class="btn-primary"');
    expect(html).toContain('id="ref-ok" class="btn-primary"');
    expect(html).toContain('class="pop-refs-body"');
    expect(html).toContain('class="pop-frame" data-edge="se"');
    expect(html).toContain('id="date-ok" class="btn-primary"');
    expect(html).toContain('id="issue-save" class="btn-primary"');
    expect(html).toContain('id="pr-save" class="btn-primary"');
    expect(html).not.toContain('btn-cancel');
    expect(html).not.toContain('id="app"');
  });
});
