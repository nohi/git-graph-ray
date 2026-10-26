type CatState = 'idle' | 'walk' | 'run' | 'jump' | 'sleep' | 'loaf' | 'scratch' | 'paw' | 'warp' | 'laser';

const FOOT_MARGIN = 8;
const SHADOW_PAD = 56;
const SPRITE_HALF_W = 80;
const SPRITE_TOP = 80;
const EDGE = 80;

const CAT_ORIGIN_X = SPRITE_HALF_W + SHADOW_PAD;
const CAT_ORIGIN_Y = SPRITE_TOP + SHADOW_PAD;
const CAT_CANVAS_W = CAT_ORIGIN_X * 2;
const CAT_CANVAS_H = CAT_ORIGIN_Y + SHADOW_PAD;
// Hangs below the viewport at rest so the glow under the paws is not clipped mid-jump.
const CAT_CANVAS_BOTTOM = -(SHADOW_PAD - FOOT_MARGIN);

export const rayCatFrame = {
  width: CAT_CANVAS_W,
  height: CAT_CANVAS_H,
  originX: CAT_ORIGIN_X,
  originY: CAT_ORIGIN_Y,
  bottom: CAT_CANVAS_BOTTOM,
  footInset: CAT_CANVAS_H - CAT_ORIGIN_Y + CAT_CANVAS_BOTTOM,
};

export function rayCatTransform(x: number, jumpY: number): string {
  return `translate3d(${x - CAT_ORIGIN_X}px, ${jumpY}px, 0)`;
}

export function rayCatHue(timestamp: number, hueOffset: number): number {
  return (timestamp * 0.1 + hueOffset) % 360;
}

const GESTURE_FRAMES = 120;

function gestureSpan(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  const p = (t - a) / (b - a);
  return p * p * (3 - 2 * p);
}

export function catGesture(kind: 'scratch' | 'paw', tick: number): {
  lean: number;
  backL: number;
  backR: number;
  frontL: number;
  frontR: number;
  bodyY: number;
  headY: number;
  headRot: number;
  tail: number;
  eye: number;
  earL: number;
  earR: number;
} {
  const t = Math.min(1, tick / GESTURE_FRAMES);
  if (kind === 'scratch') {
    const sit = gestureSpan(t, 0, 0.16);
    const go = gestureSpan(t, 0.16, 0.3) * (1 - gestureSpan(t, 0.84, 1));
    const kick = go > 0.85 ? Math.sin(t * Math.PI * 18) * 0.42 : 0;
    return {
      lean: 0.08 * go,
      backL: 0.35 * sit,
      backR: 0.45 * sit * (1 - go) + (-1.85 + kick) * go,
      frontL: 0.7 * sit,
      frontR: 0.55 * sit,
      bodyY: 8 * sit,
      headY: 2 * sit,
      headRot: -0.38 * go,
      tail: 0.15 * sit + kick * 0.35,
      eye: t > 0.46 && t < 0.52 ? 0.12 : 1,
      earL: 0.15 * go,
      earR: -0.45 * go,
    };
  }
  const sit = gestureSpan(t, 0, 0.22);
  const up = gestureSpan(t, 0.22, 0.4) * (1 - gestureSpan(t, 0.82, 1));
  const wave = up * Math.sin(t * Math.PI * 7) * 0.28;
  return {
    lean: 0,
    backL: 1.15 * sit,
    backR: 1.15 * sit,
    frontL: 1.15 * sit * (1 - up) + (-1.95 + wave) * up,
    frontR: 1.05 * sit,
    bodyY: 10 * sit,
    headY: 4 * sit,
    headRot: -0.14 * up,
    tail: -0.2 + 0.95 * sit + Math.sin(t * 9) * 0.18 * up,
    eye: 1,
    earL: -0.12 * up,
    earR: 0.18 * up,
  };
}

const HEAD_Y = -35;
const MOUTH_FORWARD = 25;
const MOUTH_DROP = 8;
const HIP_X = 6;
const HIP_Y = -16;
const LASER_SIT_DROP = 10;
const LASER_HEAD_LIMIT = Math.PI / 4;
const PORTAL_X = 58;
const PORTAL_EXIT_X = -32;
const PORTAL_Y = -28;

export function catMouthPoint(
  x: number,
  jumpY: number,
  dir: number,
  viewportHeight: number,
  headRot = 0,
  bodyTilt = 0,
  sitDrop = 0,
): { x: number; y: number } {
  const sin = Math.sin(headRot);
  const cos = Math.cos(headRot);
  const localX = MOUTH_FORWARD - MOUTH_DROP * sin;
  const localY = HEAD_Y + sitDrop + MOUTH_DROP * cos;
  const hipY = HIP_Y + sitDrop;
  const dx = localX - HIP_X;
  const dy = localY - hipY;
  const c = Math.cos(bodyTilt);
  const s = Math.sin(bodyTilt);
  return {
    x: x + dir * (HIP_X + dx * c - dy * s),
    y: viewportHeight - FOOT_MARGIN + jumpY + (hipY + dx * s + dy * c),
  };
}

function laserElevation(fromX: number, fromY: number, targetX: number, targetY: number): number {
  return Math.atan2(targetY - fromY, Math.max(1, Math.abs(targetX - fromX)));
}

/** Local lean after scale(dir). Negative aims up for either facing. At 45° or more the body takes the angle and the head stays level with the chest. */
export function laserAim(
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
): { sit: boolean; body: number; head: number } {
  const elevation = laserElevation(fromX, fromY, targetX, targetY);
  if (Math.abs(elevation) >= LASER_HEAD_LIMIT) return { sit: true, body: elevation, head: 0 };
  return { sit: false, body: 0, head: elevation };
}

export function beamPose(from: { x: number; y: number }, to: { x: number; y: number }): { length: number; angle: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

export type RayCatTagMotion = 'collar' | 'paw';

/** Lower half of the roll is the collar tag. The upper half is the paw stamp. */
export function rayCatTagMotion(roll: number): RayCatTagMotion {
  const unit = ((roll % 1) + 1) % 1;
  return unit < 0.5 ? 'collar' : 'paw';
}

export function rayFlightPoint(from: { x: number; y: number }, to: { x: number; y: number }, p: number): { x: number; y: number } {
  const u = 1 - p;
  const lift = Math.min(72, Math.abs(from.y - to.y) * 0.22 + 36);
  const cx = from.x + (to.x - from.x) * 0.4;
  const cy = Math.min(from.y, to.y) - lift;
  return {
    x: u * u * from.x + 2 * u * p * cx + p * p * to.x,
    y: u * u * from.y + 2 * u * p * cy + p * p * to.y,
  };
}

/** Local head angle after scale(dir). Negative looks up. */
export function rayHeadAim(from: { x: number; y: number }, to: { x: number; y: number }, dir: number): number {
  const ang = Math.atan2(to.y - from.y, Math.max(8, (to.x - from.x) * dir));
  return Math.max(-0.55, Math.min(0.35, ang));
}

type Point = { x: number; y: number };

/** Jagged bolt. The first and last points are the endpoints. */
export function rayBoltPoints(from: Point, to: Point, seed: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const pts = [from];
  for (let i = 1; i < 8; i++) {
    const p = i / 8;
    const jag = Math.sin(seed * 1.7 + i * 2.4) * 16 * Math.sin(p * Math.PI);
    pts.push({ x: from.x + dx * p + px * jag, y: from.y + dy * p + py * jag });
  }
  pts.push(to);
  return pts;
}

/** Portion of a bolt from its start, so the tip travels instead of fading in place. */
export function rayBoltGrown(points: Point[], grow: number): Point[] {
  if (grow <= 0 || points.length < 2) return [];
  const capped = Math.min(1, grow);
  if (capped >= 1) return points;
  const max = (points.length - 1) * capped;
  const last = Math.floor(max);
  const frac = max - last;
  const out = points.slice(0, last + 1);
  const a = points[last]!;
  const b = points[last + 1]!;
  out.push({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac });
  return out;
}

/** Face-side foreleg only. The other foreleg and both hind legs stay down. */
export function rayCatchLegs(amount: number): { backL: number; backR: number; frontL: number; frontR: number } {
  return { backL: 0, backR: 0, frontL: 0, frontR: amount > 0 ? -1.75 * amount : 0 };
}

/** Local foot of the face-side foreleg (pivot 20, -15). Negative angles reach forward and up. */
export function rayForeFoot(angle: number): Point {
  return { x: 20 - 25 * Math.sin(angle), y: -15 + 25 * Math.cos(angle) };
}

function motionSpan(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  const p = (t - a) / (b - a);
  return p * p * (3 - 2 * p);
}

type CatPose = ReturnType<typeof catGesture>;

function sitPose(amount: number, headRot: number): CatPose {
  return {
    lean: 0,
    backL: 1.05 * amount,
    backR: 1.05 * amount,
    frontL: 1.05 * amount,
    frontR: 0.95 * amount,
    bodyY: 8 * amount,
    headY: 2 * amount,
    headRot,
    tail: -0.15 + 0.55 * amount,
    eye: 1,
    earL: 0,
    earR: 0,
  };
}

function stampPose(t: number, headRot: number): CatPose {
  const wind = motionSpan(t, 0, 0.42);
  const strike = motionSpan(t, 0.42, 0.58);
  const back = motionSpan(t, 0.72, 1);
  const raised = wind * (1 - strike);
  const down = strike * (1 - back);
  return {
    lean: 0,
    backL: 0.2 * raised,
    backR: 0.2 * raised,
    frontL: 0.22 * raised,
    frontR: -1.7 * raised + 0.5 * down,
    bodyY: 2 * raised,
    headY: 0,
    headRot,
    tail: -0.2 - 0.3 * raised,
    eye: 1,
    earL: -0.14 * raised,
    earR: 0.08 * raised,
  };
}

function jumpPose(): CatPose {
  return {
    lean: 0,
    backL: 0.5,
    backR: -0.5,
    frontL: -0.5,
    frontR: 0.5,
    bodyY: -4,
    headY: 0,
    headRot: 0,
    tail: -0.75,
    eye: 1,
    earL: 0,
    earR: 0,
  };
}

type BirthSpec = {
  kind: 'clone' | RayCatTagMotion;
  hash: string;
  name: string;
  chip: 'head' | 'tag';
  checkout: boolean;
};

function birthChip(hash: string, kind: 'head' | 'tag', name: string): HTMLElement | null {
  const row = document.querySelector<HTMLElement>(`.row[data-hash="${CSS.escape(hash)}"]`);
  return row?.querySelector<HTMLElement>(`.chip[data-kind="${kind}"][data-name="${CSS.escape(name)}"]`) ?? null;
}

function namedChip(kind: 'head' | 'tag' | 'remote', name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.row .chip[data-kind="${kind}"][data-name="${CSS.escape(name)}"]`);
}

function rowPoint(hash: string): Point | null {
  const row = document.querySelector<HTMLElement>(`.row[data-hash="${CSS.escape(hash)}"]`);
  if (!row) return null;
  const box = row.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return null;
  return { x: box.left + 28, y: box.top + box.height / 2 };
}

function headPoint(): Point | null {
  const chip = document.querySelector<HTMLElement>('.row .chip.head.current');
  if (chip) return boxCenter(chip);
  const row = document.querySelector<HTMLElement>('.row.head-commit');
  if (!row) return null;
  const box = row.getBoundingClientRect();
  if (box.height < 2) return null;
  return { x: box.left + 48, y: box.top + box.height / 2 };
}

function birthAnchor(hash: string): { x: number; y: number } | null {
  const row = document.querySelector<HTMLElement>(`.row[data-hash="${CSS.escape(hash)}"]`);
  if (!row) return null;
  const rect = row.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const chips = row.querySelectorAll<HTMLElement>('.cell.desc .chip');
  const chip = chips.length ? chips[chips.length - 1] : null;
  if (chip) {
    const box = chip.getBoundingClientRect();
    return { x: box.right + 24, y: box.top + box.height / 2 };
  }
  const subject = row.querySelector<HTMLElement>('.subj');
  if (subject) {
    const box = subject.getBoundingClientRect();
    return { x: box.left + 28, y: box.top + box.height / 2 };
  }
  return { x: rect.left + 64, y: rect.top + rect.height / 2 };
}

function boxCenter(el: HTMLElement): { x: number; y: number } | null {
  const box = el.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return null;
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function birthMark(kind: 'tag' | 'band' | 'paw'): HTMLElement {
  const el = document.createElement('div');
  el.className = `ray-birth ${kind}`;
  el.style.opacity = '0';
  return el;
}

function placeMark(el: HTMLElement, x: number, y: number, scale: number, alpha: number, rot: number): void {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.opacity = String(Math.max(0, alpha));
  el.style.transform = `translate(-50%, -50%) rotate(${rot}deg) scale(${Math.max(scale, 0.001)})`;
}

function placeClone(el: HTMLCanvasElement, chest: { x: number; y: number }, scale: number, alpha: number): void {
  el.style.left = `${chest.x - CAT_ORIGIN_X}px`;
  el.style.top = `${chest.y - (CAT_ORIGIN_Y - 30)}px`;
  el.style.opacity = String(Math.max(0, alpha));
  el.style.transform = `scale(${Math.max(scale, 0.001)})`;
}

class RayCat {
  x: number;
  dir = Math.random() < 0.5 ? 1 : -1;
  state: CatState = 'idle';
  targetX: number;
  hueOffset: number;
  tick = 0;
  isJumping = false;
  jumpY = 0;
  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private alive = true;
  private readonly speedWalk = 1.5;
  private readonly speedRun = 5;
  private viewWidth: number;
  private placed = '';
  private scripted = false;
  private scriptGen = 0;
  private scriptPose: CatPose | null = null;
  private chipWatch: MutationObserver | null = null;
  private heldChip: HTMLElement | null = null;
  private aim = 0;
  private bodyTilt = 0;
  private sitAmount = 0;
  private mouth = 0;
  private warpScale = 1;
  private portal = 0;
  private portalX = PORTAL_X;
  private fx: (HTMLElement | SVGElement)[] = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(host: HTMLElement, viewWidth: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ray-cat';
    this.canvas.width = CAT_CANVAS_W;
    this.canvas.height = CAT_CANVAS_H;
    this.canvas.style.width = `${CAT_CANVAS_W}px`;
    this.canvas.style.height = `${CAT_CANVAS_H}px`;
    this.canvas.style.bottom = `${CAT_CANVAS_BOTTOM}px`;
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.viewWidth = Math.max(1, viewWidth);
    this.x = EDGE + Math.random() * Math.max(1, this.viewWidth - EDGE * 2);
    this.targetX = this.x;
    this.hueOffset = Math.random() * 360;
    this.place();
    host.appendChild(this.canvas);
    this.scheduleNextAction(400, 2200);
  }

  dispose(): void {
    this.alive = false;
    this.scriptGen++;
    if (this.actionTimer) clearTimeout(this.actionTimer);
    this.actionTimer = null;
    this.releaseHeld(false);
    this.stopWatch();
    this.scriptPose = null;
    this.clearFx();
    this.canvas.remove();
  }

  setBounds(width: number): void {
    this.viewWidth = width;
    const maxX = Math.max(EDGE, width - EDGE);
    this.x = Math.min(maxX, Math.max(EDGE, this.x));
    this.targetX = Math.min(maxX, Math.max(EDGE, this.targetX));
    this.place();
  }

  private setState(next: CatState): void {
    if (this.state === next) return;
    this.state = next;
    this.tick = 0;
  }

  private beginPose(next: CatState): void {
    this.state = next;
    this.tick = 0;
  }

  private scheduleNextAction(minDelay: number, maxDelay: number): void {
    if (this.actionTimer) clearTimeout(this.actionTimer);
    this.actionTimer = setTimeout(() => this.decideNextAction(), minDelay + Math.random() * (maxDelay - minDelay));
  }

  private decideNextAction(): void {
    if (this.isJumping || this.scripted) return;
    const r = Math.random();
    const width = this.viewWidth;
    if (this.state === 'sleep' || this.state === 'loaf') {
      if (r < 0.3) {
        this.setState('idle');
        this.scheduleNextAction(1000, 3000);
      } else this.scheduleNextAction(2000, 4000);
      return;
    }
    if (r < 0.18) {
      this.targetX = Math.max(EDGE, Math.min(width - EDGE, this.x + (Math.random() - 0.5) * 400));
      this.setState('walk');
    } else if (r < 0.3) {
      this.targetX = Math.max(EDGE, Math.min(width - EDGE, this.x + (Math.random() - 0.5) * 800));
      this.setState('run');
    } else if (r < 0.39) this.performJump();
    else if (r < 0.51) {
      this.setState('sleep');
      this.scheduleNextAction(4000, 8000);
      return;
    } else if (r < 0.63) {
      this.performWarp();
      return;
    } else if (r < 0.73) {
      this.setState('loaf');
      this.scheduleNextAction(3500, 7000);
      return;
    } else if (r < 0.82) {
      this.targetX = this.x;
      this.beginPose('scratch');
      this.scheduleNextAction(2600, 4600);
      return;
    } else if (r < 0.9) {
      this.targetX = this.x;
      this.beginPose('paw');
      this.scheduleNextAction(2600, 4600);
      return;
    } else if (r < 0.97) {
      this.targetX = this.x;
      this.setState('idle');
    } else {
      this.performLaser(null);
      return;
    }
    this.scheduleNextAction(2000, 5000);
  }

  private performJump(): void {
    this.isJumping = true;
    this.setState('jump');
    const jumpDist = (Math.random() - 0.5) * 200;
    this.targetX = Math.max(EDGE, Math.min(this.viewWidth - EDGE, this.x + jumpDist));
    if (this.targetX !== this.x) this.dir = this.targetX > this.x ? 1 : -1;
    const jumpDuration = 40;
    let frame = 0;
    const startX = this.x;
    const jumpHeight = 80 + Math.random() * 40;
    const jumpLoop = () => {
      if (!this.alive || !this.isJumping || this.scripted) return;
      frame++;
      const progress = frame / jumpDuration;
      if (progress <= 1) {
        this.x = startX + (this.targetX - startX) * progress;
        this.jumpY = -Math.sin(progress * Math.PI) * jumpHeight;
        this.place();
        requestAnimationFrame(jumpLoop);
      } else {
        this.jumpY = 0;
        this.isJumping = false;
        this.place();
        this.setState('idle');
        this.decideNextAction();
      }
    };
    jumpLoop();
  }

  private beginScript(): number {
    this.releaseHeld(false);
    this.stopWatch();
    this.scriptPose = null;
    this.scripted = true;
    this.isJumping = false;
    this.jumpY = 0;
    this.place();
    if (this.actionTimer) clearTimeout(this.actionTimer);
    this.actionTimer = null;
    this.clearFx();
    this.mouth = 0;
    this.aim = 0;
    this.bodyTilt = 0;
    this.sitAmount = 0;
    return ++this.scriptGen;
  }

  private endScript(gen: number): void {
    if (this.scriptGen !== gen) return;
    this.releaseHeld(false);
    this.stopWatch();
    this.scriptPose = null;
    this.scripted = false;
    this.warpScale = 1;
    this.portal = 0;
    this.portalX = PORTAL_X;
    this.mouth = 0;
    this.aim = 0;
    this.bodyTilt = 0;
    this.sitAmount = 0;
    this.jumpY = 0;
    this.place();
    this.clearFx();
    this.setState('idle');
    this.scheduleNextAction(600, 1800);
  }

  private stopWatch(): void {
    this.chipWatch?.disconnect();
    this.chipWatch = null;
  }

  private holdChip(chip: HTMLElement): void {
    if (chip.classList.contains('ray-label-born') || this.heldChip === chip) return;
    this.heldChip?.classList.remove('ray-label-gone');
    chip.classList.add('ray-label-gone');
    this.heldChip = chip;
  }

  private releaseHeld(reveal: boolean): void {
    const chip = this.heldChip;
    this.heldChip = null;
    if (!chip?.isConnected) return;
    chip.classList.remove('ray-label-gone');
    if (!reveal) return;
    chip.classList.add('ray-label-born');
    window.setTimeout(() => chip.classList.remove('ray-label-born'), 420);
  }

  private clearFx(): void {
    for (const el of this.fx) el.remove();
    this.fx = [];
  }

  private performWarp(): void {
    const gen = this.beginScript();
    this.setState('warp');
    this.warpScale = 1;
    this.portal = 0;
    this.portalX = PORTAL_X;
    const width = this.viewWidth;
    let nextX = EDGE + Math.random() * Math.max(1, width - EDGE * 2);
    for (let i = 0; i < 6 && Math.abs(nextX - this.x) < 160; i++) {
      nextX = EDGE + Math.random() * Math.max(1, width - EDGE * 2);
    }
    const t0 = performance.now();
    const step = (now: number) => {
      if (!this.alive || this.scriptGen !== gen) return;
      const t = now - t0;
      if (t < 260) {
        this.portal = t / 260;
        this.warpScale = 1;
      } else if (t < 620) {
        this.portal = 1;
        this.warpScale = 1 - (t - 260) / 360;
      } else if (t < 760) {
        this.portal = 0;
        this.warpScale = 0;
        this.portalX = PORTAL_EXIT_X;
        this.x = Math.max(EDGE, Math.min(Math.max(EDGE, width - EDGE), nextX));
        this.targetX = this.x;
        this.dir = Math.random() < 0.5 ? 1 : -1;
      } else if (t < 1020) {
        this.portal = (t - 760) / 260;
        this.warpScale = 0;
      } else if (t < 1420) {
        this.portal = 1;
        this.warpScale = (t - 1020) / 400;
      } else if (t < 1700) {
        this.portal = 1 - (t - 1420) / 280;
        this.warpScale = 1;
      } else {
        this.endScript(gen);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  birth(spec: BirthSpec): void {
    const host = hostEl;
    if (!host) return;
    const anchor = birthAnchor(spec.hash);
    if (anchor) this.dir = anchor.x >= this.x ? 1 : -1;
    const gen = this.beginScript();
    this.setState('idle');
    const rows = document.getElementById('rows');
    if (rows) {
      this.chipWatch = new MutationObserver(() => {
        if (this.scriptGen !== gen) return;
        const chip = birthChip(spec.hash, spec.chip, spec.name);
        if (chip) this.holdChip(chip);
      });
      this.chipWatch.observe(rows, { childList: true, subtree: true });
    }
    const hue = rayCatHue(performance.now(), this.hueOffset);
    const color = spec.chip === 'head' ? `hsl(${Math.round(hue)}, 100%, 68%)` : '#f5c542';
    const pill = document.createElement('div');
    pill.className = 'ray-pill';
    pill.style.setProperty('--c', color);
    pill.style.width = `${Math.min(220, Math.max(44, Math.round(spec.name.length * 7.2 + 18)))}px`;
    pill.style.opacity = '0';
    const tag = spec.kind === 'collar' ? birthMark('tag') : null;
    const band = spec.kind === 'collar' ? birthMark('band') : null;
    const paw = spec.kind === 'paw' ? birthMark('paw') : null;
    host.append(pill);
    if (tag) host.append(tag);
    if (band) host.append(band);
    if (paw) host.append(paw);
    this.fx.push(pill);
    if (tag) this.fx.push(tag);
    if (band) this.fx.push(band);
    if (paw) this.fx.push(paw);
    let ghost: { el: HTMLCanvasElement; home: DOMRect } | null = null;
    let pillAt = { x: this.x, y: window.innerHeight - FOOT_MARGIN };
    let landFrom = pillAt;
    let revealed = false;
    let sawBusy = false;
    let idleSince: number | null = null;
    let phase: 'act' | 'wait' | 'land' | 'hop' | 'fade' = 'act';
    const t0 = performance.now();
    let phaseAt = t0;
    const actMs = spec.kind === 'clone' ? 1620 : spec.kind === 'collar' ? 1500 : 1480;
    const neckAt = (drop: number) => ({
      x: this.x + this.dir * 18,
      y: window.innerHeight - FOOT_MARGIN + this.jumpY - 34 + drop,
    });
    const fallback = () => ({ x: this.x + this.dir * 160, y: Math.max(72, window.innerHeight * 0.28) });
    const showPill = (at: { x: number; y: number }, amount: number) => {
      if (amount <= 0) return;
      pillAt = at;
      pill.style.left = `${at.x}px`;
      pill.style.top = `${at.y}px`;
      pill.style.opacity = String(amount);
      pill.style.transform = `translate(-50%, -50%) scale(${0.65 + 0.35 * amount})`;
    };
    const step = (now: number) => {
      if (!this.alive || this.scriptGen !== gen) return;
      const chipNow = birthChip(spec.hash, spec.chip, spec.name);
      if (chipNow && !revealed) this.holdChip(chipNow);
      const chipCenter = chipNow ? boxCenter(chipNow) : null;
      const dest = chipCenter ?? birthAnchor(spec.hash) ?? fallback();
      const giveUp = () => {
        if (now - t0 > 60_000) return true;
        const busy = document.documentElement.classList.contains('git-busy');
        if (busy) {
          sawBusy = true;
          idleSince = null;
          return false;
        }
        if (!sawBusy && now - t0 < 800) return false;
        if (idleSince === null) idleSince = now;
        return now - idleSince >= 1100;
      };
      if (phase === 'act') {
        const t = now - t0;
        this.jumpY = 0;
        if (spec.kind === 'clone') {
          const peel = motionSpan(t, 300, 620);
          const fly = motionSpan(t, 660, 1420);
          const sit = motionSpan(t, 0, 280) * (1 - motionSpan(t, 1300, 1580));
          if (!ghost && t >= 300) ghost = this.spawnClone(host);
          let focus = dest;
          if (ghost) {
            const from = { x: ghost.home.left + this.dir * 76 + CAT_ORIGIN_X, y: ghost.home.top + CAT_ORIGIN_Y - 30 };
            const slide = { x: ghost.home.left + this.dir * 76 * peel + CAT_ORIGIN_X, y: ghost.home.top + CAT_ORIGIN_Y - 30 };
            const chest = fly > 0 ? rayFlightPoint(from, dest, fly) : slide;
            const alpha = 0.86 * (fly > 0 ? 1 : peel) * (1 - motionSpan(t, 1240, 1520));
            placeClone(ghost.el, chest, 1 - fly * 0.82, alpha);
            focus = chest;
          }
          this.scriptPose = sitPose(sit, rayHeadAim(neckAt(8 * sit), focus, this.dir));
          showPill(dest, motionSpan(t, 1280, 1560));
        } else if (spec.kind === 'collar' && tag && band) {
          const sit = motionSpan(t, 0, 340) * (1 - motionSpan(t, 1200, 1480));
          const lift = motionSpan(t, 300, 560);
          const fly = motionSpan(t, 560, 1280);
          const drop = 8 * sit;
          const neck = { x: this.x + this.dir * 16, y: window.innerHeight - FOOT_MARGIN + this.jumpY - 18 + drop };
          const launch = { x: neck.x + this.dir * 18, y: neck.y - 24 };
          const parked = { x: neck.x + (launch.x - neck.x) * lift, y: neck.y + (launch.y - neck.y) * lift };
          const pos = fly > 0 ? rayFlightPoint(launch, dest, fly) : parked;
          const fade = 1 - motionSpan(t, 1120, 1400);
          placeMark(tag, pos.x, pos.y, 0.95 - fly * 0.5, fade, this.dir * -28 * (1 - fly));
          placeMark(band, neck.x, neck.y + 8, 1, fade, 0);
          this.scriptPose = sitPose(sit, rayHeadAim(neck, pos, this.dir));
          showPill(dest, motionSpan(t, 1160, 1460));
        } else if (paw) {
          const stamp = motionSpan(t, 0, 1000);
          const fly = motionSpan(t, 640, 1280);
          const from = { x: this.x + this.dir * 30, y: window.innerHeight - FOOT_MARGIN + this.jumpY - 50 };
          const pos = fly > 0 ? rayFlightPoint(from, dest, fly) : from;
          placeMark(paw, pos.x, pos.y, 1 - fly * 0.58, fly * (1 - motionSpan(t, 1140, 1400)), 0);
          this.scriptPose = stampPose(stamp, rayHeadAim(neckAt(0), fly > 0 ? pos : dest, this.dir));
          showPill(dest, motionSpan(t, 1180, 1440));
        }
        if (t >= actMs) {
          phase = chipCenter ? 'land' : 'wait';
          phaseAt = now;
          landFrom = { ...pillAt };
          this.scriptPose = sitPose(0, rayHeadAim(neckAt(0), pillAt, this.dir));
        }
      } else if (phase === 'wait') {
        this.scriptPose = sitPose(0, rayHeadAim(neckAt(0), pillAt, this.dir));
        showPill(pillAt, 1);
        if (chipCenter) {
          phase = 'land';
          phaseAt = now;
          landFrom = { ...pillAt };
        } else if (giveUp()) {
          phase = 'fade';
          phaseAt = now;
        }
      } else if (phase === 'land') {
        const p = motionSpan(now - phaseAt, 0, 360);
        const at = { x: landFrom.x + (dest.x - landFrom.x) * p, y: landFrom.y + (dest.y - landFrom.y) * p };
        pill.style.left = `${at.x}px`;
        pill.style.top = `${at.y}px`;
        pill.style.opacity = String(1 - p);
        pill.style.transform = 'translate(-50%, -50%) scale(1)';
        if (chipNow) {
          const box = chipNow.getBoundingClientRect();
          if (box.width > 2) {
            pill.style.width = `${box.width}px`;
            pill.style.height = `${box.height}px`;
          }
        }
        this.scriptPose = sitPose(0, rayHeadAim(neckAt(0), at, this.dir));
        if (p >= 0.55 && !revealed) {
          revealed = true;
          this.stopWatch();
          this.releaseHeld(true);
        }
        if (p >= 1) {
          if (!revealed) {
            revealed = true;
            this.stopWatch();
            this.releaseHeld(true);
          }
          if (spec.checkout) {
            phase = 'hop';
            phaseAt = now;
          } else {
            this.endScript(gen);
            return;
          }
        }
      } else if (phase === 'hop') {
        const p = Math.min(1, (now - phaseAt) / 480);
        this.jumpY = -Math.sin(p * Math.PI) * 36;
        this.place();
        this.scriptPose = p > 0 && p < 1 ? jumpPose() : null;
        if (p >= 1) {
          this.jumpY = 0;
          this.place();
          this.endScript(gen);
          return;
        }
      } else if (chipCenter) {
        phase = 'land';
        phaseAt = now;
        landFrom = { ...pillAt };
      } else {
        const p = Math.min(1, (now - phaseAt) / 300);
        pill.style.opacity = String(1 - p);
        if (ghost) ghost.el.style.opacity = '0';
        if (tag) tag.style.opacity = '0';
        if (paw) paw.style.opacity = '0';
        if (band) band.style.opacity = '0';
        if (p >= 1) {
          this.endScript(gen);
          return;
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private spawnClone(host: HTMLElement): { el: HTMLCanvasElement; home: DOMRect } | null {
    const el = document.createElement('canvas');
    el.className = 'ray-clone';
    el.width = this.canvas.width;
    el.height = this.canvas.height;
    el.style.width = this.canvas.style.width;
    el.style.height = this.canvas.style.height;
    el.style.transformOrigin = `${CAT_ORIGIN_X}px ${CAT_ORIGIN_Y - 30}px`;
    const ctx = el.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(this.canvas, 0, 0);
    const home = this.canvas.getBoundingClientRect();
    host.append(el);
    this.fx.push(el);
    return { el, home };
  }

  private feetY(): number {
    return window.innerHeight - FOOT_MARGIN + this.jumpY;
  }

  private neck(): Point {
    return { x: this.x + this.dir * 16, y: this.feetY() - 30 };
  }

  private mouthPoint(headRot = 0): Point {
    return catMouthPoint(this.x, this.jumpY, this.dir, window.innerHeight, headRot);
  }

  private stand(headRot: number, frontR = 0): CatPose {
    return {
      lean: 0,
      backL: 0,
      backR: 0,
      frontL: 0,
      frontR,
      bodyY: 0,
      headY: 0,
      headRot,
      tail: -0.55,
      eye: 1,
      earL: 0,
      earR: 0,
    };
  }

  private boltLayer(): SVGSVGElement | null {
    const host = hostEl;
    if (!host) return null;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ray-bolt');
    host.append(svg);
    this.fx.push(svg);
    return svg;
  }

  private paintBolts(svg: SVGSVGElement, bolts: { from: Point; to: Point; seed: number; grow: number; alpha: number; ring?: Point }[]): void {
    const ns = 'http://www.w3.org/2000/svg';
    const w = window.innerWidth;
    const h = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.replaceChildren();
    const addLine = (pts: Point[], width: number, color: string, alpha: number) => {
      if (pts.length < 2 || alpha < 0.04) return;
      const line = document.createElementNS(ns, 'polyline');
      line.setAttribute('points', pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', String(width));
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');
      line.setAttribute('opacity', String(alpha));
      svg.append(line);
    };
    for (const bolt of bolts) {
      if (bolt.alpha < 0.04 || bolt.grow < 0.02) continue;
      const full = rayBoltPoints(bolt.from, bolt.to, bolt.seed);
      const pts = rayBoltGrown(full, bolt.grow);
      addLine(pts, 9, 'rgba(126, 233, 245, 0.8)', bolt.alpha * 0.95);
      addLine(pts, 2.6, '#ffffff', bolt.alpha);
      if (bolt.grow > 0.5 && bolt.alpha > 0.15 && full.length > 5) {
        const mid = full[4]!;
        const dx = bolt.to.x - bolt.from.x;
        const dy = bolt.to.y - bolt.from.y;
        const len = Math.hypot(dx, dy) || 1;
        const fork = Math.sin(bolt.seed * 2.1) * 28;
        addLine([mid, { x: mid.x + (-dy / len) * fork, y: mid.y + (dx / len) * fork }], 2, '#ffffff', bolt.alpha * 0.9);
      }
      if (bolt.ring && bolt.grow > 0.7 && bolt.alpha > 0.05) {
        const ring = document.createElementNS(ns, 'circle');
        ring.setAttribute('cx', bolt.ring.x.toFixed(1));
        ring.setAttribute('cy', bolt.ring.y.toFixed(1));
        ring.setAttribute('r', (8 + bolt.grow * 26).toFixed(1));
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', '#e7fbff');
        ring.setAttribute('stroke-width', '3');
        ring.setAttribute('opacity', String(bolt.alpha * 0.85));
        svg.append(ring);
      }
    }
  }

  private boltLife(t: number, start: number, span = 120): { grow: number; alpha: number } {
    const grow = motionSpan(t, start, start + span);
    const alpha = grow <= 0 ? 0 : 1 - motionSpan(t, start + span * 0.92, start + span * 1.92);
    return { grow, alpha };
  }

  renameBranch(oldName: string, newName: string): void {
    const host = hostEl;
    const chip = namedChip('head', oldName);
    const spot = chip ? boxCenter(chip) : null;
    if (!host || !spot) return;
    this.dir = spot.x >= this.x ? 1 : -1;
    const gen = this.beginScript();
    this.setState('idle');
    const rows = document.getElementById('rows');
    if (rows) {
      this.chipWatch = new MutationObserver(() => {
        if (this.scriptGen !== gen) return;
        const next = namedChip('head', newName);
        if (next) this.holdChip(next);
      });
      this.chipWatch.observe(rows, { childList: true, subtree: true });
    }
    const svg = this.boltLayer();
    const ghost = chip ? pinGhost(chip, host) : null;
    if (ghost) this.fx.push(ghost);
    const sparks = Array.from({ length: 6 }, () => {
      const el = document.createElement('div');
      el.className = 'ray-orb';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, -50%)';
      host.append(el);
      this.fx.push(el);
      return el;
    });
    let phase: 'zap' | 'wait' | 'burst' = 'zap';
    const t0 = performance.now();
    let phaseAt = t0;
    const busy = { sawBusy: false, idleSince: null as number | null };
    const step = (now: number) => {
      if (!this.alive || this.scriptGen !== gen) return;
      const next = namedChip('head', newName);
      if (next && next !== chip) this.holdChip(next);
      const at = (next && boxCenter(next)) || (chip && chip.isConnected ? boxCenter(chip) : null) || spot;
      const chest = { x: this.x + this.dir * 36, y: this.feetY() - 26 };
      const aim = rayHeadAim(this.neck(), at, this.dir);
      if (phase === 'zap') {
        const t = now - t0;
        const paw = motionSpan(t, 60, 240) * (1 - motionSpan(t, 640, 860));
        const flick = t > 160 && t < 860 ? Math.max(0, Math.sin(((t - 160) / 700) * Math.PI * 6)) : 0;
        this.scriptPose = this.stand(aim * Math.max(paw, flick > 0 ? 1 : 0), -1.7 * paw);
        if (svg) this.paintBolts(svg, [{ from: chest, to: at, seed: Math.floor(t / 90) + 1, grow: flick > 0 ? 1 : 0, alpha: flick, ring: at }]);
        if (t >= 900) {
          phase = this.heldChip ? 'burst' : 'wait';
          phaseAt = now;
        }
      } else if (phase === 'wait') {
        this.scriptPose = this.stand(aim);
        if (svg) this.paintBolts(svg, []);
        if (this.heldChip) {
          phase = 'burst';
          phaseAt = now;
        } else if (gitSettled(t0, now, busy)) {
          this.endScript(gen);
          return;
        }
      } else {
        const p = motionSpan(now - phaseAt, 0, 420);
        this.scriptPose = this.stand(aim * (1 - p));
        if (svg) this.paintBolts(svg, []);
        if (chip?.isConnected) chip.classList.add('ray-label-gone');
        if (ghost) {
          ghost.style.opacity = String(1 - p);
          ghost.style.transform = `translateY(${(-8 * p).toFixed(1)}px) scale(${(1 - p * 0.28).toFixed(3)})`;
        }
        const spread = 18 * Math.sin(Math.min(1, p) * Math.PI) * (1 - p);
        const gx = spot.x + (at.x - spot.x) * p;
        const gy = spot.y + (at.y - spot.y) * p;
        sparks.forEach((el, i) => {
          const ang = (i / sparks.length) * Math.PI * 2;
          el.style.left = `${gx + Math.cos(ang) * spread}px`;
          el.style.top = `${gy + Math.sin(ang) * spread}px`;
          el.style.opacity = String(Math.sin(Math.min(1, p) * Math.PI));
        });
        if (p >= 1) {
          this.stopWatch();
          this.releaseHeld(true);
          this.endScript(gen);
          return;
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  pushBranch(spot: Point | null): void {
    this.volley('up', spot);
  }

  pullBranch(spot: Point | null): void {
    this.volley('down', spot);
  }

  private volley(dirY: 'up' | 'down', spot: Point | null): void {
    const host = hostEl;
    if (!host) return;
    const gen = this.beginScript();
    this.setState('idle');
    const svg = this.boltLayer();
    const home = spot ?? { x: this.x + this.dir * 90, y: Math.max(72, window.innerHeight * 0.32) };
    if (spot) this.dir = spot.x >= this.x ? 1 : -1;
    const scale = dirY === 'up' ? 2300 : 2100;
    const span = scale * 0.12;
    const starts = (dirY === 'up' ? [0.36, 0.5, 0.64, 0.78] : [0.14, 0.32, 0.5, 0.68]).map((mark) => mark * scale);
    const t0 = performance.now();
    const step = (now: number) => {
      if (!this.alive || this.scriptGen !== gen) return;
      const t = now - t0;
      const at = spot ?? home;
      this.scriptPose = this.stand(rayHeadAim(this.neck(), { x: at.x, y: -28 }, this.dir));
      const bolts: { from: Point; to: Point; seed: number; grow: number; alpha: number; ring?: Point }[] = [];
      if (dirY === 'up') {
        const zap = this.boltLife(t, scale * 0.16, span);
        bolts.push({ from: { x: this.x + this.dir * 36, y: this.feetY() - 26 }, to: at, seed: 2, grow: zap.grow, alpha: zap.alpha, ring: at });
      }
      starts.forEach((start, i) => {
        const strike = this.boltLife(t, start, span);
        const spread = dirY === 'up' ? 14 : 16;
        const ox = at.x + (i - 1.5) * spread;
        const from = dirY === 'up' ? { x: ox, y: at.y } : { x: ox, y: -24 };
        const to = dirY === 'up' ? { x: ox + Math.sin(i + 1) * 12, y: -30 } : { x: at.x + (i - 1.5) * 5, y: at.y };
        bolts.push({ from, to, seed: (dirY === 'up' ? 6 : 5) + i, grow: strike.grow, alpha: strike.alpha, ring: at });
      });
      if (svg) this.paintBolts(svg, bolts);
      if (t >= scale) this.endScript(gen);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  cherryPick(hash: string): void {
    const host = hostEl;
    if (!host || !hash) return;
    const gen = this.beginScript();
    this.setState('idle');
    const orb = document.createElement('div');
    orb.className = 'ray-orb';
    orb.style.opacity = '0';
    host.append(orb);
    this.fx.push(orb);
    const source = rowPoint(hash) ?? { x: this.x, y: Math.max(72, window.innerHeight * 0.28) };
    this.dir = source.x >= this.x ? 1 : -1;
    let phase: 'pluck' | 'carry' | 'place' = 'pluck';
    const t0 = performance.now();
    let phaseAt = t0;
    let carryFrom = this.x;
    let carryTo = this.x;
    const holdRot = 0.08;
    const placeOrb = (at: Point, radius: number) => {
      orb.style.left = `${at.x}px`;
      orb.style.top = `${at.y}px`;
      orb.style.opacity = '1';
      orb.style.transform = `translate(-50%, -50%) scale(${radius / 4})`;
    };
    const step = (now: number) => {
      if (!this.alive || this.scriptGen !== gen) return;
      const mouth = this.mouthPoint(holdRot);
      const dest = headPoint() ?? { x: mouth.x + this.dir * 80, y: Math.max(72, window.innerHeight * 0.28) };
      if (phase === 'pluck') {
        const p = motionSpan(now - phaseAt, 140, 980);
        const drop = p * p;
        const at = {
          x: source.x + (mouth.x - source.x) * drop,
          y: source.y + (mouth.y - source.y) * drop,
        };
        this.scriptPose = this.stand(rayHeadAim(this.neck(), at, this.dir) * (1 - p) + holdRot * p);
        placeOrb(p > 0 ? at : source, 6.5 - drop * 2.9);
        if (now - phaseAt >= 1040) {
          phase = 'carry';
          phaseAt = now;
          carryFrom = this.x;
          const toward = Math.max(EDGE, Math.min(Math.max(EDGE, this.viewWidth - EDGE), dest.x));
          if (Math.abs(toward - this.x) < 36) carryTo = this.x;
          else {
            carryTo = toward;
            this.dir = carryTo >= this.x ? 1 : -1;
          }
        }
      } else if (phase === 'carry') {
        const p = motionSpan(now - phaseAt, 0, 1100);
        const walking = Math.abs(carryTo - carryFrom) > 1 && p > 0 && p < 1;
        this.x = carryFrom + (carryTo - carryFrom) * p;
        this.targetX = this.x;
        this.place();
        const stepAmt = Math.sin(p * 18) * (walking ? 0.42 : 0);
        this.scriptPose = {
          lean: 0,
          backL: -stepAmt,
          backR: stepAmt,
          frontL: stepAmt,
          frontR: -stepAmt,
          bodyY: 0,
          headY: 0,
          headRot: holdRot,
          tail: -0.2,
          eye: 1,
          earL: 0,
          earR: 0,
        };
        placeOrb(this.mouthPoint(holdRot), 3.6);
        if (now - phaseAt >= 1160) {
          phase = 'place';
          phaseAt = now;
          const landed = headPoint();
          if (landed) this.dir = landed.x >= this.x ? 1 : -1;
        }
      } else {
        const p = motionSpan(now - phaseAt, 80, 720);
        const from = this.mouthPoint(holdRot);
        const u = 1 - p;
        const lead = { x: from.x + this.dir * 28, y: from.y };
        const at = {
          x: u * u * from.x + 2 * u * p * lead.x + p * p * dest.x,
          y: u * u * from.y + 2 * u * p * lead.y + p * p * dest.y,
        };
        this.scriptPose = this.stand(holdRot * (1 - p) + rayHeadAim(this.neck(), dest, this.dir) * p);
        placeOrb(at, 3.6 + p * 2.4);
        if (p >= 1) {
          orb.style.opacity = '0';
          this.endScript(gen);
          return;
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  deleteTag(name: string): void {
    const host = hostEl;
    const chip = namedChip('tag', name);
    const home = chip ? boxCenter(chip) : null;
    if (!host || !chip || !home) return;
    this.dir = home.x >= this.x ? 1 : -1;
    const gen = this.beginScript();
    this.setState('idle');
    this.holdChip(chip);
    const tag = birthMark('tag');
    host.append(tag);
    this.fx.push(tag);
    const paw = rayForeFoot(-1.75);
    const maxX = Math.max(EDGE, this.viewWidth - EDGE);
    const park = Math.max(EDGE, Math.min(maxX, home.x - this.dir * paw.x));
    const startX = this.x;
    const mitt = { x: park + this.dir * paw.x, y: this.feetY() + paw.y };
    const t0 = performance.now();
    let caught = false;
    const busy = { sawBusy: false, idleSince: null as number | null };
    const step = (now: number) => {
      if (!this.alive || this.scriptGen !== gen) return;
      const t = now - t0;
      const slide = motionSpan(t, 0, 640);
      this.x = startX + (park - startX) * slide;
      this.targetX = this.x;
      this.place();
      const reach = motionSpan(t, 280, 980);
      const legs = rayCatchLegs(reach);
      const g = t <= 420 ? 0 : t >= 1600 ? 1 : (t - 420) / 1180;
      const fall = g * g;
      const pos = { x: home.x + (mitt.x - home.x) * fall, y: home.y + (mitt.y - home.y) * fall };
      const absorb = motionSpan(t, 1700, 2140);
      this.scriptPose = {
        lean: 0,
        ...legs,
        bodyY: 0,
        headY: 0,
        headRot: rayHeadAim(this.neck(), pos, this.dir) * (1 - absorb),
        tail: -0.2 - 0.2 * reach,
        eye: 1,
        earL: 0,
        earR: 0,
      };
      placeMark(tag, pos.x, pos.y, 1 - absorb * 0.75, 1 - absorb, fall * 46 * this.dir);
      if (t >= 2140) caught = true;
      if (caught) {
        const gone = !chip.isConnected;
        if (gone || gitSettled(t0, now, busy)) {
          if (!gone) this.releaseHeld(false);
          else this.heldChip = null;
          this.endScript(gen);
          return;
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  fireLaser(target: { x: number; y: number } | null, chip: HTMLElement | null = null): void {
    const host = hostEl;
    if (!host) return;
    const gen = this.beginScript();
    this.setState('laser');
    const viewH = window.innerHeight;
    if (target) this.dir = target.x >= this.x ? 1 : -1;
    const originY = viewH - FOOT_MARGIN + this.jumpY;
    const dest = target ?? { x: this.x + this.dir * 340, y: originY - 40 };
    const rest = catMouthPoint(this.x, this.jumpY, this.dir, viewH);
    let aim = laserAim(rest.x, rest.y, dest.x, dest.y);
    if (aim.sit) {
      const seated = catMouthPoint(this.x, this.jumpY, this.dir, viewH, 0, aim.body, LASER_SIT_DROP);
      aim = { sit: true, head: 0, body: laserElevation(seated.x, seated.y, dest.x, dest.y) };
    }
    const hue = rayCatHue(performance.now(), this.hueOffset);
    const beam = document.createElement('div');
    beam.className = 'ray-beam';
    beam.style.setProperty('--h', String(hue));
    beam.style.opacity = '0';
    const spark = document.createElement('div');
    spark.className = 'ray-spark';
    spark.style.setProperty('--h', String(hue));
    spark.style.left = `${dest.x}px`;
    spark.style.top = `${dest.y}px`;
    spark.style.opacity = '0';
    host.append(beam, spark);
    this.fx.push(beam, spark);
    const sitMs = aim.sit ? 200 : 0;
    const tiltMs = aim.sit ? 220 : 0;
    const ready = sitMs + tiltMs;
    const grow = 180;
    const hold = 460;
    const fade = 240;
    const ghost = chip ? liftLabel(chip, host, ready + grow + hold + fade + 80) : null;
    let scorched = false;
    const t0 = performance.now();
    const smooth = (p: number) => p * p * (3 - 2 * p);
    const step = (now: number) => {
      if (!this.alive || this.scriptGen !== gen) return;
      const t = now - t0;
      const sitP = sitMs === 0 ? 0 : smooth(Math.min(1, t / sitMs));
      const tiltP = tiltMs === 0 ? 0 : smooth(Math.max(0, Math.min(1, (t - sitMs) / tiltMs)));
      this.sitAmount = sitP;
      this.bodyTilt = aim.body * tiltP;
      this.aim = aim.sit ? 0 : aim.head * Math.min(1, t / 120);
      const fireT = t - ready;
      this.mouth = fireT < 0 ? 0 : fireT < 140 ? fireT / 140 : fireT > grow + hold ? Math.max(0, 1 - (fireT - grow - hold) / fade) : 1;
      const from = catMouthPoint(this.x, this.jumpY, this.dir, viewH, this.aim, this.bodyTilt, this.sitAmount * LASER_SIT_DROP);
      const pose = beamPose(from, dest);
      const scale = fireT < 0 ? 0 : Math.max(0, Math.min(1, fireT / grow));
      const flicker = 0.86 + Math.sin(t * 0.08) * 0.14;
      const opacity = fireT < 0 ? 0 : fireT > grow + hold ? Math.max(0, 1 - (fireT - grow - hold) / fade) : 1;
      beam.style.left = `${from.x}px`;
      beam.style.top = `${from.y - 8}px`;
      beam.style.width = `${Math.max(1, pose.length)}px`;
      beam.style.opacity = String(opacity);
      beam.style.transform = `rotate(${(pose.angle * 180) / Math.PI}deg) scaleX(${scale}) scaleY(${flicker})`;
      spark.style.opacity = String(scale > 0.85 ? opacity : 0);
      if (!scorched && ghost && fireT >= grow) {
        scorched = true;
        ghost.classList.add('ray-scorch');
      }
      if (fireT < grow + hold + fade) requestAnimationFrame(step);
      else this.endScript(gen);
    };
    requestAnimationFrame(step);
  }

  private performLaser(target: { x: number; y: number } | null): void {
    this.fireLaser(target, null);
  }

  update(): void {
    this.tick++;
    if (this.isJumping || this.scripted || this.state === 'sleep' || this.state === 'loaf' || this.state === 'scratch' || this.state === 'paw' || this.state === 'idle') return;
    const dx = this.targetX - this.x;
    const dist = Math.abs(dx);
    if (dist > 5) {
      this.dir = dx > 0 ? 1 : -1;
      const speed = this.state === 'run' ? this.speedRun : this.speedWalk;
      this.x += (dx / dist) * speed;
    } else this.setState('idle');
  }

  paint(timestamp: number): void {
    this.update();
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CAT_CANVAS_W, CAT_CANVAS_H);
    this.draw(ctx, timestamp);
    this.place();
  }

  private place(): void {
    const next = rayCatTransform(this.x, this.jumpY);
    if (next === this.placed) return;
    this.placed = next;
    this.canvas.style.transform = next;
  }

  draw(ctx: CanvasRenderingContext2D, timestamp: number): void {
    const hue = rayCatHue(timestamp, this.hueOffset);
    if (this.fx.length > 0) {
      const value = String(hue);
      for (const el of this.fx) el.style.setProperty('--h', value);
    }
    ctx.filter = `drop-shadow(0 0 10px hsl(${hue}, 100%, 60%)) drop-shadow(0 0 20px hsl(${hue}, 100%, 50%))`;
    ctx.save();
    ctx.translate(CAT_ORIGIN_X, CAT_ORIGIN_Y);
    ctx.scale(this.dir, 1);
    const gesture = this.scriptPose ?? (this.state === 'scratch' || this.state === 'paw' ? catGesture(this.state, this.tick) : null);
    const sitDrop = this.sitAmount * LASER_SIT_DROP;
    const lean = this.bodyTilt + (gesture?.lean ?? 0);
    if (sitDrop !== 0 || lean !== 0) {
      const hipY = HIP_Y + sitDrop;
      ctx.translate(HIP_X, hipY);
      ctx.rotate(lean);
      ctx.translate(-HIP_X, -hipY);
    }
    ctx.save();
    if (this.warpScale !== 1) {
      const scale = Math.max(this.warpScale, 0.001);
      ctx.translate(this.portalX, PORTAL_Y);
      ctx.scale(scale, scale);
      ctx.translate(-this.portalX, -PORTAL_Y);
    }

    let legAngle1 = 0;
    let legAngle2 = 0;
    let backL: number | null = null;
    let backR: number | null = null;
    let frontL: number | null = null;
    let frontR: number | null = null;
    let bodyY = 0;
    let headY = 0;
    let headRot = 0;
    let tailRot = 0;
    let eyeOpen = 1;
    let earRotL = 0;
    let earRotR = 0;
    const t = this.tick;
    switch (this.state) {
      case 'idle':
        tailRot = Math.sin(t * 0.05) * 0.2 - 0.2;
        headY = Math.sin(t * 0.08) * 1;
        if (t % 150 > 145) eyeOpen = 0.1;
        break;
      case 'walk':
        legAngle1 = Math.sin(t * 0.2) * 0.5;
        legAngle2 = Math.sin(t * 0.2 + Math.PI) * 0.5;
        bodyY = Math.abs(Math.sin(t * 0.2)) * -3;
        headY = Math.abs(Math.sin(t * 0.2)) * -2;
        tailRot = Math.sin(t * 0.2) * 0.3 - 0.2;
        break;
      case 'run':
        legAngle1 = Math.sin(t * 0.4) * 0.8;
        legAngle2 = Math.sin(t * 0.4 + Math.PI) * 0.8;
        bodyY = Math.abs(Math.sin(t * 0.4)) * -6 - 2;
        headY = Math.abs(Math.sin(t * 0.4)) * -4;
        tailRot = -0.6;
        earRotL = -0.2;
        earRotR = 0.2;
        break;
      case 'jump':
        legAngle1 = -0.5;
        legAngle2 = 0.5;
        bodyY = -5;
        tailRot = -0.8;
        break;
      case 'warp':
        legAngle1 = -0.35;
        legAngle2 = 0.35;
        bodyY = -3;
        tailRot = Math.sin(t * 0.35) * 0.5;
        break;
      case 'laser':
        headRot = this.aim;
        tailRot = 0.15 + this.sitAmount * 0.95;
        if (this.sitAmount > 0) {
          legAngle1 = 1.2 * this.sitAmount;
          legAngle2 = 1.2 * this.sitAmount;
          bodyY = sitDrop;
          headY = sitDrop;
        }
        break;
      case 'loaf': {
        const sit = Math.min(1, this.tick / 16);
        legAngle1 = 1.55 * sit;
        legAngle2 = 1.55 * sit;
        bodyY = 13 * sit;
        headY = 3 * sit;
        headRot = 0.06 * sit;
        tailRot = -0.2 + 1.2 * sit;
        if (this.tick > 20 && this.tick % 130 > 120) eyeOpen = 0.08;
        break;
      }
      case 'scratch':
      case 'paw': {
        const g = gesture ?? catGesture(this.state, this.tick);
        backL = g.backL;
        backR = g.backR;
        frontL = g.frontL;
        frontR = g.frontR;
        bodyY = g.bodyY;
        headY = g.headY;
        headRot = g.headRot;
        tailRot = g.tail;
        eyeOpen = g.eye;
        earRotL = g.earL;
        earRotR = g.earR;
        break;
      }
      case 'sleep':
        bodyY = Math.sin(t * 0.03) * -2 + 10;
        headY = Math.sin(t * 0.03) * -1 + 15;
        headRot = 0.4;
        tailRot = 0.2;
        eyeOpen = 0.05;
        legAngle1 = 0.5;
        legAngle2 = 0.5;
        break;
    }
    if (this.scriptPose) {
      const pose = this.scriptPose;
      backL = pose.backL;
      backR = pose.backR;
      frontL = pose.frontL;
      frontR = pose.frontR;
      bodyY = pose.bodyY;
      headY = pose.headY;
      headRot = pose.headRot;
      tailRot = pose.tail;
      eyeOpen = pose.eye;
      earRotL = pose.earL;
      earRotR = pose.earR;
    }

    const baseColor = '#f4f4f4';
    const darkColor = '#dddddd';
    const drawEllipse = (cx: number, cy: number, rx: number, ry: number, rot: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    };
    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.fill();
    };
    const drawLeg = (ox: number, oy: number, angle: number, isFront: boolean) => {
      ctx.save();
      ctx.translate(ox, oy + bodyY);
      ctx.rotate(angle);
      drawRoundedRect(-6, 0, 12, 25, 6, isFront ? baseColor : darkColor);
      ctx.restore();
    };

    ctx.save();
    ctx.translate(-25, -25 + bodyY);
    ctx.rotate(tailRot);
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.quadraticCurveTo(-40, 10, -50, -10);
    ctx.quadraticCurveTo(-30, -25, 0, -5);
    ctx.fill();
    ctx.restore();

    const asleep = this.state === 'sleep';
    drawLeg(-15, -20, asleep ? 1.5 : (backL ?? legAngle2), false);
    drawLeg(15, -20, asleep ? 1.5 : (backR ?? legAngle1), false);
    drawEllipse(0, -25 + bodyY, 35, 22, 0, baseColor);
    drawLeg(-10, -15, asleep ? 1.5 : (frontL ?? legAngle1), true);
    drawLeg(20, -15, asleep ? 1.5 : (frontR ?? legAngle2), true);

    ctx.save();
    ctx.translate(25, -35 + headY);
    ctx.rotate(headRot);
    ctx.save();
    ctx.rotate(earRotL);
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.quadraticCurveTo(-15, -25, -5, -25);
    ctx.lineTo(0, -10);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate(earRotR);
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(5, -10);
    ctx.quadraticCurveTo(15, -25, 10, -25);
    ctx.lineTo(0, -10);
    ctx.fill();
    ctx.restore();
    drawEllipse(0, 0, 20, 16, 0, baseColor);
    ctx.filter = 'none';
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(-8, -2, 3.5, 4 * eyeOpen, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, -2, 3.5, 4 * eyeOpen, 0, 0, Math.PI * 2);
    ctx.fill();
    if (eyeOpen > 0.5) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-9, -3, 1.2, 0, Math.PI * 2);
      ctx.arc(7, -3, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff8899';
    ctx.beginPath();
    ctx.moveTo(-2, 4);
    ctx.lineTo(2, 4);
    ctx.lineTo(0, 6.5);
    ctx.fill();
    if (this.mouth > 0.2) {
      ctx.fillStyle = '#14080c';
      ctx.beginPath();
      ctx.ellipse(0, 8, 8 * this.mouth, 5.5 * this.mouth, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(3.5, 8, 2.4 * this.mouth, 1.6 * this.mouth, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, 6);
      ctx.quadraticCurveTo(-2.5, 10, 0, 6.5);
      ctx.quadraticCurveTo(2.5, 10, 5, 6);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
    if (this.portal > 0.02) this.drawPortal(ctx, hue);
    ctx.restore();
    ctx.filter = 'none';
  }

  private drawPortal(ctx: CanvasRenderingContext2D, hue: number): void {
    const open = this.portal;
    const spin = this.tick * 0.18;
    ctx.save();
    ctx.translate(this.portalX, PORTAL_Y);
    ctx.scale(open, open);
    ctx.fillStyle = `hsla(${hue}, 100%, 58%, 0.4)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(7, 5, 18, 0.94)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `hsl(${hue}, 100%, 74%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 36, spin, 0, Math.PI * 1.35);
    ctx.stroke();
    ctx.strokeStyle = `hsl(${(hue + 48) % 360}, 100%, 70%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 36, -spin * 1.4, Math.PI, Math.PI * 2.2);
    ctx.stroke();
    ctx.restore();
  }
}

let cats: RayCat[] = [];
let loop = 0;
let hostEl: HTMLElement | null = null;
let sizeObs: ResizeObserver | null = null;

function viewWidthOf(host: HTMLElement): number {
  const width = host.clientWidth || window.innerWidth;
  return width > 0 ? width : 800;
}

function bindHost(host: HTMLElement): void {
  if (hostEl === host && sizeObs) return;
  sizeObs?.disconnect();
  hostEl = host;
  sizeObs = new ResizeObserver(() => {
    const width = host.clientWidth;
    if (width < 1) return;
    for (const cat of cats) cat.setBounds(width);
  });
  sizeObs.observe(host);
}

function liftLabel(chip: HTMLElement, host: HTMLElement, lifeMs: number): HTMLElement {
  const rect = chip.getBoundingClientRect();
  const ghost = chip.cloneNode(true) as HTMLElement;
  const cs = getComputedStyle(chip);
  ghost.classList.add('ray-label-ghost');
  ghost.style.position = 'fixed';
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = '0';
  ghost.style.color = cs.color;
  ghost.style.backgroundColor = cs.backgroundColor;
  ghost.style.font = cs.font;
  ghost.style.pointerEvents = 'none';
  host.appendChild(ghost);
  chip.classList.add('ray-label-gone');
  window.setTimeout(() => {
    ghost.remove();
    chip.classList.remove('ray-label-gone');
  }, lifeMs);
  return ghost;
}

export function rayCatBurnBranch(name: string): void {
  if (!cats.length || !hostEl) return;
  const chip = document.querySelector<HTMLElement>(`.row .chip[data-kind="head"][data-name="${CSS.escape(name)}"]`);
  let target: { x: number; y: number } | null = null;
  if (chip) {
    const rect = chip.getBoundingClientRect();
    if (rect.width > 2 && rect.height > 2) target = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  nearestCat(target?.x ?? cats[0]?.x ?? 0)?.fireLaser(target, target && chip ? chip : null);
}

export function rayCatCreateBranch(hash: string, name: string, checkout: boolean): void {
  const trimmed = name.trim();
  if (!hostEl || !trimmed || !hash) return;
  const anchor = birthAnchor(hash);
  nearestCat(anchor?.x ?? window.innerWidth / 2)?.birth({ kind: 'clone', hash, name: trimmed, chip: 'head', checkout });
}

export function rayCatAddTag(hash: string, name: string, roll = Math.random()): void {
  const trimmed = name.trim();
  if (!hostEl || !trimmed || !hash) return;
  const anchor = birthAnchor(hash);
  nearestCat(anchor?.x ?? window.innerWidth / 2)?.birth({
    kind: rayCatTagMotion(roll),
    hash,
    name: trimmed,
    chip: 'tag',
    checkout: false,
  });
}

export function rayCatRenameBranch(oldName: string, newName: string): void {
  const from = oldName.trim();
  const to = newName.trim();
  if (!hostEl || !from || !to || from === to) return;
  const at = chipCenter(namedChip('head', from));
  nearestCat(at?.x ?? window.innerWidth / 2)?.renameBranch(from, to);
}

export function rayCatPushBranch(name: string): void {
  const trimmed = name.trim();
  if (!hostEl || !trimmed) return;
  const at = chipCenter(namedChip('head', trimmed));
  nearestCat(at?.x ?? window.innerWidth / 2)?.pushBranch(at);
}

export function rayCatPull(name: string): void {
  const trimmed = name.trim();
  if (!hostEl || !trimmed) return;
  const at = chipCenter(namedChip('remote', trimmed) ?? namedChip('head', trimmed));
  nearestCat(at?.x ?? window.innerWidth / 2)?.pullBranch(at);
}

export function rayCatCherryPick(hash: string): void {
  if (!hostEl || !hash) return;
  const at = rowPoint(hash);
  nearestCat(at?.x ?? window.innerWidth / 2)?.cherryPick(hash);
}

export function rayCatDeleteTag(name: string): void {
  const trimmed = name.trim();
  if (!hostEl || !trimmed) return;
  const at = chipCenter(namedChip('tag', trimmed));
  nearestCat(at?.x ?? window.innerWidth / 2)?.deleteTag(trimmed);
}

function chipCenter(chip: HTMLElement | null): Point | null {
  return chip ? boxCenter(chip) : null;
}

function gitSettled(t0: number, now: number, state: { sawBusy: boolean; idleSince: number | null }): boolean {
  if (now - t0 > 60_000) return true;
  const busy = document.documentElement.classList.contains('git-busy');
  if (busy) {
    state.sawBusy = true;
    state.idleSince = null;
    return false;
  }
  if (!state.sawBusy && now - t0 < 800) return false;
  if (state.idleSince === null) state.idleSince = now;
  return now - state.idleSince >= 1100;
}

function pinGhost(chip: HTMLElement, host: HTMLElement): HTMLElement {
  const rect = chip.getBoundingClientRect();
  const ghost = chip.cloneNode(true) as HTMLElement;
  const cs = getComputedStyle(chip);
  ghost.classList.add('ray-label-ghost');
  ghost.classList.remove('ray-label-gone', 'ray-label-born');
  ghost.style.position = 'fixed';
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = '0';
  ghost.style.color = cs.color;
  ghost.style.backgroundColor = cs.backgroundColor;
  ghost.style.font = cs.font;
  ghost.style.pointerEvents = 'none';
  ghost.style.opacity = '0';
  ghost.style.zIndex = '4';
  host.append(ghost);
  return ghost;
}

function clearStage(): void {
  document.querySelectorAll('.ray-beam, .ray-spark, .ray-scorch, .ray-label-ghost, .ray-clone, .ray-birth, .ray-pill, .ray-bolt, .ray-orb').forEach((el) => el.remove());
  document.querySelectorAll('.ray-label-gone, .ray-label-born').forEach((el) => el.classList.remove('ray-label-gone', 'ray-label-born'));
}

function nearestCat(aimX: number): RayCat | null {
  let best: RayCat | null = null;
  let bestD = Infinity;
  for (const cat of cats) {
    const d = Math.abs(cat.x - aimX);
    if (d < bestD) {
      best = cat;
      bestD = d;
    }
  }
  return best;
}

function tick(ts: number): void {
  if (cats.length === 0) {
    loop = 0;
    return;
  }
  for (const cat of cats) cat.paint(ts);
  loop = requestAnimationFrame(tick);
}

export function syncRayCats(host: HTMLElement, enabled: boolean, count: number): void {
  const n = Math.max(1, Math.min(10, Math.round(count)));
  if (!enabled) {
    if (loop) cancelAnimationFrame(loop);
    loop = 0;
    sizeObs?.disconnect();
    sizeObs = null;
    clearStage();
    hostEl = null;
    for (const cat of cats) cat.dispose();
    cats = [];
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const width = viewWidthOf(host);
  while (cats.length > n) cats.pop()?.dispose();
  while (cats.length < n) cats.push(new RayCat(host, width));
  for (const cat of cats) cat.setBounds(width);
  bindHost(host);
  if (!loop) loop = requestAnimationFrame(tick);
}
