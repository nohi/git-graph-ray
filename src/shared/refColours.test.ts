import { describe, expect, it } from 'vitest';
import {
  hexToHsv,
  hsvToHex,
  isUnregisteredConfigurationMessage,
  labelColourDialogHtml,
  labelColourSettingValue,
  parseRefColours,
  refColoursToSetting,
  refLabelColour,
  removeRefColour,
  upsertRefColour,
} from './refColours';

const rules = parseRefColours({
  'origin/hotfix*': '#ff0000',
  'release*': '#FF8888',
  'v?.?.?': '#88CCFF',
  'release\\*': '#112233',
});

describe('parseRefColours', () => {
  it('keeps hex colours in object order and drops anything else', () => {
    expect(
      parseRefColours({
        ' release* ': ' #FF8888 ',
        main: '#abc',
        bad: 'red',
        '  ': '#fff',
        skip: 1,
      }),
    ).toEqual([
      { pattern: 'release*', colour: '#FF8888' },
      { pattern: 'main', colour: '#abc' },
    ]);
    expect(parseRefColours(null)).toEqual([]);
    expect(parseRefColours(['#fff'])).toEqual([]);
  });
});

describe('refLabelColour', () => {
  it('treats * as any text, including slashes', () => {
    expect(refLabelColour({ kind: 'head', name: 'release/1.0' }, rules)).toBe('#FF8888');
    expect(refLabelColour({ kind: 'head', name: 'release' }, rules)).toBe('#FF8888');
    expect(refLabelColour({ kind: 'tag', name: 'release-2024' }, rules)).toBe('#FF8888');
    expect(refLabelColour({ kind: 'head', name: 'main' }, rules)).toBeUndefined();
  });

  it('matches one character with ?', () => {
    expect(refLabelColour({ kind: 'tag', name: 'v1.2.3' }, rules)).toBe('#88CCFF');
    expect(refLabelColour({ kind: 'tag', name: 'v10.2.3' }, rules)).toBeUndefined();
  });

  it('uses the first matching pattern', () => {
    expect(refLabelColour({ kind: 'remote', name: 'origin/hotfix/1', remote: 'origin' }, rules)).toBe('#ff0000');
    expect(refLabelColour({ kind: 'head', name: 'hotfix/1' }, rules)).toBeUndefined();
  });

  it('colours a remote label from the branch name', () => {
    expect(refLabelColour({ kind: 'remote', name: 'origin/release/1.0', remote: 'origin' }, rules)).toBe('#FF8888');
    expect(refLabelColour({ kind: 'remote', name: 'remotes/origin/release/1.0' }, rules)).toBe('#FF8888');
  });

  it('keeps an escaped star literal', () => {
    const literal = parseRefColours({ 'release\\*': '#112233', 'release*': '#FF8888' });
    expect(refLabelColour({ kind: 'tag', name: 'release*' }, literal)).toBe('#112233');
    expect(refLabelColour({ kind: 'tag', name: 'release/1' }, literal)).toBe('#FF8888');
  });

  it('leaves stashes, worktrees, and filter globs alone', () => {
    expect(refLabelColour({ kind: 'stash', name: 'release' }, rules)).toBeUndefined();
    expect(refLabelColour({ kind: 'worktree', name: 'release' }, rules)).toBeUndefined();
    expect(refLabelColour({ kind: 'head', name: 'glob:release' }, rules)).toBeUndefined();
  });
});

describe('label colour editing', () => {
  const base = [
    { pattern: 'release*', colour: '#FF8888' },
    { pattern: 'v*', colour: '#88CCFF' },
  ];

  it('inserts a new pattern first and updates an existing one in place', () => {
    expect(upsertRefColour(base, ' feature/hoge ', '#00ff00')).toEqual([
      { pattern: 'feature/hoge', colour: '#00ff00' },
      ...base,
    ]);
    expect(upsertRefColour(base, 'release*', '#abcdef')).toEqual([
      { pattern: 'release*', colour: '#abcdef' },
      { pattern: 'v*', colour: '#88CCFF' },
    ]);
    expect(upsertRefColour(base, '  ', '#fff')).toBeUndefined();
    expect(upsertRefColour(base, 'feature/*', 'red')).toBeUndefined();
  });

  it('removes one pattern and keeps setting order', () => {
    expect(removeRefColour(base, 'release*')).toEqual([{ pattern: 'v*', colour: '#88CCFF' }]);
    expect(refColoursToSetting(base)).toEqual({ 'release*': '#FF8888', 'v*': '#88CCFF' });
  });

  it('round-trips primary colours through the picker', () => {
    for (const hex of ['#FF0000', '#00FF00', '#0000FF', '#FFFFFF', '#000000']) {
      expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
    }
    expect(hexToHsv('#F88')?.s).toBeCloseTo(hexToHsv('#FF8888')!.s);
  });

  it('prefers a saved setting over colours kept while the key was unregistered', () => {
    const stored = { 'release*': '#FF8888' };
    expect(labelColourSettingValue({ globalValue: { main: '#abc' }, defaultValue: {} }, stored)).toEqual({ main: '#abc' });
    expect(labelColourSettingValue({ workspaceFolderValue: { 'v*': '#fff' }, globalValue: { main: '#abc' } }, stored)).toEqual({
      'v*': '#fff',
    });
    expect(labelColourSettingValue({ defaultValue: {} }, stored)).toEqual(stored);
    expect(labelColourSettingValue({ defaultValue: {} }, undefined)).toEqual({});
    expect(labelColourSettingValue(undefined, stored)).toEqual(stored);
    expect(
      isUnregisteredConfigurationMessage(
        'Unable to write to User Settings because git-graph-ray.referenceLabels.colours is not a registered configuration.',
      ),
    ).toBe(true);
    expect(isUnregisteredConfigurationMessage('Unable to write to User Settings because the file is dirty.')).toBe(false);
  });

  it('fills the dialog with the clicked name and a hex field', () => {
    const html = labelColourDialogHtml({ pattern: 'feature/ho"ge', colour: '#FF8888' });
    expect(html).toContain('value="feature/ho&quot;ge"');
    expect(html).toContain('value="#FF8888"');
    expect(html).toContain('id="lc-help"');
    expect(html).toContain('id="lc-tip"');
    expect(html).toContain('feature/hoge to feature/*');
    expect(html).not.toContain('dlg-note');
    expect(html).toContain('id="lc-sv"');
    expect(html).toContain('id="lc-hex"');
    expect(html).toContain('id="lc-hue"');
  });
});
