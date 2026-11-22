import worker from '../worker/index.js';

const endpoints = new Set(['login', 'logout', 'session', 'friends', 'feed', 'history']);

// Vercel supplies runtime context as the second fetch argument, not Worker env bindings.
export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const endpoint = url.pathname === '/api/index'
        ? url.searchParams.get('__route')
        : url.pathname.slice('/api/'.length);
      if (!url.pathname.startsWith('/api/') || !endpoints.has(endpoint)) {
        return Response.json({ error: 'Không tìm thấy API.' }, { status: 404 });
      }
      if (endpoint === 'login' && !process.env.SESSION_SECRET) {
        return Response.json({ error: 'Chưa cấu hình SESSION_SECRET trên Vercel. Hãy thêm biến môi trường rồi triển khai lại.' }, {
          status: 503,
          headers: { 'cache-control': 'no-store' },
        });
      }
      url.pathname = '/api/' + endpoint;
      url.searchParams.delete('__route');
      const headers = new Headers(request.headers);
      // These identities are trustworthy only behind Sites, not on a public Vercel origin.
      for (const name of [...headers.keys()]) {
        if (name.startsWith('oai-authenticated-')) headers.delete(name);
      }
      return await worker.fetch(new Request(url, {
        method: request.method,
        headers,
        ...(!['GET', 'HEAD'].includes(request.method) ? { body: await request.arrayBuffer() } : {}),
        signal: request.signal,
      }), { SESSION_SECRET: process.env.SESSION_SECRET });
    } catch (error) {
      // Keep credentials and upstream payloads out of runtime logs.
      console.error('Vercel API adapter failed', { type: error?.name || 'Error' });
      return Response.json({ error: 'Máy chủ gặp lỗi. Vui lòng thử lại.' }, {
        status: 500,
        headers: { 'cache-control': 'no-store' },
      });
    }
  },
};
