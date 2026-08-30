import type { GraphRef } from '../../shared/types';
import { gitMaybe, gitOk } from './runner';

export async function loadRefs(git: string, cwd: string, showRemoteHeads: boolean): Promise<{
  refs: GraphRef[];
  branches: string[];
  head: string | null;
  currentBranch: string | null;
}> {
  const stdout = await gitOk(git, cwd, ['show-ref', '--head', '--dereference']).catch(async () => gitMaybe(git, cwd, ['show-ref', '--head']));
  const refs: GraphRef[] = [];
  const branches: string[] = [];
  let head: string | null = null;
  let currentBranch: string | null = null;

  for (const line of stdout.split(/\r?\n/)) {
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const hash = line.slice(0, sp);
    const name = line.slice(sp + 1);
    if (name === 'HEAD') {
      head = hash;
      continue;
    }
    if (name.startsWith('refs/heads/')) {
      const b = name.slice('refs/heads/'.length);
      refs.push({ kind: 'head', name: b, hash });
      branches.push(b);
    } else if (name.startsWith('refs/remotes/')) {
      const rest = name.slice('refs/remotes/'.length);
      if (!showRemoteHeads && rest.endsWith('/HEAD')) continue;
      const slash = rest.indexOf('/');
      refs.push({
        kind: 'remote',
        name: rest,
        hash,
        remote: slash >= 0 ? rest.slice(0, slash) : rest,
      });
    } else if (name.startsWith('refs/tags/')) {
      const tag = name.replace(/\^\{\}$/, '').slice('refs/tags/'.length);
      refs.push({ kind: 'tag', name: tag, hash });
    }
  }

  try {
    const sym = (await gitOk(git, cwd, ['symbolic-ref', '-q', 'HEAD'])).trim();
    if (sym.startsWith('refs/heads/')) currentBranch = sym.slice('refs/heads/'.length);
  } catch {
    currentBranch = null;
  }
  if (!head) {
    try {
      head = (await gitOk(git, cwd, ['rev-parse', 'HEAD'])).trim();
    } catch {
      head = null;
    }
  }
  if (!currentBranch && head) refs.push({ kind: 'head', name: 'HEAD', hash: head });

  try {
    const stash = await gitOk(git, cwd, ['stash', 'list', '--format=%H %gd %gs']);
    for (const line of stash.split(/\r?\n/)) {
      const m = line.match(/^(\S+)\s+(\S+)\s+(.*)$/);
      if (!m) continue;
      refs.push({ kind: 'stash', name: `${m[2]} ${m[3]}`.trim(), hash: m[1]! });
    }
  } catch {
    /* no stash */
  }

  return { refs, branches: [...new Set(branches)].sort(), head, currentBranch };
}
