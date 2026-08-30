import { describe, expect, it } from 'vitest';
import { anchoredPopoverPlacement } from './popover';

describe('anchoredPopoverPlacement', () => {
  it('pins the popover right edge to the button right edge', () => {
    expect(
      anchoredPopoverPlacement({ top: 8, left: 760, right: 780, bottom: 28 }, 200, { width: 800, height: 600 }),
    ).toEqual({ align: 'right', right: 20, top: 32, maxWidth: 776 });
  });

  it('keeps the right edge on-screen when the webview is narrow', () => {
    expect(
      anchoredPopoverPlacement({ top: 8, left: 220, right: 240, bottom: 28 }, 120, { width: 260, height: 400 }),
    ).toEqual({ align: 'right', right: 20, top: 32, maxWidth: 236 });
  });

  it('flips above the button when it would overflow the bottom', () => {
    const place = anchoredPopoverPlacement({ top: 500, left: 180, right: 200, bottom: 520 }, 200, { width: 220, height: 540 });
    expect(place.top).toBe(296);
  });

  it('pins the popover left edge to the button left edge', () => {
    expect(
      anchoredPopoverPlacement(
        { top: 8, left: 48, right: 68, bottom: 28 },
        80,
        { width: 800, height: 600 },
        { align: 'left' },
      ),
    ).toEqual({ align: 'left', left: 48, top: 32, maxWidth: 748 });
  });

  it('keeps the left edge on-screen when the button is flush with the viewport', () => {
    expect(
      anchoredPopoverPlacement(
        { top: 8, left: 0, right: 20, bottom: 28 },
        80,
        { width: 400, height: 600 },
        { align: 'left' },
      ),
    ).toEqual({ align: 'left', left: 4, top: 32, maxWidth: 392 });
  });

  it('caps width when a maxWidth is given', () => {
    expect(
      anchoredPopoverPlacement(
        { top: 8, left: 48, right: 68, bottom: 28 },
        80,
        { width: 1200, height: 600 },
        { align: 'left', maxWidth: 400 },
      ),
    ).toEqual({ align: 'left', left: 48, top: 32, maxWidth: 400 });
  });

  it('does not exceed remaining viewport space even with a maxWidth cap', () => {
    expect(
      anchoredPopoverPlacement(
        { top: 8, left: 48, right: 68, bottom: 28 },
        80,
        { width: 300, height: 600 },
        { align: 'left', maxWidth: 400 },
      ).maxWidth,
    ).toBe(248);
  });
});
