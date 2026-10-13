import type { RepoOperation, RepoOperationKind } from '../../shared/types';
import { gitExec, gitMaybe } from './runner';

const OPERATION_REFS: Array<[RepoOperationKind, string]> = [
  ['merge', 'MERGE_HEAD'],
  ['rebase', 'REBASE_HEAD'],
  ['cherry-pick', 'CHERRY_PICK_HEAD'],
  ['revert', 'REVERT_HEAD'],
];

export async function readRepoOperation(git: string, cwd: string): Promise<RepoOperation | null> {
  let kind: RepoOperationKind | null = null;
  for (const [name, ref] of OPERATION_REFS) {
    const result = await gitExec(git, cwd, ['rev-parse', '-q', '--verify', ref]);
    if (result.code === 0 && result.stdout.toString().trim()) {
      kind = name;
      break;
    }
  }
  if (!kind) return null;
  const files = await gitMaybe(git, cwd, ['diff', '--name-only', '--diff-filter=U']);
  return {
    kind,
    files: files
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  };
}
