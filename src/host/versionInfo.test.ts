import { describe, expect, it } from 'vitest';
import { versionInformationDisplay, versionInformationText } from './versionInfo';

describe('versionInformationText', () => {
  it('puts each item on its own line for the clipboard', () => {
    expect(versionInformationText('0.8.0', 'git version 2.49.0.windows.1')).toBe(
      'Git Graph Ray v0.8.0\ngit version 2.49.0.windows.1',
    );
  });

  it('says when git could not be run', () => {
    expect(versionInformationText('0.8.0', '')).toBe('Git Graph Ray v0.8.0\nGit version unavailable');
    expect(versionInformationText('0.8.0', '  \n')).toBe('Git Graph Ray v0.8.0\nGit version unavailable');
  });
});

describe('versionInformationDisplay', () => {
  it('breaks between items without a wrap point inside either item', () => {
    const shown = versionInformationDisplay('0.8.0', 'git version 2.56.0.windows.4');
    expect(shown).toBe('Git\u00A0Graph\u00A0Ray\u00A0v0.8.0\u2028git\u00A0version\u00A02.56.0.windows.4');
    expect(shown).not.toContain('\n');
  });
});
