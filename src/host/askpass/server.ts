import { randomBytes } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import * as vscode from 'vscode';
import { isSecretPrompt } from '../../shared/askpass';
import { setGitExtraEnv } from '../git/runner';

export type AskpassServer = vscode.Disposable & { env: NodeJS.ProcessEnv };

export async function startAskpassServer(context: vscode.ExtensionContext): Promise<AskpassServer> {
  const token = randomBytes(24).toString('hex');
  const script = path.join(context.extensionPath, 'resources', process.platform === 'win32' ? 'askpass.cmd' : 'askpass.sh');
  const main = path.join(context.extensionPath, 'dist', 'host', 'askpass.js');

  let queue = Promise.resolve();
  const server = http.createServer((req, res) => {
    void handle(req, res, token, (task) => {
      const run = queue.then(task, task);
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const env: NodeJS.ProcessEnv = {
    GIT_ASKPASS: script,
    SSH_ASKPASS: script,
    GIT_TERMINAL_PROMPT: '0',
    GIT_GRAPH_RAY_ASKPASS_NODE: process.execPath,
    GIT_GRAPH_RAY_ASKPASS_MAIN: main,
    GIT_GRAPH_RAY_ASKPASS_PORT: String(port),
    GIT_GRAPH_RAY_ASKPASS_TOKEN: token,
  };
  setGitExtraEnv(env);

  return {
    env,
    dispose() {
      setGitExtraEnv({});
      server.close();
    },
  };
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  token: string,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    if ((req.headers.authorization ?? '') !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end();
      return;
    }
    const body = await readBody(req);
    const prompt = String((JSON.parse(body || '{}') as { prompt?: string }).prompt ?? '');
    const value = await enqueue(() =>
      Promise.resolve(
        vscode.window.showInputBox({
          title: 'Git Graph Ray',
          prompt,
          password: isSecretPrompt(prompt),
          ignoreFocusOut: true,
        }),
      ),
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ value: value ?? '' }));
  } catch {
    res.writeHead(500);
    res.end();
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}
