export type LogRevisionOptions = {
  branches: string[] | 'all';
  showRemote: boolean;
  showStashes: boolean;
  showTags: boolean;
  includeTagOnly: boolean;
  reflog: boolean;
  includeHead: boolean;
  /** Limit `git log` to this path. `follow` tracks renames of a single file. */
  path?: string;
  follow?: boolean;
  order?: 'date' | 'author-date' | 'topo';
};

export function logRevisionArgs(options: LogRevisionOptions): string[] {
  const args: string[] = [];
  if (options.order === 'author-date') args.push('--author-date-order');
  else if (options.order === 'topo') args.push('--topo-order');
  else if (options.order === 'date') args.push('--date-order');
  if (options.branches === 'all') {
    if (options.showRemote) args.push('--all');
    else {
      args.push('--branches');
      if (options.showTags && options.includeTagOnly) args.push('--tags');
      if (options.includeHead) args.push('HEAD');
    }
    if (options.showStashes) args.push('--glob=refs/stash');
    if (options.reflog) args.push('--reflog');
  } else if (options.branches.length > 0) {
    args.push(...options.branches);
    if (options.includeHead && !options.branches.includes('HEAD')) args.push('HEAD');
    if (options.showStashes) args.push('--glob=refs/stash');
    if (options.reflog) args.push('--reflog');
  } else {
    args.push('HEAD');
    if (options.reflog) args.push('--reflog');
  }
  if (options.path) {
    if (options.follow) args.push('--follow');
    args.push('--', options.path);
  }
  return args;
}

export function messageGrepArgs(pattern: string, ignoreCase: boolean, regex: boolean): string[] {
  const args = [regex ? '--extended-regexp' : '--fixed-strings'];
  if (ignoreCase) args.push('-i');
  args.push(`--grep=${pattern}`);
  return args;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pickaxeArgs(pattern: string, ignoreCase: boolean, regex: boolean): string[] {
  const args: string[] = [];
  if (ignoreCase) args.push('-i');
  args.push(`-G${regex ? pattern : escapeRegExp(pattern)}`);
  return args;
}
