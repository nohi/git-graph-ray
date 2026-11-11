import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffDocumentPath } from '../../shared/diffSides';
import { isFile, workingFileFor } from './openFilePath';

describe('workingFileFor', () => {
  const root = path.resolve('/work/repo');

  it('drops the revision label from the document path', () => {
    expect(workingFileFor(root, diffDocumentPath('abc1234', 'src/app.ts'))).toEqual({
      rel: 'src/app.ts',
      full: path.join(root, 'src', 'app.ts'),
    });
    expect(workingFileFor(root, diffDocumentPath('abc1234^', 'README.md'))?.full).toBe(path.join(root, 'README.md'));
    expect(workingFileFor(root, diffDocumentPath('worktree', '\\src\\app.ts'))?.full).toBe(path.join(root, 'src', 'app.ts'));
  });

  it('does not open a file outside the repository', () => {
    expect(workingFileFor(root, '/abc1234/../outside.txt')).toEqual({ rel: '../outside.txt' });
    expect(workingFileFor(root, '/abc1234/src/../../outside.txt')?.full).toBeUndefined();
  });

  it('needs a repository and a file', () => {
    expect(workingFileFor('', diffDocumentPath('HEAD', 'a.ts'))).toBeUndefined();
    expect(workingFileFor(root, '/HEAD')).toBeUndefined();
    expect(workingFileFor(root, '/HEAD/')).toBeUndefined();
  });

  it.runIf(process.platform === 'win32')('joins a Windows repository path with backslashes', () => {
    expect(workingFileFor('I:\\ws\\repo', '/abc1234/src/app.ts')?.full).toBe('I:\\ws\\repo\\src\\app.ts');
    expect(workingFileFor('I:\\ws\\repo', '/abc1234/../repo2/a.ts')?.full).toBeUndefined();
  });
});

describe('isFile', () => {
  it('is true only for a file that exists', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ggr-open-'));
    try {
      const file = path.join(dir, 'a.txt');
      fs.writeFileSync(file, 'a');
      expect(await isFile(file)).toBe(true);
      expect(await isFile(dir)).toBe(false);
      expect(await isFile(path.join(dir, 'missing.txt'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
