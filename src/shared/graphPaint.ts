import { edgePath, laneX, type EdgeCurveAt } from './graph';

export type GraphStroke = {
  colour: string;
  width: number;
  opacity?: string;
  dashed?: boolean;
};

export type DrawnEdge = {
  fromDisplay: number;
  toDisplay: number;
  fromLane: number;
  toLane: number;
  curveAt: EdgeCurveAt;
  stroke: GraphStroke;
};

export type DrawnNode = {
  display: number;
  cx: number;
  colour: string;
  radius: number;
  open: boolean;
  opacity?: string;
  historyRing: boolean;
  headRing: boolean;
};

export type GraphStyle = 'rounded' | 'angular';

/** An edge is drawn when its display span meets the half-open window `[start, end)`. */
export function edgeTouchesRange(fromDisplay: number, toDisplay: number, start: number, end: number): boolean {
  const lo = Math.min(fromDisplay, toDisplay);
  const hi = Math.max(fromDisplay, toDisplay);
  return hi >= start && lo < end;
}

export function renderEdges(edges: readonly DrawnEdge[], style: GraphStyle, yAt: (display: number) => number): string {
  type Piece = { order: number; html: string };
  type Run = { x: number; y1: number; y2: number; stroke: GraphStroke; order: number };
  const pieces: Piece[] = [];
  const open = new Map<string, Run>();
  const flush = (run: Run) => {
    pieces.push({ order: run.order, html: `<path d="${edgePath(run.x, run.y1, run.x, run.y2, 'rounded')}" ${strokeAttrs(run.stroke)} />` });
  };
  edges.forEach((edge, order) => {
    const x1 = laneX(edge.fromLane);
    const x2 = laneX(edge.toLane);
    const y1 = yAt(edge.fromDisplay);
    const y2 = yAt(edge.toDisplay);
    if (x1 === x2) {
      const key = `${strokeKey(edge.stroke)}|${x1}`;
      const top = Math.min(y1, y2);
      const bot = Math.max(y1, y2);
      const run = open.get(key);
      if (run && run.y2 === top) {
        run.y2 = bot;
        return;
      }
      if (run) flush(run);
      open.set(key, { x: x1, y1: top, y2: bot, stroke: edge.stroke, order });
      return;
    }
    pieces.push({
      order,
      html: `<path d="${edgePath(x1, y1, x2, y2, style, edge.curveAt)}" ${strokeAttrs(edge.stroke)} />`,
    });
  });
  for (const run of open.values()) flush(run);
  pieces.sort((a, b) => a.order - b.order);
  return pieces.map((piece) => piece.html).join('');
}

export function renderNodes(nodes: readonly DrawnNode[], yAt: (display: number) => number): string {
  let html = '';
  for (const node of nodes) {
    const cx = node.cx;
    const cy = yAt(node.display);
    const fade = node.opacity ? ` fill-opacity="${node.opacity}" stroke-opacity="${node.opacity}"` : '';
    html += `<circle cx="${cx}" cy="${cy}" r="${node.radius}" fill="${node.open ? 'none' : node.colour}" stroke="${node.colour}"${fade} />`;
    if (node.historyRing) html += `<circle cx="${cx}" cy="${cy}" r="7.5" fill="none" stroke="var(--hl)" stroke-width="1.6" />`;
    if (node.headRing) html += `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${node.colour}" stroke-opacity="0.35" />`;
  }
  return html;
}

function strokeKey(stroke: GraphStroke): string {
  return `${stroke.colour}|${stroke.width}|${stroke.opacity ?? ''}|${stroke.dashed ? 1 : 0}`;
}

function strokeAttrs(stroke: GraphStroke): string {
  const fade = stroke.opacity ? ` stroke-opacity="${stroke.opacity}"` : '';
  const dash = stroke.dashed ? ' stroke-dasharray="4 3"' : '';
  return `fill="none" stroke="${stroke.colour}" stroke-width="${stroke.width}" stroke-linecap="round"${fade}${dash}`;
}
