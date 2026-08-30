import { describe, expect, it } from 'vitest';
import {
  colourForLane,
  DETAILS_MIN,
  edgePath,
  estimateDetailsHeight,
  rayStreamGradient,
  scrollNeededToRevealDetails,
} from './graph';
import { RAY_COLOURS } from './types';

describe('edgePath', () => {
  it('draws a vertical line on the same lane', () => {
    expect(edgePath(10, 0, 10, 28, 'rounded')).toBe('M 10 0 L 10 28');
  });

  it('uses vertical tangents at both ends for a rounded lane change', () => {
    const d = edgePath(10, 0, 26, 28, 'rounded');
    expect(d).toBe('M 10 0 C 10 28 26 0 26 28');
  });

  it('keeps angular lane changes as a stepped path', () => {
    expect(edgePath(10, 0, 26, 28, 'angular')).toBe('M 10 0 L 10 14 L 26 14 L 26 28');
  });
});

describe('colourForLane', () => {
  it('uses the graph colours in classic', () => {
    expect(colourForLane(0, ['#111', '#222'], 'classic')).toBe('#111');
    expect(colourForLane(1, ['#111', '#222'], 'classic')).toBe('#222');
  });

  it('uses neon colours for Ray themes', () => {
    expect(colourForLane(0, ['#111'], 'Ray')).toBe(RAY_COLOURS[0]);
  });

  it('uses a paint server for Ray Stream', () => {
    expect(colourForLane(3, ['#111'], 'Ray Stream')).toBe('url(#ray-stream)');
  });
});

describe('rayStreamGradient', () => {
  it('emits a repeating vertical paint server', () => {
    const xml = rayStreamGradient(800, true);
    expect(xml).toContain('id="ray-stream"');
    expect(xml).toContain('spreadMethod="repeat"');
    expect(xml).toContain('animateTransform');
    expect(xml).toContain('y1="800"');
  });

  it('omits motion when reduced-motion is requested', () => {
    expect(rayStreamGradient(800, false)).not.toContain('animate');
  });
});

describe('scrollNeededToRevealDetails', () => {
  it('does not scroll when the panel already fits', () => {
    expect(
      scrollNeededToRevealDetails({
        rowIndex: 2,
        rowHeight: 28,
        detailsHeight: 180,
        scrollTop: 0,
        viewHeight: 600,
      }),
    ).toBeNull();
  });

  it('scrolls just enough to keep the panel on screen', () => {
    expect(
      scrollNeededToRevealDetails({
        rowIndex: 20,
        rowHeight: 28,
        detailsHeight: 180,
        scrollTop: 0,
        viewHeight: 400,
      }),
    ).toBe(372);
  });

  it('pins the row to the top when the panel is taller than the view', () => {
    expect(
      scrollNeededToRevealDetails({
        rowIndex: 10,
        rowHeight: 28,
        detailsHeight: 500,
        scrollTop: 0,
        viewHeight: 200,
      }),
    ).toBe(280);
  });
});

describe('estimateDetailsHeight', () => {
  it('caps at the configured maximum', () => {
    expect(
      estimateDetailsHeight({
        message: 'a\n'.repeat(80),
        fileCount: 50,
        metaRowCount: 8,
        maxHeight: 300,
      }),
    ).toBe(300);
  });

  it('stays at least the minimum', () => {
    expect(
      estimateDetailsHeight({
        message: 'x',
        fileCount: 0,
        metaRowCount: 1,
        maxHeight: 300,
      }),
    ).toBeGreaterThanOrEqual(DETAILS_MIN);
  });
});

describe('edgePath', () => {
  it('draws a vertical line on the same lane', () => {
    expect(edgePath(10, 0, 10, 28, 'rounded')).toBe('M 10 0 L 10 28');
  });

  it('uses vertical tangents at both ends for a rounded lane change', () => {
    const d = edgePath(10, 0, 26, 28, 'rounded');
    expect(d).toBe('M 10 0 C 10 28 26 0 26 28');
  });

  it('keeps angular lane changes as a stepped path', () => {
    expect(edgePath(10, 0, 26, 28, 'angular')).toBe('M 10 0 L 10 14 L 26 14 L 26 28');
  });
});
