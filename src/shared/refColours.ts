import { escapeAttr } from './issueLinks';
import { remoteBranchName } from './refsList';

/** One `referenceLabels.colours` entry. Patterns are globs, in settings order. */
export type RefColourRule = {
  pattern: string;
  colour: string;
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const DEFAULT_LABEL_COLOUR = '#FF8888';

export type Hsv = { h: number; s: number; v: number };

export function normalizeHex(value: string): string | undefined {
  const hex = value.trim();
  return HEX.test(hex) ? hex : undefined;
}

/** Opaque `#rrggbb` for the saturation square. Short forms expand; alpha is dropped. */
export function opaqueHex(value: string): string | undefined {
  const hex = normalizeHex(value);
  if (!hex) return undefined;
  const body = hex.slice(1);
  const rgb = body.length <= 4 ? [...body.slice(0, 3)].map((ch) => ch + ch).join('') : body.slice(0, 6);
  return `#${rgb.toLowerCase()}`;
}

const compiled = new Map<string, RegExp>();

/**
 * Glob used for branch and tag label colours.
 * `*` is any text, including `/`, so `release*` matches `release/1.0`.
 * `?` is one character. `\*` and `\?` are literal.
 */
export function refColourGlob(pattern: string): RegExp {
  const cached = compiled.get(pattern);
  if (cached) return cached;
  let src = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '\\') {
      const next = pattern[i + 1];
      if (next) {
        src += escapeRegExp(next);
        i++;
        continue;
      }
    }
    if (ch === '*') {
      src += '.*';
      continue;
    }
    if (ch === '?') {
      src += '.';
      continue;
    }
    src += escapeRegExp(ch);
  }
  const re = new RegExp(`^${src}$`);
  compiled.set(pattern, re);
  return re;
}

export function parseRefColours(value: unknown): RefColourRule[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const rules: RefColourRule[] = [];
  for (const [key, colour] of Object.entries(value)) {
    const pattern = key.trim();
    if (!pattern || typeof colour !== 'string') continue;
    const hex = normalizeHex(colour);
    if (!hex) continue;
    rules.push({ pattern, colour: hex });
  }
  return rules;
}

/** Names a rule may match. Remotes include the branch, `origin/branch`, and `remotes/origin/branch`. */
export function refColourTargets(ref: { kind: string; name: string; remote?: string }): string[] {
  if (ref.name.startsWith('glob:')) return [];
  if (ref.kind === 'head' || ref.kind === 'tag') return [ref.name];
  if (ref.kind !== 'remote') return [];
  const stored = ref.name.startsWith('remotes/') ? ref.name.slice('remotes/'.length) : ref.name;
  const names = new Set<string>([ref.name, stored, `remotes/${stored}`]);
  const branch = remoteBranchName({ kind: 'remote', name: stored, hash: '', remote: ref.remote });
  if (branch) names.add(branch);
  return [...names];
}

/** First matching rule. Branches and tags only. */
export function refLabelColour(
  ref: { kind: string; name: string; remote?: string },
  rules: readonly RefColourRule[],
): string | undefined {
  const names = refColourTargets(ref);
  if (!names.length || !rules.length) return undefined;
  for (const rule of rules) {
    const re = refColourGlob(rule.pattern);
    if (names.some((name) => re.test(name))) return rule.colour;
  }
  return undefined;
}

function escapeRegExp(text: string): string {
  return text.replace(/[\\^$+*?.()|[\]{}]/g, '\\$&');
}

export function hexToHsv(value: string): Hsv | undefined {
  const opaque = opaqueHex(value);
  if (!opaque) return undefined;
  const r = Number.parseInt(opaque.slice(1, 3), 16) / 255;
  const g = Number.parseInt(opaque.slice(3, 5), 16) / 255;
  const b = Number.parseInt(opaque.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex(hsv: Hsv): string {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clamp01(hsv.s);
  const v = clamp01(hsv.v);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const byte = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${byte(rp)}${byte(gp)}${byte(bp)}`;
}

/** Update a pattern in place, or insert a new one first so it wins over broader rules. */
export function upsertRefColour(rules: readonly RefColourRule[], pattern: string, colour: string): RefColourRule[] | undefined {
  const key = pattern.trim();
  const hex = normalizeHex(colour);
  if (!key || !hex) return undefined;
  const index = rules.findIndex((rule) => rule.pattern === key);
  if (index >= 0) return rules.map((rule, i) => (i === index ? { pattern: key, colour: hex } : rule));
  return [{ pattern: key, colour: hex }, ...rules];
}

export function removeRefColour(rules: readonly RefColourRule[], pattern: string): RefColourRule[] {
  const key = pattern.trim();
  return rules.filter((rule) => rule.pattern !== key);
}

export function refColoursToSetting(rules: readonly RefColourRule[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) out[rule.pattern] = rule.colour;
  return out;
}

export interface LabelColourInspect {
  defaultValue?: unknown;
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
}

/** Folder, then workspace, then user. Extension state is used only when none of those is set. */
export function labelColourSettingValue(inspected: LabelColourInspect | undefined, stored: unknown): unknown {
  if (inspected?.workspaceFolderValue !== undefined) return inspected.workspaceFolderValue;
  if (inspected?.workspaceValue !== undefined) return inspected.workspaceValue;
  if (inspected?.globalValue !== undefined) return inspected.globalValue;
  if (stored !== undefined) return stored;
  return inspected?.defaultValue;
}

export function isUnregisteredConfigurationMessage(message: string): boolean {
  return message.includes('not a registered configuration');
}

export function labelColourDialogHtml(opts: { pattern: string; colour: string }): string {
  const colour = normalizeHex(opts.colour) ?? DEFAULT_LABEL_COLOUR;
  return `<label class="dlg-field"><span class="lc-label">Pattern<button type="button" id="lc-help" class="lc-help" aria-label="About patterns" aria-expanded="false">?</button></span><input id="lc-pattern" spellcheck="false" autocomplete="off" value="${escapeAttr(opts.pattern)}" /></label>
<div id="lc-tip" popover="manual" class="pop lc-tip" role="tooltip">The name you clicked is filled in. Edit it to widen the match, for example feature/hoge to feature/*. * matches any text, including /. The first matching pattern wins.</div>
<div class="lc-picker">
  <div class="lc-sv" id="lc-sv" aria-hidden="true"><div class="lc-sv-white"></div><div class="lc-sv-black"></div><div class="lc-knob" id="lc-knob"></div></div>
  <input type="range" class="lc-hue" id="lc-hue" min="0" max="360" step="1" aria-label="Hue" />
  <label class="lc-hex-row">Hex<span class="lc-swatch" id="lc-swatch"></span><input id="lc-hex" spellcheck="false" autocomplete="off" maxlength="9" value="${escapeAttr(colour)}" /></label>
</div>
<button type="button" id="lc-remove" title="Remove the colour saved for this pattern">Remove colour</button>`;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
