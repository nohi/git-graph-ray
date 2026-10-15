import { describe, expect, it } from 'vitest';
import { parseRemoteTagTips, remoteTagErrorText, tagOnRemote } from './remoteTags';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccccccccccccccccccc';

describe('parseRemoteTagTips', () => {
  it('uses the peeled commit for annotated tags and the tag hash for lightweight tags', () => {
    const stdout = [`${A}\trefs/tags/v1`, `${B}\trefs/tags/v1^{}`, `${C}\trefs/tags/light`, `${A}\trefs/heads/main`].join('\n');
    expect(parseRemoteTagTips('origin', stdout)).toEqual([
      { remote: 'origin', name: 'v1', commit: B },
      { remote: 'origin', name: 'light', commit: C },
    ]);
  });

  it('keeps tag names that contain slashes', () => {
    expect(parseRemoteTagTips('upstream', `${A}\trefs/tags/release/1.0\n`)).toEqual([
      { remote: 'upstream', name: 'release/1.0', commit: A },
    ]);
  });
});

describe('remoteTagErrorText', () => {
  it('keeps each remote failure and drops an empty message', () => {
    expect(
      remoteTagErrorText([
        { remote: 'origin', message: ' Authentication failed\n' },
        { remote: 'fork', message: '   ' },
      ]),
    ).toBe('origin: Authentication failed');
  });
});

describe('tagOnRemote', () => {
  it('marks the same commit as pushed and a different commit as a mismatch', () => {
    expect(tagOnRemote(A, A)).toBe('pushed');
    expect(tagOnRemote(A.toUpperCase(), A)).toBe('pushed');
    expect(tagOnRemote(A, B)).toBe('mismatch');
    expect(tagOnRemote(A, undefined)).toBeNull();
    expect(tagOnRemote('', A)).toBeNull();
  });
});
