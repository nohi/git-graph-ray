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
  private aim = 0;
  private bodyTilt = 0;
  private sitAmount = 0;
  private mouth = 0;
  private warpScale = 1;
  private portal = 0;
  private portalX = PORTAL_X;
  private fx: HTMLElement[] = [];
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
    this.scripted = false;
    this.warpScale = 1;
    this.portal = 0;
    this.portalX = PORTAL_X;
    this.mouth = 0;
    this.aim = 0;
    this.bodyTilt = 0;
    this.sitAmount = 0;
    this.clearFx();
    this.setState('idle');
    this.scheduleNextAction(600, 1800);
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
    const gesture = this.state === 'scratch' || this.state === 'paw' ? catGesture(this.state, this.tick) : null;
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
  const aimX = target?.x ?? cats[0]!.x;
  let best = cats[0]!;
  let bestD = Infinity;
  for (const cat of cats) {
    const d = Math.abs(cat.x - aimX);
    if (d < bestD) {
      best = cat;
      bestD = d;
    }
  }
  best.fireLaser(target, target && chip ? chip : null);
}

function clearStage(): void {
  document.querySelectorAll('.ray-beam, .ray-spark, .ray-scorch, .ray-label-ghost').forEach((el) => el.remove());
  document.querySelectorAll('.ray-label-gone').forEach((el) => el.classList.remove('ray-label-gone'));
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
