export type LogRevisionOptions = {
  branches: string[] | 'all';
  showRemote: boolean;
  showStashes: boolean;
  showTags: boolean;
  includeTagOnly: boolean;
  reflog: boolean;
  includeHead: boolean;
};

export function logRevisionArgs(options: LogRevisionOptions): string[] {
  const args: string[] = [];
  if (options.branches === 'all') {
    if (options.showRemote) args.push('--all');
    else {
      args.push('--branches');
      if (options.showTags && options.includeTagOnly) args.push('--tags');
      if (options.includeHead) args.push('HEAD');
    }
    if (options.showStashes) args.push('--glob=refs/stash');
    if (options.reflog) args.push('--reflog');
    return args;
  }
  if (options.branches.length > 0) {
    args.push(...options.branches);
    if (options.includeHead && !options.branches.includes('HEAD')) args.push('HEAD');
    if (options.showStashes) args.push('--glob=refs/stash');
    if (options.reflog) args.push('--reflog');
    return args;
  }
  args.push('HEAD');
  if (options.reflog) args.push('--reflog');
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
