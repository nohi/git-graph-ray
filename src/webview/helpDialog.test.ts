import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'styles.css');

/** Body of the first rule whose selector line contains `selector`. Handles one nesting level. */
function ruleBody(css: string, selector: string): string | null {
  const lines = css.split('\n');
  const start = lines.findIndex((line) => line.includes(selector) && line.trimEnd().endsWith('{'));
  if (start < 0) return null;
  let depth = 0;
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    out.push(line);
    if (depth === 0) break;
  }
  return out.join('\n');
}

function declaration(body: string, property: 'color' | 'background'): string | null {
  const m = new RegExp(`(?:^|[\\s{;])${property}\\s*:\\s*([^;]+);`).exec(body);
  return m?.[1]?.trim() ?? null;
}

describe('help dialog shortcut keys', () => {
  // The host webview stylesheet paints kbd with its own light text on gray.
  // The kbd rule must declare both explicitly, or the pills go invisible in light mode.
  it('declares an explicit non-inherited color and background for .help-keys kbd', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    const helpKeys = ruleBody(css, '.help-keys');
    expect(helpKeys).not.toBeNull();
    const kbd = ruleBody(helpKeys!, 'kbd');
    expect(kbd).not.toBeNull();
    const color = declaration(kbd!, 'color');
    expect(color).not.toBeNull();
    expect(color).not.toMatch(/^(inherit|initial|unset|currentColor)$/);
    expect(declaration(kbd!, 'background')).not.toBeNull();
  });
});
