import { describe, expect, it } from 'vitest';
import { amendDialogHtml } from './amendDialog';

describe('amendDialogHtml', () => {
  it('prefills the subject and body with staged changes off by default', () => {
    const html = amendDialogHtml({ subject: 'Fix it', body: 'Details here', includeStaged: false });
    expect(html).toContain('id="am-subject"');
    expect(html).toContain('value="Fix it"');
    expect(html).toContain('id="am-body"');
    expect(html).toContain('>Details here</textarea>');
    expect(html).toContain('id="am-staged"');
    expect(html).not.toContain('id="am-staged" checked');
  });

  it('checks staged changes when requested and escapes the message', () => {
    const html = amendDialogHtml({ subject: 'A <b>', body: 'x & y', includeStaged: true });
    expect(html).toContain('id="am-staged" checked');
    expect(html).toContain('value="A &lt;b&gt;"');
    expect(html).toContain('>x &amp; y</textarea>');
    expect(html).not.toContain('<b>');
  });
});
