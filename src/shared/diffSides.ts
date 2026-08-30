import { UNCOMMITTED } from './types';

export function shortRevLabel(hash: string): string {
  if (hash === UNCOMMITTED || hash === '') return 'worktree';
  if (hash === 'HEAD') return 'HEAD';
  if (hash.endsWith('^')) return `${hash.replace(/\^+$/, '').slice(0, 7)}^`;
  return hash.slice(0, 7);
}

export function blobSpec(hash: string, filePath: string): string {
  if (hash === UNCOMMITTED || hash === '') return `:${filePath}`;
  return `${hash}:${filePath}`;
}

export function diffDocumentPath(revLabel: string, filePath: string): string {
  const posix = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `/${revLabel}/${posix}`;
}

export function diffEditorSides(opts: {
  hash: string;
  compare?: string;
  path: string;
  oldPath?: string;
  parent?: string;
}): { leftSpec: string; rightSpec: string; leftLabel: string; rightLabel: string; leftPath: string; rightPath: string; title: string } {
  const file = opts.path;
  const old = opts.oldPath ?? file;
  const base = file.split(/[\\/]/).pop() ?? file;
  if (opts.compare) {
    const leftLabel = shortRevLabel(opts.hash);
    const rightLabel = shortRevLabel(opts.compare);
    return {
      leftSpec: blobSpec(opts.hash, old),
      rightSpec: blobSpec(opts.compare, file),
      leftLabel,
      rightLabel,
      leftPath: old,
      rightPath: file,
      title: `${base} (${leftLabel} ↔ ${rightLabel})`,
    };
  }
  if (opts.hash === UNCOMMITTED) {
    return {
      leftSpec: `HEAD:${old}`,
      rightSpec: `:${file}`,
      leftLabel: 'HEAD',
      rightLabel: 'worktree',
      leftPath: old,
      rightPath: file,
      title: `${base} (HEAD ↔ worktree)`,
    };
  }
  const leftHash = opts.parent ?? `${opts.hash}^`;
  const leftLabel = opts.parent ? shortRevLabel(opts.parent) : `${opts.hash.slice(0, 7)}^`;
  const rightLabel = shortRevLabel(opts.hash);
  return {
    leftSpec: `${leftHash}:${old}`,
    rightSpec: `${opts.hash}:${file}`,
    leftLabel,
    rightLabel,
    leftPath: old,
    rightPath: file,
    title: `${base} (${leftLabel} ↔ ${rightLabel})`,
  };
}
