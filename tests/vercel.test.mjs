import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import handler from '../api/index.js';

test('Vercel serves the compiled homepage statically and routes only API requests to the function', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  assert.equal(config.outputDirectory, 'dist/vercel-public');
  assert.deepEqual(await readdir(config.outputDirectory), ['index.html']);
  const html = await readFile(config.outputDirectory + '/index.html', 'utf8');
  assert.match(html, /<html lang="vi"/);
  assert.match(html, /function renderGallery/);
  assert.ok(!html.includes('/* APP_SCRIPT */'));
  assert.ok(!html.includes('private-refresh'));
  assert.equal(config.rewrites.length, 6);
  for (const rewrite of config.rewrites) {
    assert.ok(rewrite.source.startsWith('/api/'));
    const response = await handler.fetch(new Request('https://gallery.example' + rewrite.destination));
    assert.equal(response.status, rewrite.source === '/api/login' && !process.env.SESSION_SECRET ? 503 : 401, 'Every API rewrite returns an application response rather than crashing: ' + rewrite.source);
  }
});

test('Vercel adapter passes request body, runtime secret, cookie and query to the Worker', async () => {
  const previousSecret = process.env.SESSION_SECRET;
  const realFetch = globalThis.fetch;
  process.env.SESSION_SECRET = 'test-vercel-session-secret-only';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null, headers: options.headers });
    if (url.includes('verifyPassword')) return Response.json({ idToken: 'id-token', refreshToken: 'private-refresh', expiresIn: '3600' });
    if (url.includes('getAccountInfo')) return Response.json({ users: [{ localId: 'my-uid', displayName: 'Test' }] });
    if (url.includes('/friends')) return Response.json({ documents: [] });
    throw Error('Unexpected upstream request');
  };
  try {
    const login = await handler.fetch(new Request('https://gallery.example/api/index?__route=login', {
      method: 'POST',
      headers: { origin: 'https://gallery.example', 'oai-authenticated-user-id': 'spoofed' },
      body: JSON.stringify({ identifier: 'test@example.com', password: 'test-password' }),
    }));
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.ok(cookie.startsWith('lg_session='));
    assert.ok(!cookie.includes('private-refresh'));
    assert.equal(calls[0].body.email, 'test@example.com');
    // This different forged Sites identity must have no influence on a Vercel session.
    const session = await handler.fetch(new Request('https://gallery.example/api/session', {
      headers: { cookie, 'oai-authenticated-user-id': 'different-spoofed-user' },
    }));
    assert.equal(session.status, 200);
    assert.equal((await session.json()).me.uid, 'my-uid');
    const friends = await handler.fetch(new Request('https://gallery.example/api/index?__route=friends&pageToken=page%2B2', { headers: { cookie } }));
    assert.equal(friends.status, 200);
    assert.match(calls.at(-1).url, /pageToken=page%2B2/);
    const logout = await handler.fetch(new Request('https://gallery.example/api/index?__route=logout', {
      method: 'POST', headers: { cookie, origin: 'https://gallery.example' }, body: '{}',
    }));
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    const crossOrigin = await handler.fetch(new Request('https://gallery.example/api/login', {
      method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}',
    }));
    assert.equal(crossOrigin.status, 403);
    assert.equal((await handler.fetch(new Request('https://gallery.example/api/index?__route=not-allowed'))).status, 404);
    assert.equal((await handler.fetch(new Request('https://gallery.example/worker/index.js'))).status, 404);
    delete process.env.SESSION_SECRET;
    const requestsBefore = calls.length;
    const missingSecret = await handler.fetch(new Request('https://gallery.example/api/login', {
      method: 'POST', headers: { origin: 'https://gallery.example' },
      body: JSON.stringify({ identifier: 'test@example.com', password: 'test-password' }),
    }));
    assert.equal(missingSecret.status, 503);
    assert.match((await missingSecret.json()).error, /SESSION_SECRET/);
    assert.equal(calls.length, requestsBefore, 'Missing configuration must not forward credentials to Locket');
  } finally {
    globalThis.fetch = realFetch;
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});
