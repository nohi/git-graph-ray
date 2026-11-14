/** Interface language chosen in the extension settings. Nothing follows the VS Code locale automatically. */
export type ExtensionLanguage = 'en' | 'ja';

/** Unknown or unsupported values fall back to English, the source language. */
export function normalizeLanguage(value: unknown): ExtensionLanguage {
  return value === 'ja' ? 'ja' : 'en';
}
