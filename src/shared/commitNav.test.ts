import { describe, expect, it } from 'vitest';
import { adjacentShownCommit, enterOnCommit, scrollToRevealRow } from './commitNav';

describe('adjacentShownCommit', () => {
  const shown = [0, 1, 4, 5, 9];

  it('moves to the next or previous shown commit', () => {
    expect(adjacentShownCommit(shown, 1, 1)).toBe(4);
    expect(adjacentShownCommit(shown, 4, -1)).toBe(1);
  });

  it('stops at either end', () => {
    expect(adjacentShownCommit(shown, 9, 1)).toBeUndefined();
    expect(adjacentShownCommit(shown, 0, -1)).toBeUndefined();
  });

  it('starts at the first shown commit when nothing is selected', () => {
    expect(adjacentShownCommit(shown, -1, 1)).toBe(0);
    expect(adjacentShownCommit(shown, -1, -1)).toBe(0);
  });

  it('leaves a commit hidden by a filter toward the nearest shown one', () => {
    expect(adjacentShownCommit(shown, 2, 1)).toBe(4);
    expect(adjacentShownCommit(shown, 2, -1)).toBe(1);
    expect(adjacentShownCommit(shown, 10, 1)).toBeUndefined();
  });

  it('does nothing when no commit is shown', () => {
    expect(adjacentShownCommit([], 3, 1)).toBeUndefined();
  });
});

describe('scrollToRevealRow', () => {
  const base = { rowHeight: 28, scrollTop: 280, viewHeight: 280 };

  it('keeps a visible row where it is', () => {
    expect(scrollToRevealRow({ ...base, top: 280 + 28 })).toBeNull();
  });

  it('scrolls up to a row above the view', () => {
    expect(scrollToRevealRow({ ...base, top: 252 })).toBe(248);
    expect(scrollToRevealRow({ ...base, top: 0, scrollTop: 2 })).toBe(0);
  });

  it('scrolls down until a row below the view is fully shown', () => {
    expect(scrollToRevealRow({ ...base, top: 560 })).toBe(560 + 28 - 280 + 4);
  });
});

describe('enterOnCommit', () => {
  it('opens or closes the selected commit', () => {
    expect(enterOnCommit('abc', false)).toBe('open');
    expect(enterOnCommit('abc', true)).toBe('close');
    expect(enterOnCommit(null, false)).toBe('none');
  });
});
