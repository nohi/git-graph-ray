export function initials(name: string, email: string): string {
  const src = name.trim() || email;
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '?';
  const b = parts[1]?.[0] ?? '';
  return (a + b).toUpperCase();
}

export function gravatarUrl(email: string): string {
  const hash = fnv1a(email.trim().toLowerCase()).toString(16).padStart(8, '0');
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=48`;
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function githubApiFromOrigin(origin: string): string | null {
  const m = origin.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (!m) return null;
  return `https://api.github.com/users/${m[1]}`;
}

export function gitlabApiFromOrigin(origin: string): string | null {
  const m = origin.match(/gitlab\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (!m) return null;
  return `https://gitlab.com/api/v4/users?username=${m[1]}`;
}
