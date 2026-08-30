import http from 'node:http';

const port = Number(process.env.GIT_GRAPH_RAY_ASKPASS_PORT ?? '0');
const token = process.env.GIT_GRAPH_RAY_ASKPASS_TOKEN ?? '';
const prompt = process.argv.slice(2).join(' ');

const payload = JSON.stringify({ prompt });
const req = http.request(
  {
    host: '127.0.0.1',
    port,
    path: '/',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  },
  (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (c) => chunks.push(c as Buffer));
    res.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { value?: string };
        process.stdout.write(parsed.value ?? '');
      } catch {
        process.stdout.write('');
      }
    });
  },
);
req.on('error', () => process.exit(1));
req.end(payload);
