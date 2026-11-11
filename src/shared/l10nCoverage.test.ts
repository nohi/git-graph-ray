import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE_PATH = join(ROOT, 'l10n', 'bundle.l10n.ja.json');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

function unescape(key: string): string {
  return key.replace(/\\(.)/g, '$1');
}

/** Literal first arguments of t('...') / l10n.t('...') / vscode.l10n.t('...'). */
export function extractTKeys(source: string): string[] {
  const keys: string[] = [];
  const re = /(?:(?<![\w$.\\])t\(|l10n\.t\()\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const raw = m[1]!;
    keys.push(unescape(raw.slice(1, -1)));
  }
  return keys;
}

/** Files whose t() calls are intentionally dynamic (keys come from elsewhere). */
const DYNAMIC_ALLOWLIST = new Set(['src/webview/l10n.ts']);

/** Non-literal t() calls that the extractor cannot cover. */
export function extractDynamicTCalls(source: string): string[] {
  const found: string[] = [];
  const re = /(?:(?<![\w$.\\])t\(|l10n\.t\()\s*(?![\s'"])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const line = source.slice(0, m.index).split('\n').length;
    found.push(`line ${line}: ${source.slice(m.index, m.index + 40).split('\n')[0]}`);
  }
  return found;
}

/** Keys from data-i18n attributes in the host-rendered shell (src/host/editor/html.ts). */
export function extractShellKeys(source: string): string[] {
  const keys: string[] = [];
  // data-i18n="explicit" (also -title/-aria-label/-placeholder variants)
  for (const m of source.matchAll(/data-i18n(?:-(?:title|aria-label|placeholder))="([^"]+)"/g)) keys.push(m[1]!);
  // <tag data-i18n>...Text...</tag> — the direct text is the key (nested elements hold no key text,
  // except <select>, whose options are stripped first)
  for (const m of source.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)[^<>]*?\bdata-i18n(?!-)[^<>]*>([\s\S]*?)<\/\1>/g)) {
    const text = m[2]!
      .replace(/<select\b[\s\S]*?<\/select>/g, '')
      .replace(/<[^<>]*>/g, '')
      .trim()
      .replace(/\s+/g, ' ');
    if (text) keys.push(text);
  }
  // title="Text" ... data-i18n-title (also aria-label/placeholder, paired by attribute name)
  for (const m of source.matchAll(/(title|aria-label|placeholder)="([^"]+)"[^<>]*?data-i18n-\1/g)) {
    keys.push(m[2]!);
  }
  return keys.filter((key) => key.length > 0);
}

function collectKeys(): { used: Map<string, string[]>; dynamic: string[] } {
  const used = new Map<string, string[]>();
  const dynamic: string[] = [];
  const add = (key: string, where: string) => {
    const list = used.get(key) ?? [];
    if (!list.includes(where)) list.push(where);
    used.set(key, list);
  };
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const source = readFileSync(file, 'utf8');
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    for (const key of extractTKeys(source)) add(key, rel);
    if (!DYNAMIC_ALLOWLIST.has(rel)) for (const hit of extractDynamicTCalls(source)) dynamic.push(`${rel} ${hit}`);
  }
  const shell = readFileSync(join(ROOT, 'src', 'host', 'editor', 'html.ts'), 'utf8');
  for (const key of extractShellKeys(shell)) add(key, 'src/host/editor/html.ts#shell');
  return { used, dynamic };
}

describe('l10n bundle coverage', () => {
  it('covers every localized key with a Japanese translation and no orphan entries', () => {
    const { used, dynamic } = collectKeys();
    if (process.env.L10N_DUMP) {
      const rows = [...used.entries()].map(([key, where]) => ({ key, where }));
      writeFileSync(join(process.env.TEMP ?? '/tmp', 'l10n-keys.json'), JSON.stringify(rows, null, 2));
    }
    expect(dynamic).toEqual([]);
    const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8')) as Record<string, string>;
    const missing = [...used.keys()].filter((key) => !(key in bundle));
    expect(missing).toEqual([]);
    const orphan = Object.keys(bundle).filter((key) => !used.has(key));
    expect(orphan).toEqual([]);
  });
});
