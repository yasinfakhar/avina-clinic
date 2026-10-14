const web = require('undici');
const streams = require('node:stream/web');
for (const name of ['fetch', 'Headers', 'Request', 'Response', 'FormData', 'File']) {
  globalThis[name] = web[name];
}
for (const name of ['ReadableStream', 'WritableStream', 'TransformStream']) {
  globalThis[name] ??= streams[name];
}
globalThis.Blob ??= require('node:buffer').Blob;
Response.json ??= function (value, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), { ...init, headers });
};
