import { config, t } from '@vscode/l10n';

/** Configure @vscode/l10n from the bundle the host embedded, then translate the static shell once. */
export function initL10n(): void {
  const bundleEl = document.getElementById('gg-l10n');
  const raw = bundleEl?.textContent;
  if (raw && raw.trim()) {
    try {
      config({ contents: raw });
    } catch {
      // Fall through to source English.
    }
  }
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const node = singleTextNode(el);
    const key = el.getAttribute('data-i18n') || node?.data.trim();
    if (key && node) node.data = node.data.replace(key, t(key));
  }
  const attrs: [string, string][] = [
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-placeholder', 'placeholder'],
  ];
  for (const [mark, prop] of attrs) {
    for (const el of document.querySelectorAll(`[${mark}]`)) {
      const key = el.getAttribute(mark) || el.getAttribute(prop);
      if (key) el.setAttribute(prop, t(key));
    }
  }
}

function singleTextNode(el: Element): Text | null {
  let found: Text | null = null;
  for (const child of el.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue;
    if (found) return null;
    found = child as Text;
  }
  return found;
}
