import { describe, expect, it } from 'vitest';
import { beamPose, catGesture, catMouthPoint, laserAim, rayCatFrame, rayCatHue, rayCatTransform } from './rayCat';

describe('rayCatFrame', () => {
  it('keeps the paws 8px above the viewport and leaves glow room under them', () => {
    expect(rayCatFrame.footInset).toBe(8);
    expect(rayCatFrame.bottom).toBeLessThan(0);
    expect(rayCatFrame.height - rayCatFrame.originY).toBeGreaterThanOrEqual(56);
  });

  it('is wide enough for both facings and the drop-shadow', () => {
    expect(rayCatFrame.width).toBe(rayCatFrame.originX * 2);
    expect(rayCatFrame.originX).toBeGreaterThanOrEqual(80 + 56);
    expect(rayCatFrame.originY).toBeGreaterThanOrEqual(80 + 56);
    expect(rayCatFrame.width).toBeLessThan(400);
    expect(rayCatFrame.height).toBeLessThan(240);
  });

  it('moves the canvas with world x and jump height', () => {
    expect(rayCatTransform(400, 0)).toBe(`translate3d(${400 - rayCatFrame.originX}px, 0px, 0)`);
    expect(rayCatTransform(180, -96)).toBe(`translate3d(${180 - rayCatFrame.originX}px, -96px, 0)`);
  });

  it('puts the open mouth in front of the paws', () => {
    const right = catMouthPoint(200, 0, 1, 1000, 0);
    expect(right.x).toBeCloseTo(225);
    expect(right.y).toBeCloseTo(965);
    expect(catMouthPoint(200, 0, -1, 1000, 0).x).toBeCloseTo(175);
  });

  it('keeps a shallow laser on the head', () => {
    const aim = laserAim(0, 0, 100, -96);
    expect(Math.abs(Math.atan2(-96, 100))).toBeLessThan(Math.PI / 4);
    expect(aim.sit).toBe(false);
    expect(aim.body).toBe(0);
    expect(aim.head).toBeCloseTo(Math.atan2(-96, 100));
    expect(Math.abs(aim.head)).toBeLessThan(Math.PI / 4);
  });

  it('sits and leans the body when the laser is 45 degrees or steeper', () => {
    const edge = laserAim(0, 0, 100, -100);
    expect(edge.sit).toBe(true);
    expect(edge.head).toBe(0);
    expect(edge.body).toBeCloseTo(-Math.PI / 4);
    const steep = laserAim(100, 900, 180, 400);
    expect(steep.sit).toBe(true);
    expect(steep.head).toBe(0);
    expect(steep.body).toBeLessThan(-Math.PI / 4);
    expect(laserAim(100, 900, 20, 400).body).toBeCloseTo(steep.body);
  });

  it('raises the mouth when the body leans up', () => {
    const level = catMouthPoint(200, 0, 1, 1000);
    const leaned = catMouthPoint(200, 0, 1, 1000, 0, -Math.PI / 3, 10);
    expect(leaned.y).toBeLessThan(level.y);
    const leftLevel = catMouthPoint(200, 0, -1, 1000);
    const left = catMouthPoint(200, 0, -1, 1000, 0, -Math.PI / 3, 10);
    expect(left.y).toBeLessThan(leftLevel.y);
  });

  it('raises one hind leg to scratch and one foreleg to wave', () => {
    const scratch = catGesture('scratch', 48);
    expect(scratch.backR).toBeLessThan(-1.5);
    expect(scratch.backL).toBeGreaterThan(0);
    expect(scratch.backL).toBeLessThan(0.6);
    expect(scratch.frontL).toBeCloseTo(0.7);
    expect(scratch.frontR).toBeCloseTo(0.55);
    expect(scratch.eye).toBeGreaterThan(0.5);
    const paw = catGesture('paw', 68);
    expect(paw.frontL).toBeLessThan(-1.6);
    expect(paw.frontR).toBeGreaterThan(1);
    expect(paw.backL).toBeCloseTo(1.15);
    expect(paw.eye).toBe(1);
  });

  it('uses the same hue cycle as the cat glow', () => {
    expect(rayCatHue(1000, 20)).toBeCloseTo(120);
    expect(rayCatHue(4000, 10)).toBeCloseTo(50);
    expect(rayCatHue(3600, 0)).toBeCloseTo(0);
  });

  it('aims a beam from the mouth to the label', () => {
    const pose = beamPose({ x: 10, y: 10 }, { x: 40, y: 50 });
    expect(pose.length).toBeCloseTo(50);
    expect(pose.angle).toBeCloseTo(Math.atan2(40, 30));
  });
});
