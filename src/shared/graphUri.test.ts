import { describe, expect, it } from 'vitest';
import { graphDocumentLabel } from './graphUri';

describe('graphDocumentLabel', () => {
  it('always uses Git Graph Ray', () => {
    expect(graphDocumentLabel('C:/Users/me/proj/git-graph')).toBe('Git Graph Ray');
    expect(graphDocumentLabel('C:\\Users\\me\\proj\\laravel')).toBe('Git Graph Ray');
    expect(graphDocumentLabel('')).toBe('Git Graph Ray');
  });
});
