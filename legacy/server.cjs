require('../polyfills.cjs');
const { createServer } = require('node:http');
const { readFileSync, statSync } = require('node:fs');
const path = require('node:path');
const { routes, closeDb } = require('./routes.cjs');
const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const origin = `http://127.0.0.1:${port}`;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
let stopping = false;
const server = createServer(async (incoming, outgoing) => {
  try {
    if (stopping) { outgoing.writeHead(503).end(); return; }
    // Never let an untrusted Host header change the internal origin.
    if (incoming.headers.host !== `127.0.0.1:${port}`) { outgoing.writeHead(400).end(); return; }
    const url = new URL(incoming.url, origin);
    if (url.origin !== origin) { outgoing.writeHead(400).end(); return; }
    if (url.pathname.startsWith('/api/')) {
      const route = routes.find((item) => item.pattern.test(url.pathname));
      if (!route) { outgoing.writeHead(404).end(); return; }
      const handler = route.handlers[incoming.method];
      if (typeof handler !== 'function') { outgoing.writeHead(405).end(); return; }
      const chunks = []; let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 55 * 1024 * 1024) { outgoing.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, value);
      }
      const request = new Request(url, { method: incoming.method, headers,
        ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Buffer.concat(chunks) } : {}) });
      const match = route.pattern.exec(url.pathname);
      const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
      const response = await handler(request, { params: Promise.resolve(params) });
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) => outgoing.setHeader(name, value));
      if (response.headers.getSetCookie) {
        const cookies = response.headers.getSetCookie();
        if (cookies.length) outgoing.setHeader('set-cookie', cookies);
      }
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!['GET', 'HEAD'].includes(incoming.method)) { outgoing.writeHead(405).end(); return; }
    const decoded = decodeURIComponent(url.pathname);
    const file = decoded === '/' ? path.join(root, 'index.html') : path.resolve(root, `.${decoded}`);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(':')) { outgoing.writeHead(404).end(); return; }
    if (!statSync(file).isFile()) { outgoing.writeHead(404).end(); return; }
    outgoing.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    outgoing.setHeader('cache-control', 'no-store');
    outgoing.end(incoming.method === 'HEAD' ? undefined : readFileSync(file));
  } catch (error) {
    if (error.code === 'ENOENT') outgoing.writeHead(404).end();
    else { console.error(error); if (!outgoing.headersSent) outgoing.writeHead(500); outgoing.end('Internal server error'); }
  }
});
process.on('SIGTERM', () => {
  stopping = true;
  server.close(() => { closeDb(); process.exit(0); });
});
server.listen(port, '127.0.0.1');
