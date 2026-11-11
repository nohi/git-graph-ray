import { DETAILS_FILES_MIN, DETAILS_META_DEFAULT, draggedDetailsMeta, fittedDetailsMeta } from '../shared/detailsPane';
import { DETAILS_MAX, DETAILS_MIN, ROW } from '../shared/graph';
import { persistView, state } from './state';
import { $, setColWidth } from './dom';
import { currentDetailsHeight, detailsGap, estimateFromDetails, paint, scheduleFitDetails, shownCommits } from './paint';

export const COL_VAR: Record<string, string> = {
  graph: '--g',
  desc: '--d',
  author: '--a',
  adate: '--ad',
  commit: '--c',
  committer: '--cm',
  cdate: '--cd',
  signature: '--sig',
};

export function bindColResize(): void {
  const head = $('head');
  head.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const handle = (ev.target as HTMLElement).closest<HTMLElement>('.col-resizer');
    if (!handle) return;
    const cls = handle.dataset.col;
    if (!cls || !COL_VAR[cls]) return;
    ev.preventDefault();
    const key = COL_VAR[cls]!;
    const col = handle.parentElement as HTMLElement;
    const startX = ev.clientX;
    const startW = col.getBoundingClientRect().width;
    handle.setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent) => {
      setColWidth(key, startW + (e.clientX - startX));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      const raw = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
      const width = Number.parseFloat(raw);
      if (Number.isFinite(width)) state.columnWidths[key] = width;
      persistView();
      if (key === '--g') paint();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  head.addEventListener('dblclick', (ev) => {
    const handle = (ev.target as HTMLElement).closest<HTMLElement>('.col-resizer');
    if (!handle) return;
    ev.preventDefault();
    autosizeColumn(handle.dataset.col ?? '');
  });
}

export function autosizeColumn(cls: string): void {
  const key = COL_VAR[cls];
  if (!key) return;
  if (cls === 'graph') {
    setColWidth(key, $('svg').getBoundingClientRect().width + 8);
    persistView();
    paint();
    return;
  }
  const headCell = document.querySelector(`#head .h.${cls}`) as HTMLElement | null;
  let max = headCell ? Math.ceil(headCell.scrollWidth) : 48;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;left:-9999px;top:0;width:max-content;overflow:visible;white-space:nowrap;display:flex;align-items:center;visibility:hidden;';
  document.body.append(probe);
  for (const cell of document.querySelectorAll<HTMLElement>(`#rows .cell.${cls}`)) {
    probe.innerHTML = cell.innerHTML;
    const style = getComputedStyle(cell);
    probe.style.font = style.font;
    probe.style.padding = style.padding;
    probe.style.gap = style.gap;
    max = Math.max(max, Math.ceil(probe.scrollWidth));
  }
  probe.remove();
  setColWidth(key, max + 8);
  persistView();
}

export function intrinsicRowWidth(row: HTMLElement): number {
  const probe = row.cloneNode(true) as HTMLElement;
  probe.style.cssText =
    'position:fixed;left:0;top:0;visibility:hidden;display:flex;flex-wrap:nowrap;width:max-content;max-width:none;white-space:nowrap;';
  document.body.append(probe);
  for (const el of probe.querySelectorAll<HTMLElement>('.meta-main, .meta-value')) {
    el.style.whiteSpace = 'nowrap';
    el.style.overflow = 'visible';
    el.style.textOverflow = 'clip';
    el.style.flex = '0 0 auto';
    el.style.width = 'max-content';
    el.style.minWidth = 'max-content';
    el.style.maxWidth = 'none';
  }
  const main = probe.querySelector<HTMLElement>('.meta-main');
  if (main) main.style.flexWrap = 'nowrap';
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

export function measureMetaContent(meta: HTMLElement): number {
  const style = getComputedStyle(meta);
  const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const border = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
  const table = meta.querySelector('.meta-table');
  if (!table) return 0;
  let widest = 0;
  for (const row of table.querySelectorAll<HTMLElement>('.meta-row')) {
    widest = Math.max(widest, intrinsicRowWidth(row));
  }
  return widest + pad + border;
}

export function fitDetailsMeta(): void {
  const meta = document.querySelector<HTMLElement>('.details-body .meta');
  if (!meta) return;
  const screen = document.documentElement.clientWidth;
  const w = fittedDetailsMeta(measureMetaContent(meta), screen);
  document.documentElement.style.setProperty('--details-meta', `${w}px`);
}

export function detailsMax(): number {
  const sc = document.getElementById('scroll');
  const cap = sc ? Math.floor(sc.clientHeight * 0.85) : DETAILS_MAX;
  return Math.max(DETAILS_MIN, cap);
}

export function bindSashes(): void {
  document.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const t = ev.target as HTMLElement;
    const sashX = t.closest?.('#sash-x') as HTMLElement | null;
    const sashY = t.closest?.('#sash-y') as HTMLElement | null;
    if (sashX) {
      ev.preventDefault();
      const startX = ev.clientX;
      const meta = document.querySelector('.details-body .meta');
      const startW = meta?.getBoundingClientRect().width ?? DETAILS_META_DEFAULT;
      const detailsBody = sashX.closest('.details-body');
      sashX.setPointerCapture(ev.pointerId);
      const move = (e: PointerEvent) => {
        const sashW = sashX.getBoundingClientRect().width || 4;
        const detailsW = detailsBody?.getBoundingClientRect().width ?? startW + sashW + DETAILS_FILES_MIN;
        const w = draggedDetailsMeta(startW + (e.clientX - startX), detailsW, sashW);
        document.documentElement.style.setProperty('--details-meta', `${w}px`);
      };
      const up = () => {
        sashX.removeEventListener('pointermove', move);
        sashX.removeEventListener('pointerup', up);
      };
      sashX.addEventListener('pointermove', move);
      sashX.addEventListener('pointerup', up);
    }
    if (sashY) {
      ev.preventDefault();
      const invert = sashY.dataset.dir === 'up';
      const startY = ev.clientY;
      const startH = currentDetailsHeight();
      sashY.setPointerCapture(ev.pointerId);
      const move = (e: PointerEvent) => {
        const delta = e.clientY - startY;
        state.detailsH = Math.max(DETAILS_MIN, Math.min(detailsMax(), startH + (invert ? -delta : delta)));
        const inline = document.getElementById('inline-details');
        if (inline && !inline.hidden) {
          inline.style.height = `${state.detailsH}px`;
          if (state.snap) {
            const rows = shownCommits();
            const gap = detailsGap(rows);
            $('spacer').style.height = `${rows.length * ROW + (gap ? gap.height : 0)}px`;
          }
        }
        const dock = document.getElementById('dock');
        if (dock && !dock.hidden) dock.style.height = `${state.detailsH}px`;
      };
      const up = () => {
        sashY.removeEventListener('pointermove', move);
        sashY.removeEventListener('pointerup', up);
        paint();
      };
      sashY.addEventListener('pointermove', move);
      sashY.addEventListener('pointerup', up);
    }
  });
  document.addEventListener('dblclick', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest?.('#sash-x')) fitDetailsMeta();
    if (t.closest?.('#sash-y')) {
      state.detailsH = null;
      if (state.details) state.autoDetailsH = estimateFromDetails(state.details);
      paint();
      scheduleFitDetails();
    }
  });
}
