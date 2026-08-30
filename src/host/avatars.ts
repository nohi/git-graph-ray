import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { githubApiFromOrigin, gitlabApiFromOrigin, gravatarUrl } from '../shared/avatars';
import { gitMaybe } from './git/runner';

export class AvatarStore {
  private readonly dir: string;
  private running = 0;
  private readonly queue: Array<() => void> = [];

  constructor(globalStorage: string) {
    this.dir = path.join(globalStorage, 'avatars');
  }

  async clear(): Promise<void> {
    await fs.rm(this.dir, { recursive: true, force: true });
  }

  async resolve(git: string, cwd: string, email: string): Promise<string | null> {
    await fs.mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, encodeURIComponent(email) + '.bin');
    try {
      const buf = await fs.readFile(file);
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      /* fetch */
    }
    return this.limit(async () => {
      const origin = (await gitMaybe(git, cwd, ['remote', 'get-url', 'origin'])).trim();
      const urls = [githubApiFromOrigin(origin), gitlabApiFromOrigin(origin), gravatarUrl(email)].filter(Boolean) as string[];
      for (const url of urls) {
        try {
          const data = await this.fetchBytes(url);
          if (data) {
            await fs.writeFile(file, data);
            return `data:image/png;base64,${data.toString('base64')}`;
          }
        } catch {
          /* next */
        }
      }
      return null;
    });
  }

  private async fetchBytes(url: string): Promise<Buffer | null> {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('image')) return Buffer.from(await res.arrayBuffer());
    if (type.includes('json')) {
      const json = (await res.json()) as { avatar_url?: string } | Array<{ avatar_url?: string }>;
      const avatar = Array.isArray(json) ? json[0]?.avatar_url : json.avatar_url;
      if (!avatar) return null;
      const img = await fetch(avatar);
      return Buffer.from(await img.arrayBuffer());
    }
    return null;
  }

  private limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.running++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          this.running--;
          this.queue.shift()?.();
        }
      };
      if (this.running < 4) void run();
      else this.queue.push(() => void run());
    });
  }
}

export function avatarWebview(store: AvatarStore): void {
  void vscode;
}
