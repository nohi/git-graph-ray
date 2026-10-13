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

export function matchFindText(fields: string[], query: string, flags: FindFlags): boolean {
  if (!query) return false;
  if (!flags.regex) {
    const needle = flags.ignoreCase ? query.toLowerCase() : query;
    return fields.some((f) => (flags.ignoreCase ? f.toLowerCase() : f).includes(needle));
  }
  const re = compileFindRegex(query, flags.ignoreCase);
  if (!re) return false;
  return fields.some((f) => re.test(f));
}

export function matchCommit(c: GraphCommit, query: string, flags: FindFlags): boolean {
  return matchFindText([c.subject, c.authorName, c.hash, ...c.refs.map((r) => `${r.name} ${refDisplayName(r)}`)], query, flags);
}

export const FIND_SCAN_CAP = 50_000;
export const FIND_MATCH_CAP = 5000;

export type FindScanRow = { hash: string; authorName: string; subject: string; index: number };

const FIND_RS = '\u001e';
const FIND_US = '\u001f';

export function parseFindScan(stdout: string): FindScanRow[] {
  const records = stdout.split(FIND_RS).map((part) => part.replace(/^\n/, '')).filter((part) => part.length > 0);
  const rows: FindScanRow[] = [];
  for (const record of records) {
    const [hash, authorName, subject] = record.split(FIND_US);
    if (!hash || !/^[0-9a-f]{40}$/i.test(hash)) continue;
    rows.push({
      hash,
      authorName: (authorName ?? '').trim(),
      subject: (subject ?? '').replace(/^\n+|\n+$/g, ''),
      index: rows.length,
    });
  }
  return rows;
}

/** Log order from the scan, then hashes the scan did not see. Caps the list and reports a cut-off. */
export function assembleFindHits(opts: {
  scanned: FindScanRow[];
  query: string;
  flags: FindFlags;
  extraHashes: string[];
  matchCap?: number;
  scanCap?: number;
}): { hashes: string[]; indexes: number[]; truncated: boolean } {
  const matchCap = opts.matchCap ?? FIND_MATCH_CAP;
  const scanCap = opts.scanCap ?? FIND_SCAN_CAP;
  const indexOf = new Map(opts.scanned.map((row) => [row.hash, row.index]));
  const matched = new Set<string>();
  for (const row of opts.scanned) {
    if (matchFindText([row.subject, row.authorName, row.hash], opts.query, opts.flags)) matched.add(row.hash);
  }
  for (const hash of opts.extraHashes) {
    if (/^[0-9a-f]{40}$/i.test(hash)) matched.add(hash);
  }
  const ordered = [...matched].sort((a, b) => {
    const ia = indexOf.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = indexOf.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const capped = ordered.slice(0, matchCap);
  return {
    hashes: capped,
    indexes: capped.map((hash) => indexOf.get(hash) ?? -1),
    truncated: ordered.length > matchCap || opts.scanned.length > scanCap,
  };
}

/** Keep `git log -G` order and attach positions from a hash-only scan. */
export function indexFindHashes(
  order: string[],
  hashes: string[],
  scanCap = FIND_SCAN_CAP,
  matchCap = FIND_MATCH_CAP,
): { hashes: string[]; indexes: number[]; truncated: boolean } {
  const indexOf = new Map<string, number>();
  order.forEach((hash, index) => {
    if (!indexOf.has(hash)) indexOf.set(hash, index);
  });
  const capped = hashes.slice(0, matchCap);
  return {
    hashes: capped,
    indexes: capped.map((hash) => indexOf.get(hash) ?? -1),
    truncated: hashes.length > matchCap || order.length > scanCap || capped.some((hash) => !indexOf.has(hash)),
  };
}

export function formatFindCount(index: number, total: number, queried = true, truncated = false): string {
  if (!queried) return '0/-';
  if (total <= 0) return '0/0';
  return `${index}/${total}${truncated ? '+' : ''}`;
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
