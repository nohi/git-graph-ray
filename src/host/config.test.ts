import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { settings, files } = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  files: {} as Record<string, string>,
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: (section?: string) => ({
      get: (key: string) => settings[`${section}.${key}`],
    }),
    fs: {
      readFile: async (uri: unknown) => {
        const text = files[String(uri)];
        if (text === undefined) throw new Error(`missing file: ${String(uri)}`);
        return Buffer.from(text);
      },
    },
  },
  Uri: {
    joinPath: (...parts: unknown[]) => parts.join('/'),
  },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
}));

import { extensionLanguage, readLanguageBundle } from './config';

const BUNDLE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'l10n', 'bundle.l10n.ja.json');

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  for (const key of Object.keys(files)) delete files[key];
});

describe('extensionLanguage', () => {
  it('defaults to English and never follows another value blindly', () => {
    expect(extensionLanguage()).toBe('en');
    settings['git-graph-ray.language'] = 'ja';
    expect(extensionLanguage()).toBe('ja');
    settings['git-graph-ray.language'] = 'auto';
    expect(extensionLanguage()).toBe('en');
  });
});

describe('readLanguageBundle', () => {
  it('returns no bundle for English', async () => {
    settings['git-graph-ray.language'] = 'en';
    files['/ext/l10n/bundle.l10n.ja.json'] = '{}';
    await expect(readLanguageBundle('/ext' as never)).resolves.toBeUndefined();
  });

  it('parses the Japanese bundle when selected', async () => {
    settings['git-graph-ray.language'] = 'ja';
    files['/ext/l10n/bundle.l10n.ja.json'] = readFileSync(BUNDLE_PATH, 'utf8');
    const bundle = await readLanguageBundle('/ext' as never);
    expect(bundle?.['Shortcuts']).toBe('ショートカット');
  });

  it('falls back to English when the bundle is missing or broken', async () => {
    settings['git-graph-ray.language'] = 'ja';
    await expect(readLanguageBundle('/ext' as never)).resolves.toBeUndefined();
    files['/ext/l10n/bundle.l10n.ja.json'] = 'not json';
    await expect(readLanguageBundle('/ext' as never)).resolves.toBeUndefined();
  });
});
