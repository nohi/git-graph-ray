import { refDisplayName } from './refsList';
import type { GraphCommit } from './types';

export type FindFlags = {
  regex: boolean;
  ignoreCase: boolean;
};

export function compileFindRegex(pattern: string, ignoreCase: boolean): RegExp | null {
  try {
    return new RegExp(pattern, ignoreCase ? 'i' : '');
  } catch {
    return null;
  }
}

export function matchCommit(c: GraphCommit, query: string, flags: FindFlags): boolean {
  if (!query) return false;
  const fields = [c.subject, c.authorName, c.hash, ...c.refs.map((r) => `${r.name} ${refDisplayName(r)}`)];
  if (!flags.regex) {
    const needle = flags.ignoreCase ? query.toLowerCase() : query;
    return fields.some((f) => (flags.ignoreCase ? f.toLowerCase() : f).includes(needle));
  }
  const re = compileFindRegex(query, flags.ignoreCase);
  if (!re) return false;
  return fields.some((f) => re.test(f));
}

export function formatFindCount(index: number, total: number, queried = true): string {
  if (!queried) return '0/-';
  if (total <= 0) return '0/0';
  return `${index}/${total}`;
}

function escapeFind(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function highlightFind(text: string, query: string, flags: FindFlags): string {
  if (!query) return escapeFind(text);
  if (!flags.regex) {
    const src = flags.ignoreCase ? text.toLowerCase() : text;
    const needle = flags.ignoreCase ? query.toLowerCase() : query;
    if (!needle) return escapeFind(text);
    let out = '';
    let from = 0;
    while (from < text.length) {
      const i = src.indexOf(needle, from);
      if (i < 0) break;
      out += escapeFind(text.slice(from, i));
      out += `<mark class="find-hit">${escapeFind(text.slice(i, i + needle.length))}</mark>`;
      from = i + needle.length;
    }
    return out + escapeFind(text.slice(from));
  }
  const compiled = compileFindRegex(query, flags.ignoreCase);
  if (!compiled) return escapeFind(text);
  const re = new RegExp(compiled.source, flags.ignoreCase ? 'gi' : 'g');
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (!m[0]) continue;
    const idx = m.index ?? 0;
    out += escapeFind(text.slice(last, idx));
    out += `<mark class="find-hit">${escapeFind(m[0])}</mark>`;
    last = idx + m[0].length;
  }
  return out + escapeFind(text.slice(last));
}
