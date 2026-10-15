export type RemoteTagTip = { remote: string; name: string; commit: string };

export type RemoteTagError = { remote: string; message: string };

export type RemoteTagLookup = { tags: RemoteTagTip[]; errors: RemoteTagError[] };

export function remoteTagErrorText(errors: readonly RemoteTagError[]): string {
  return errors
    .map((error) => {
      const message = error.message.trim();
      if (!message) return '';
      return error.remote ? `${error.remote}: ${message}` : message;
    })
    .filter(Boolean)
    .join('\n');
}

export type TagOnRemote = 'pushed' | 'mismatch';

/** `git ls-remote --tags` lines. Annotated tags use the peeled commit (`^{}`). */
export function parseRemoteTagTips(remote: string, stdout: string): RemoteTagTip[] {
  const peeled = new Map<string, string>();
  const direct = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const hash = line.slice(0, tab).trim();
    const ref = line.slice(tab + 1).trim();
    if (!hash || !ref.startsWith('refs/tags/')) continue;
    if (ref.endsWith('^{}')) peeled.set(ref.slice('refs/tags/'.length, -3), hash);
    else direct.set(ref.slice('refs/tags/'.length), hash);
  }
  const tips: RemoteTagTip[] = [];
  for (const name of new Set([...direct.keys(), ...peeled.keys()])) {
    const commit = peeled.get(name) ?? direct.get(name);
    if (commit) tips.push({ remote, name, commit });
  }
  return tips;
}

export function tagOnRemote(localCommit: string, remoteCommit: string | undefined): TagOnRemote | null {
  if (!localCommit || !remoteCommit) return null;
  return localCommit.toLowerCase() === remoteCommit.toLowerCase() ? 'pushed' : 'mismatch';
}
