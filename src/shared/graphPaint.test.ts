import { describe, expect, it } from 'vitest';
import { laneX, rowY } from './graph';
import { edgeTouchesRange, renderEdges, type DrawnEdge, type GraphStroke } from './graphPaint';

const solid: GraphStroke = { colour: '#111', width: 2 };
const faded: GraphStroke = { colour: '#111', width: 2, opacity: '0.2' };

function vertical(from: number, to: number, stroke: GraphStroke = solid, lane = 0): DrawnEdge {
  return { fromDisplay: from, toDisplay: to, fromLane: lane, toLane: lane, curveAt: 'end', stroke };
}

describe('edgeTouchesRange', () => {
  it('keeps an edge that enters or leaves the window', () => {
    expect(edgeTouchesRange(4, 5, 5, 10)).toBe(true);
    expect(edgeTouchesRange(9, 10, 5, 10)).toBe(true);
    expect(edgeTouchesRange(0, 1, 5, 10)).toBe(false);
    expect(edgeTouchesRange(10, 11, 5, 10)).toBe(false);
  });
});

describe('renderEdges', () => {
  it('joins a vertical run of the same stroke into one path', () => {
    const html = renderEdges([vertical(0, 1), vertical(1, 2), vertical(2, 3)], 'rounded', (row) => rowY(row, null));
    expect(html).toBe(
      `<path d="M ${laneX(0)} ${rowY(0, null)} L ${laneX(0)} ${rowY(3, null)}" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" />`,
    );
  });

  it('does not join a run across a missing row or a different stroke', () => {
    const html = renderEdges([vertical(0, 1), vertical(2, 3), vertical(3, 4, faded)], 'rounded', (row) => rowY(row, null));
    expect(html.match(/<path /g)).toHaveLength(3);
  });

  it('keeps a lane change as its own path', () => {
    const curve: DrawnEdge = { fromDisplay: 1, toDisplay: 2, fromLane: 0, toLane: 1, curveAt: 'end', stroke: solid };
    const html = renderEdges([vertical(0, 1), curve, vertical(2, 3, solid, 1)], 'rounded', (row) => rowY(row, null));
    expect(html.match(/<path /g)).toHaveLength(3);
    expect(html).toContain('A ');
  });

  it('joins a vertical run through an inline details gap', () => {
    const gap = { after: 1, height: 100 };
    const html = renderEdges([vertical(0, 1), vertical(1, 2), vertical(2, 3)], 'rounded', (row) => rowY(row, gap));
    expect(html).toBe(
      `<path d="M ${laneX(0)} ${rowY(0, gap)} L ${laneX(0)} ${rowY(3, gap)}" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" />`,
    );
  });
});
