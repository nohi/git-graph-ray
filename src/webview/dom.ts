import { t } from '@vscode/l10n';
import { refDisplayName } from '../shared/refsList';
import type { GraphRef } from '../shared/types';
import { state } from './state';

export type El = HTMLElement & HTMLInputElement & HTMLSelectElement & { showPopover?: () => void; hidePopover?: () => void };

export const $ = (id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as El;
};

export function detailsAnchor(): string | null {
  return state.compareAnchor ?? state.compare ?? state.selected;
}

export function clearCompare(): void {
  state.compare = undefined;
  state.compareAnchor = undefined;
  state.compareLeftName = undefined;
  state.compareRightName = undefined;
}

export function namedBranch(ref: GraphRef | null): string | undefined {
  if (!ref || (ref.kind !== 'head' && ref.kind !== 'remote')) return undefined;
  if (ref.name === 'HEAD' || ref.name.startsWith('glob:')) return undefined;
  return refDisplayName(ref);
}

export function statusTitle(st: string): string {
  const known: Record<string, string> = {
    A: t('Added'),
    M: t('Modified'),
    D: t('Deleted'),
    R: t('Renamed'),
    C: t('Copied'),
    U: t('Untracked'),
    T: t('Type change'),
  };
  return known[st] ?? st;
}

export function joinRepoPath(rel: string): string {
  const root = state.snap?.repoPath ?? '';
  if (!root) return rel;
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${sep}${rel.replaceAll('\\', '/').replaceAll('/', sep)}`;
}

export function eventElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

export function summaryFolder(target: EventTarget | null): HTMLDetailsElement | null {
  const folder = eventElement(target)?.closest('summary')?.closest('details.scm-folder');
  return folder instanceof HTMLDetailsElement ? folder : null;
}

export function treeFolder(target: EventTarget | null): HTMLDetailsElement | null {
  const folder = eventElement(target)?.closest('details.scm-folder');
  return folder instanceof HTMLDetailsElement ? folder : null;
}

export function macPlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

export function esc(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
}

export function syncGraphClip(): void {
  const cell = document.querySelector('#head .h.graph');
  const clip = document.getElementById('g-clip');
  if (!(cell instanceof HTMLElement) || !(clip instanceof HTMLElement)) return;
  const w = Math.max(0, Math.round(cell.getBoundingClientRect().width));
  document.documentElement.style.setProperty('--g-clip', `${w}px`);
  clip.style.width = `${w}px`;
}

export function syncHeaderScroll(): void {
  const scroll = $('scroll');
  const clip = $('cols-clip');
  clip.style.width = `${scroll.clientWidth}px`;
  $('head').style.transform = scroll.scrollLeft ? `translateX(${-scroll.scrollLeft}px)` : '';
}

export function setColWidth(key: string, px: number): void {
  const w = Math.max(48, px);
  document.documentElement.style.setProperty(key, `${w}px`);
  if (key === '--d') document.documentElement.style.setProperty('--d-min', `${w}px`);
  if (key === '--g') state.userG = w;
  state.columnWidths[key] = w;
  syncHeaderScroll();
  syncGraphClip();
}

export function vis(cat: string, id: string): boolean {
  return state.snap?.menuVisibility[cat]?.[id] !== false;
}

export function clickPoint(ev: Event): { x: number; y: number } {
  const m = ev as MouseEvent;
  if (Number.isFinite(m.clientX) && Number.isFinite(m.clientY)) return { x: m.clientX, y: m.clientY };
  return { x: 16, y: 16 };
}

export function showCopiedToast(x: number, y: number): void {
  document.querySelectorAll('.copied-toast').forEach((n) => n.remove());
  const tip = document.createElement('div');
  tip.className = 'copied-toast';
  tip.textContent = t('Copied');
  document.body.append(tip);
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  tip.style.left = `${Math.max(4, Math.min(x - w / 2, window.innerWidth - w - 4))}px`;
  tip.style.top = `${Math.max(4, y - h - 8)}px`;
  window.setTimeout(() => tip.remove(), 2000);
}

export function findPressed(id: string): boolean {
  return $(id).getAttribute('aria-pressed') === 'true';
}

export function btn(id: string, label: string): string {
  return `<button type="button" data-act="${id}">${label}</button>`;
}

export function val(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement).checked;
}
