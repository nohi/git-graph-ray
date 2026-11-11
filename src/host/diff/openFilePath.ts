import { promises as fs } from 'node:fs';
import { resolveRepoRelative } from '../git/details';

/**
 * File in the working tree for a `git-graph-ray-file` document.
 * The document path is `/<revision label>/<file>`, so the first segment is dropped.
 * `full` is missing when the file would be outside the repository.
 */
export function workingFileFor(root: string, docPath: string): { rel: string; full?: string } | undefined {
  if (!root) return undefined;
  const parts = docPath.replace(/\\/g, '/').replace(/^\/+/, '').split('/');
  const rel = parts.slice(1).join('/');
  if (!rel) return undefined;
  const full = resolveRepoRelative(root, rel);
  return full ? { rel, full } : { rel };
}

export async function isFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}
