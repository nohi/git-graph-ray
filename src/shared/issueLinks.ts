export function applyIssueLinks(text: string, regex: string, url: string): string {
  if (!regex) return escapeHtml(text);
  let re: RegExp;
  try {
    re = new RegExp(regex, 'g');
  } catch {
    return escapeHtml(text);
  }
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    out += escapeHtml(text.slice(last, idx));
    const groups = m.slice(1);
    let href = url;
    groups.forEach((g, i) => {
      if (g) href = href.replaceAll(`$${i + 1}`, encodeURIComponent(g));
    });
    if (!url.includes('$1')) href = url.replaceAll('$1', encodeURIComponent(m[0]));
    out += `<a href="${escapeAttr(href)}">${escapeHtml(m[0])}</a>`;
    last = idx + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

export function fillPrUrl(
  template: string,
  values: { repo?: string; source?: string; dest?: string; host?: string; [k: string]: string | undefined },
): string {
  const ordered = [values.repo, values.source, values.dest, values.host, values.source, values.dest, values.repo, values.host];
  let out = template;
  ordered.forEach((v, i) => {
    if (v) out = out.replaceAll(`$${i + 1}`, encodeURIComponent(v));
  });
  return out;
}

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replaceAll('"', '&quot;');
}

export function extractFencedBlocks(text: string): { text: string; fences: string[] } {
  const fences: string[] = [];
  const next = text.replace(/^```[^\n]*\r?\n([\s\S]*?)^```[ \t]*$/gm, (_m, code: string) => {
    fences.push(code.replace(/\r?\n$/, ''));
    return `@@FENCE${fences.length - 1}@@`;
  });
  return { text: next, fences };
}

export function restoreFencedBlocks(html: string, fences: string[]): string {
  return html.replace(/@@FENCE(\d+)@@/g, (_m, n: string) => {
    const code = fences[Number(n)] ?? '';
    return `<pre class="md-fence"><code>${escapeHtml(code)}</code></pre>`;
  });
}

export function applyInlineMarkdown(escaped: string): string {
  return escaped
    .replaceAll(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/\*([^*]+)\*/g, '<em>$1</em>')
    .replaceAll(/`([^`]+)`/g, '<code>$1</code>');
}

export function highlightInlineCode(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('`', i);
    if (start < 0) {
      out += escapeHtml(text.slice(i));
      break;
    }
    const end = text.indexOf('`', start + 1);
    if (end < 0) {
      out += escapeHtml(text.slice(i));
      break;
    }
    out += escapeHtml(text.slice(i, start));
    out += `<code>${escapeHtml(text.slice(start + 1, end))}</code>`;
    i = end + 1;
  }
  return out;
}

export function renderMarkdownLite(text: string, enabled: boolean): string {
  const { text: stripped, fences } = extractFencedBlocks(text);
  let html = escapeHtml(stripped);
  if (enabled) html = applyInlineMarkdown(html);
  return restoreFencedBlocks(html, fences);
}

export function formatCommitMessageHtml(
  text: string,
  markdown: boolean,
  issue?: { regex: string; url: string } | null,
): string {
  const { text: stripped, fences } = extractFencedBlocks(text);
  let html = issue?.regex ? applyIssueLinks(stripped, issue.regex, issue.url) : escapeHtml(stripped);
  if (markdown) html = applyInlineMarkdown(html);
  return restoreFencedBlocks(html, fences);
}

export function applyEmoji(text: string, maps: Array<{ shortcode: string; emoji: string }>): string {
  let out = text;
  for (const m of maps) {
    if (m.shortcode) out = out.replaceAll(m.shortcode, m.emoji);
  }
  return out;
}

const BUILTIN_EMOJI: Array<{ shortcode: string; emoji: string }> = [
  { shortcode: ':sparkles:', emoji: '✨' },
  { shortcode: ':bug:', emoji: '🐛' },
  { shortcode: ':fire:', emoji: '🔥' },
  { shortcode: ':memo:', emoji: '📝' },
  { shortcode: ':rocket:', emoji: '🚀' },
];

export function emojiTable(extra: Array<{ shortcode: string; emoji: string }>): Array<{ shortcode: string; emoji: string }> {
  return [...BUILTIN_EMOJI, ...extra];
}
