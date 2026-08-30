import type { RemoteInfo } from '../../shared/dialogs';
import { gitOk } from './runner';

export async function listRemotes(git: string, cwd: string): Promise<RemoteInfo[]> {
  const stdout = await gitOk(git, cwd, ['remote', '-v']);
  const map = new Map<string, RemoteInfo>();
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!m) continue;
    const row = map.get(m[1]!) ?? { name: m[1]!, fetchUrl: '', pushUrl: '' };
    if (m[3] === 'fetch') row.fetchUrl = m[2]!;
    else row.pushUrl = m[2]!;
    map.set(m[1]!, row);
  }
  return [...map.values()];
}

export async function addRemote(git: string, cwd: string, name: string, fetchUrl: string, pushUrl?: string): Promise<void> {
  await gitOk(git, cwd, ['remote', 'add', name, fetchUrl]);
  if (pushUrl && pushUrl !== fetchUrl) await gitOk(git, cwd, ['remote', 'set-url', '--push', name, pushUrl]);
}

export async function editRemote(
  git: string,
  cwd: string,
  name: string,
  newName: string,
  fetchUrl: string,
  pushUrl?: string,
): Promise<void> {
  if (newName !== name) await gitOk(git, cwd, ['remote', 'rename', name, newName]);
  await gitOk(git, cwd, ['remote', 'set-url', newName, fetchUrl]);
  if (pushUrl) await gitOk(git, cwd, ['remote', 'set-url', '--push', newName, pushUrl]);
}

export async function deleteRemote(git: string, cwd: string, name: string): Promise<void> {
  await gitOk(git, cwd, ['remote', 'remove', name]);
}
