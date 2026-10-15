import type { RepoOperation, RepoOperationKind } from '../../shared/types';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { gitExec, gitMaybe } from './runner';

const OPERATION_REFS: Array<[RepoOperationKind, string]> = [
  ['merge', 'MERGE_HEAD'],
  ['rebase', 'REBASE_HEAD'],
  ['cherry-pick', 'CHERRY_PICK_HEAD'],
  ['revert', 'REVERT_HEAD'],
];

export async function readRepoOperation(git: string, cwd: string): Promise<RepoOperation | null> {
  let kind: RepoOperationKind | null = null;
  if (await amInProgress(git, cwd)) kind = 'am';
  if (!kind) {
    for (const [name, ref] of OPERATION_REFS) {
      const result = await gitExec(git, cwd, ['rev-parse', '-q', '--verify', ref]);
      if (result.code === 0 && result.stdout.toString().trim()) {
        kind = name;
        break;
      }
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

async function amInProgress(git: string, cwd: string): Promise<boolean> {
  const rel = (await gitMaybe(git, cwd, ['rev-parse', '--git-path', 'rebase-apply'])).trim();
  if (!rel) return false;
  return existsSync(path.resolve(cwd, rel, 'applying'));
}
