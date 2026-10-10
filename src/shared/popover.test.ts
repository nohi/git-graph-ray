import { describe, expect, it } from 'vitest';
import { anchoredPopoverPlacement, cursorDialogPlacement } from './popover';

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

describe('cursorDialogPlacement', () => {
  const viewport = { width: 800, height: 600 };

  it('opens just below and to the right of the pointer', () => {
    expect(cursorDialogPlacement({ x: 100, y: 80 }, { width: 180, height: 120 }, viewport)).toEqual({
      left: 108,
      top: 88,
    });
  });

  it('flips to the left of the pointer when the right edge would leave the viewport', () => {
    expect(cursorDialogPlacement({ x: 700, y: 40 }, { width: 200, height: 80 }, viewport)).toEqual({
      left: 492,
      top: 48,
    });
  });

  it('flips above the pointer when the bottom edge would leave the viewport', () => {
    expect(cursorDialogPlacement({ x: 20, y: 500 }, { width: 160, height: 180 }, viewport)).toEqual({
      left: 28,
      top: 312,
    });
  });

  it('keeps the dialog beside a pointer in the bottom-right corner', () => {
    expect(cursorDialogPlacement({ x: 790, y: 580 }, { width: 220, height: 140 }, viewport)).toEqual({
      left: 562,
      top: 432,
    });
  });

  it('pins to the margin when the dialog is larger than the viewport', () => {
    expect(cursorDialogPlacement({ x: 400, y: 300 }, { width: 900, height: 800 }, viewport)).toEqual({
      left: 8,
      top: 8,
    });
  });
});
