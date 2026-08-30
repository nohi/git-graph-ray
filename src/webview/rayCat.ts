type CatState = 'idle' | 'walk' | 'run' | 'jump' | 'sleep';

class RayCat {
  x: number;
  y: number;
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

  constructor(width: number, height: number) {
    this.x = 80 + Math.random() * Math.max(1, width - 160);
    this.y = height - 8;
    this.targetX = this.x;
    this.hueOffset = Math.random() * 360;
    this.scheduleNextAction(400, 2200);
  }

  dispose(): void {
    this.alive = false;
    if (this.actionTimer) clearTimeout(this.actionTimer);
  }

  resize(width: number, height: number): void {
    this.y = height - 8;
    this.x = Math.max(80, Math.min(width - 80, this.x));
    this.targetX = Math.max(80, Math.min(width - 80, this.targetX));
  }

  private setState(next: CatState): void {
    if (this.state === next) return;
    this.state = next;
    this.tick = 0;
  }

  private scheduleNextAction(minDelay: number, maxDelay: number): void {
    if (this.actionTimer) clearTimeout(this.actionTimer);
    this.actionTimer = setTimeout(() => this.decideNextAction(), minDelay + Math.random() * (maxDelay - minDelay));
  }

  private decideNextAction(): void {
    if (this.isJumping) return;
    const r = Math.random();
    const width = this.canvasWidth;
    if (this.state === 'sleep') {
      if (r < 0.3) {
        this.setState('idle');
        this.scheduleNextAction(1000, 3000);
      } else this.scheduleNextAction(2000, 4000);
      return;
    }
    if (r < 0.3) {
      this.targetX = Math.max(80, Math.min(width - 80, this.x + (Math.random() - 0.5) * 400));
      this.setState('walk');
    } else if (r < 0.5) {
      this.targetX = Math.max(80, Math.min(width - 80, this.x + (Math.random() - 0.5) * 800));
      this.setState('run');
    } else if (r < 0.6) this.performJump();
    else if (r < 0.8) {
      this.setState('sleep');
      this.scheduleNextAction(4000, 8000);
      return;
    } else {
      this.targetX = this.x;
      this.setState('idle');
    }
    this.scheduleNextAction(2000, 5000);
  }

  private canvasWidth = 800;

  setBounds(width: number): void {
    this.canvasWidth = width;
  }

  private performJump(): void {
    this.isJumping = true;
    this.setState('jump');
    const jumpDist = (Math.random() - 0.5) * 200;
    this.targetX = Math.max(80, Math.min(this.canvasWidth - 80, this.x + jumpDist));
    if (this.targetX !== this.x) this.dir = this.targetX > this.x ? 1 : -1;
    const jumpDuration = 40;
    let frame = 0;
    const startX = this.x;
    const jumpHeight = 80 + Math.random() * 40;
    const jumpLoop = () => {
      if (!this.alive) return;
      frame++;
      const progress = frame / jumpDuration;
      if (progress <= 1) {
        this.x = startX + (this.targetX - startX) * progress;
        this.jumpY = -Math.sin(progress * Math.PI) * jumpHeight;
        requestAnimationFrame(jumpLoop);
      } else {
        this.jumpY = 0;
        this.isJumping = false;
        this.setState('idle');
        this.decideNextAction();
      }
    };
    jumpLoop();
  }

  update(): void {
    this.tick++;
    if (this.isJumping || this.state === 'sleep' || this.state === 'idle') return;
    const dx = this.targetX - this.x;
    const dist = Math.abs(dx);
    if (dist > 5) {
      this.dir = dx > 0 ? 1 : -1;
      const speed = this.state === 'run' ? this.speedRun : this.speedWalk;
      this.x += (dx / dist) * speed;
    } else this.setState('idle');
  }

  draw(ctx: CanvasRenderingContext2D, timestamp: number): void {
    const hue = (timestamp * 0.1 + this.hueOffset) % 360;
    ctx.filter = `drop-shadow(0 0 10px hsl(${hue}, 100%, 60%)) drop-shadow(0 0 20px hsl(${hue}, 100%, 50%))`;
    ctx.save();
    ctx.translate(this.x, this.y + this.jumpY);
    ctx.scale(this.dir, 1);

    let legAngle1 = 0;
    let legAngle2 = 0;
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

    drawLeg(-15, -20, this.state === 'sleep' ? 1.5 : legAngle2, false);
    drawLeg(15, -20, this.state === 'sleep' ? 1.5 : legAngle1, false);
    drawEllipse(0, -25 + bodyY, 35, 22, 0, baseColor);
    drawLeg(-10, -15, this.state === 'sleep' ? 1.5 : legAngle1, true);
    drawLeg(20, -15, this.state === 'sleep' ? 1.5 : legAngle2, true);

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
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, 6);
    ctx.quadraticCurveTo(-2.5, 10, 0, 6.5);
    ctx.quadraticCurveTo(2.5, 10, 5, 6);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    ctx.filter = 'none';
  }
}

let cats: RayCat[] = [];
let loop = 0;
let canvasEl: HTMLCanvasElement | null = null;
let sizeObs: ResizeObserver | null = null;

function sizeCanvas(canvas: HTMLCanvasElement): void {
  const w = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || 240;
  canvas.width = Math.max(1, Math.floor(w));
  canvas.height = Math.max(1, Math.floor(h));
  for (const cat of cats) {
    cat.setBounds(canvas.width);
    cat.resize(canvas.width, canvas.height);
  }
}

function tick(ts: number): void {
  const canvas = canvasEl;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const cat of cats) {
    cat.update();
    cat.draw(ctx, ts);
  }
  loop = requestAnimationFrame(tick);
}

export function syncRayCats(canvas: HTMLCanvasElement, enabled: boolean, count: number): void {
  canvasEl = canvas;
  const n = Math.max(1, Math.min(10, Math.round(count)));
  if (!enabled) {
    canvas.hidden = true;
    for (const cat of cats) cat.dispose();
    cats = [];
    if (loop) cancelAnimationFrame(loop);
    loop = 0;
    sizeObs?.disconnect();
    sizeObs = null;
    return;
  }
  canvas.hidden = false;
  sizeCanvas(canvas);
  while (cats.length > n) cats.pop()?.dispose();
  while (cats.length < n) {
    const cat = new RayCat(canvas.width, canvas.height);
    cat.setBounds(canvas.width);
    cats.push(cat);
  }
  if (!sizeObs) {
    sizeObs = new ResizeObserver(() => sizeCanvas(canvas));
    sizeObs.observe(canvas);
  }
  if (!loop) loop = requestAnimationFrame(tick);
}
