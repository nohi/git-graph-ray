import { describe, expect, it } from 'vitest';
import { normalizeLanguage } from './language';

describe('normalizeLanguage', () => {
  it('keeps the supported languages', () => {
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('ja')).toBe('ja');
  });

  it('falls back to English for anything else', () => {
    expect(normalizeLanguage(undefined)).toBe('en');
    expect(normalizeLanguage('auto')).toBe('en');
    expect(normalizeLanguage('de')).toBe('en');
    expect(normalizeLanguage(42)).toBe('en');
  });
});
