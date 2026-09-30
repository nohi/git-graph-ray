import { describe, expect, it } from 'vitest';
import {
  colourForLane,
  DETAILS_MIN,
  edgeCurveAt,
  edgePath,
  estimateDetailsHeight,
  rayStreamGradient,
  scrollNeededToRevealDetails,
} from './graph';
import { layoutCommits } from './layout';
import { RAY_COLOURS, type GraphCommit } from './types';

describe('edgePath', () => {
  it('draws a vertical line on the same lane', () => {
    expect(edgePath(10, 0, 10, 28, 'rounded')).toBe('M 10 0 L 10 28');
  });

  it('peels off with a quarter-circle at the source for a fork', () => {
    expect(edgePath(10, 0, 26, 28, 'rounded', 'start')).toBe('M 10 0 A 16 16 0 0 1 26 16 L 26 28');
  });

  it('joins with a quarter-circle at the destination for a merge', () => {
    expect(edgePath(10, 0, 26, 28, 'rounded', 'end')).toBe('M 10 0 L 10 12 A 16 16 0 0 0 26 28');
  });

  it('keeps the long run vertical when a merge spans a details gap', () => {
    expect(edgePath(10, 0, 26, 300, 'rounded', 'end')).toBe('M 10 0 L 10 284 A 16 16 0 0 0 26 300');
  });

  it('keeps the long run vertical when a fork spans a details gap', () => {
    expect(edgePath(10, 0, 26, 300, 'rounded', 'start')).toBe('M 10 0 A 16 16 0 0 1 26 16 L 26 300');
  });

  it('rounds the inner corner when a merge comes from the right', () => {
    expect(edgePath(26, 0, 10, 28, 'rounded', 'end')).toBe('M 26 0 L 26 12 A 16 16 0 0 1 10 28');
  });

  it('peels off left with the inner corner', () => {
    expect(edgePath(26, 0, 10, 28, 'rounded', 'start')).toBe('M 26 0 A 16 16 0 0 0 10 16 L 10 28');
  });

  it('adds a horizontal run when the lane jump is wider than one lane', () => {
    expect(edgePath(10, 0, 42, 28, 'rounded', 'end')).toBe('M 10 0 L 10 12 A 16 16 0 0 0 26 28 L 42 28');
  });

  it('keeps angular lane changes as a stepped path', () => {
    expect(edgePath(10, 0, 26, 28, 'angular')).toBe('M 10 0 L 10 14 L 26 14 L 26 28');
  });

  it('pins the angular step next to the destination on a long edge', () => {
    expect(edgePath(10, 0, 26, 300, 'angular', 'end')).toBe('M 10 0 L 10 286 L 26 286 L 26 300');
  });
});

describe('edgeCurveAt', () => {
  it('curves at the destination when joining a commit', () => {
    expect(edgeCurveAt(true)).toBe('end');
  });

  it('curves at the source when opening a new lane', () => {
    expect(edgeCurveAt(false)).toBe('start');
  });

  it('peels off at a merge even when the second parent is the next row', () => {
    expect(edgeCurveAt(true, true)).toBe('start');
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

function commit(hash: string, parents: string[]): GraphCommit {
  return {
    hash,
    parents,
    authorName: '',
    authorEmail: '',
    authorDate: 0,
    committerName: '',
    committerEmail: '',
    committerDate: 0,
    subject: '',
    refs: [],
  };
}

describe('edgeCurveAt with layout', () => {
  const curveAt = (
    commits: GraphCommit[],
    layout: ReturnType<typeof layoutCommits>,
    fromRow: number,
    fromLane: number,
    toLane: number,
  ) => {
    const nodeAt = new Set(layout.vertices.map((v) => `${v.row}:${v.lane}`));
    const edge = layout.edges.find((e) => e.fromRow === fromRow && e.fromLane === fromLane && e.toLane === toLane);
    expect(edge).toBeDefined();
    const from = commits[fromRow];
    const fromVertex = layout.vertices[fromRow];
    const fromIsMerge = !!from && from.parents.length > 1 && fromVertex?.lane === fromLane;
    return edgeCurveAt(nodeAt.has(`${edge!.toRow}:${edge!.toLane}`), fromIsMerge);
  };

  it('peels off at the merge commit when opening a second-parent lane', () => {
    const commits = [commit('m', ['a', 'b']), commit('a', []), commit('b', [])];
    const layout = layoutCommits(commits);
    expect(curveAt(commits, layout, 0, 0, 1)).toBe('start');
  });

  it('peels off at the merge when the second parent is the next commit', () => {
    const commits = [commit('m', ['a', 'b']), commit('b', ['a']), commit('a', [])];
    const layout = layoutCommits(commits);
    expect(layout.vertices.map((v) => v.lane)).toEqual([0, 1, 0]);
    expect(curveAt(commits, layout, 0, 0, 1)).toBe('start');
    expect(curveAt(commits, layout, 1, 1, 0)).toBe('end');
  });

  it('joins at the destination when a branch merges back', () => {
    const commits = [commit('p', ['z']), commit('q', ['z']), commit('z', [])];
    const layout = layoutCommits(commits);
    expect(curveAt(commits, layout, 1, 1, 0)).toBe('end');
  });
});
