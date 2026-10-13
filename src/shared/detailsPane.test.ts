import { describe, expect, it } from 'vitest';
import {
  DETAILS_CENTER_AT,
  DETAILS_FILES_MIN,
  DETAILS_META_MIN,
  defaultDetailsMeta,
  draggedDetailsMeta,
  fittedDetailsMeta,
} from './detailsPane';

describe('fittedDetailsMeta', () => {
  it('uses the measured row width when it fits on screen', () => {
    expect(fittedDetailsMeta(520.2, 1600)).toBe(521);
  });

  it('does not exceed the screen width', () => {
    expect(fittedDetailsMeta(2400, 1400)).toBe(1400);
  });

  it('does not go below the left-pane minimum, even on a narrow screen', () => {
    expect(fittedDetailsMeta(120, 1600)).toBe(DETAILS_META_MIN);
    expect(fittedDetailsMeta(900, 300)).toBe(DETAILS_META_MIN);
  });
});

describe('draggedDetailsMeta', () => {
  it('keeps the left pane at 470px and the right pane at 300px', () => {
    expect(draggedDetailsMeta(500, 1200, 4)).toBe(500);
    expect(draggedDetailsMeta(100, 1200, 4)).toBe(DETAILS_META_MIN);
    expect(draggedDetailsMeta(2000, 1200, 4)).toBe(896);
    expect(draggedDetailsMeta(800, DETAILS_META_MIN + DETAILS_FILES_MIN + 4, 4)).toBe(DETAILS_META_MIN);
  });
});

describe('defaultDetailsMeta', () => {
  it('centers the sash once both panes together are at least twice the left minimum', () => {
    expect(defaultDetailsMeta(DETAILS_CENTER_AT)).toBe(DETAILS_CENTER_AT / 2);
    expect(defaultDetailsMeta(1200)).toBe(600);
    expect(defaultDetailsMeta(1500)).toBe(750);
  });

  it('keeps the left pane at its minimum below the centering width', () => {
    expect(defaultDetailsMeta(DETAILS_CENTER_AT - 1)).toBe(DETAILS_META_MIN);
    expect(defaultDetailsMeta(DETAILS_META_MIN + DETAILS_FILES_MIN)).toBe(DETAILS_META_MIN);
    expect(defaultDetailsMeta(800)).toBe(DETAILS_META_MIN);
  });
});
