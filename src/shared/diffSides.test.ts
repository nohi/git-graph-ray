import { describe, expect, it } from 'vitest';
import { UNCOMMITTED } from './types';
import { blobSpec, diffDocumentPath, diffEditorSides, shortRevLabel } from './diffSides';

describe('diffEditorSides', () => {
  it('compares the two selected revisions, not a commit and its parent', () => {
    const sides = diffEditorSides({
      hash: 'aaaaaaaaaaaaaaaa',
      compare: 'bbbbbbbbbbbbbbbb',
      path: 'src/app.ts',
    });
    expect(sides.leftSpec).toBe('aaaaaaaaaaaaaaaa:src/app.ts');
    expect(sides.rightSpec).toBe('bbbbbbbbbbbbbbbb:src/app.ts');
    expect(sides.leftLabel).toBe('aaaaaaa');
    expect(sides.rightLabel).toBe('bbbbbbb');
    expect(sides.title).toBe('app.ts (aaaaaaa ↔ bbbbbbb)');
  });

  it('uses oldPath on the left when a file was renamed', () => {
    const sides = diffEditorSides({
      hash: 'aaaaaaaaaaaaaaaa',
      compare: 'bbbbbbbbbbbbbbbb',
      path: 'src/new.ts',
      oldPath: 'src/old.ts',
    });
    expect(sides.leftSpec).toBe('aaaaaaaaaaaaaaaa:src/old.ts');
    expect(sides.rightSpec).toBe('bbbbbbbbbbbbbbbb:src/new.ts');
    expect(sides.leftPath).toBe('src/old.ts');
  });

  it('diffs a single commit against its parent', () => {
    const sides = diffEditorSides({ hash: 'aaaaaaaaaaaaaaaa', path: 'src/app.ts' });
    expect(sides.leftSpec).toBe('aaaaaaaaaaaaaaaa^:src/app.ts');
    expect(sides.rightSpec).toBe('aaaaaaaaaaaaaaaa:src/app.ts');
    expect(sides.leftLabel).toBe('aaaaaaa^');
    expect(sides.title).toBe('app.ts (aaaaaaa^ ↔ aaaaaaa)');
  });

  it('diffs uncommitted changes against HEAD', () => {
    const sides = diffEditorSides({ hash: UNCOMMITTED, path: 'src/app.ts' });
    expect(sides.leftSpec).toBe('HEAD:src/app.ts');
    expect(sides.rightSpec).toBe(':src/app.ts');
    expect(sides.title).toBe('app.ts (HEAD ↔ worktree)');
  });
});

describe('diffDocumentPath', () => {
  it('puts the revision in front of the file path for breadcrumbs', () => {
    expect(diffDocumentPath('aaaaaaa', 'src/app.ts')).toBe('/aaaaaaa/src/app.ts');
    expect(diffDocumentPath('aaaaaaa^', '\\src\\app.ts')).toBe('/aaaaaaa^/src/app.ts');
  });
});

describe('blobSpec', () => {
  it('uses the worktree index spec for uncommitted files', () => {
    expect(blobSpec(UNCOMMITTED, 'a.ts')).toBe(':a.ts');
  });
});

describe('shortRevLabel', () => {
  it('shortens hashes and keeps a parent suffix', () => {
    expect(shortRevLabel('abcdef012345')).toBe('abcdef0');
    expect(shortRevLabel('abcdef012345^')).toBe('abcdef0^');
    expect(shortRevLabel(UNCOMMITTED)).toBe('worktree');
  });
});
