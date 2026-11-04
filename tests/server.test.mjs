import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile('src/server.js','utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from('const HTML="<html lang=vi>Gallery</html>";\n'+source).toString('base64'))).default;
const env={SESSION_SECRET:'a-random-secret-used-only-in-tests'};
const req=(path,body,cookie,owner='alice')=>new Request('https://gallery.example'+path,{method:body?'POST':'GET',headers:{origin:'https://gallery.example','oai-authenticated-user-id':owner,...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('Authentication boundaries, encrypted session, feed and token refresh',async()=>{
  const real=globalThis.fetch;let refreshed=false;const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,body:options.body,headers:options.headers});
    const data=url.includes('verifyPassword')?{idToken:'id-token',refreshToken:'private-refresh',expiresIn:'0'}:url.includes('getAccountInfo')?{users:[{localId:'my-uid',displayName:'Test',email:'test@example.com'}]}:url.includes('securetoken')?(refreshed=true,{id_token:'renewed-token',refresh_token:'new-refresh',expires_in:3600}):url.includes('/friends')?{documents:[{name:'users/friend-uid',fields:{user:{stringValue:'friend-uid'}}}]}:url.includes('fetchUserV2')?{result:{status:200,data:{uid:'friend-uid',first_name:'Linh'}}}:url.includes('getLatestMomentV2')?{result:{status:200,data:[{canonical_uid:'moment',user:'friend-uid'}],sync_token:'cursor'}}:{};
    return Response.json(data);
  };
  try{
    assert.equal((await worker.fetch(req('/api/session'),env)).status,401);
    const cross=await worker.fetch(new Request('https://gallery.example/api/login',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}),env);assert.equal(cross.status,403);assert.equal(calls.length,0);
    assert.equal((await worker.fetch(req('/api/login',{identifier:'123',password:'pw'}),env)).status,400);
    const login=await worker.fetch(req('/api/login',{identifier:'test@example.com',password:'super-private-password'}),env);assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);assert.ok(!cookie.includes('id-token'));assert.ok(!cookie.includes('private-refresh'));assert.ok(!(await login.text()).includes('private'));
    const s=await worker.fetch(req('/api/session',null,cookie),env);assert.equal(s.status,200);assert.equal((await s.json()).me.uid,'my-uid');assert.equal(refreshed,true);
    assert.equal((await worker.fetch(req('/api/session',null,cookie,'bob'),env)).status,401);
    assert.equal((await worker.fetch(req('/api/session',null,'lg_session=invalid.cipher'),env)).status,401);
    const friends=await worker.fetch(req('/api/friends',null,cookie),env);assert.equal((await friends.json()).friends[0].name,'Linh');
    const feed=await worker.fetch(req('/api/feed',{users:['my-uid','friend-uid'],syncToken:'previous'},cookie),env);const f=await feed.json();assert.equal(f.moments[0].canonical_uid,'moment');assert.equal(f.syncToken,'cursor');assert.equal(JSON.parse(calls.at(-1).body).data.sync_token,'previous');assert.equal(calls.at(-1).headers.authorization,'Bearer renewed-token');
    assert.equal((await worker.fetch(req('/api/feed',{users:[{}]},cookie),env)).status,400);
    const logout=await worker.fetch(req('/api/logout',{},cookie),env);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  }finally{globalThis.fetch=real;}
});
test('Upstream failures do not leak credentials',async()=>{const real=globalThis.fetch;globalThis.fetch=async()=>Response.json({error:{message:'INVALID_PASSWORD',password:'should-never-leak'}},{status:400});try{const r=await worker.fetch(req('/api/login',{identifier:'test@example.com',password:'secret'}),env);assert.equal(r.status,502);assert.ok(!(await r.text()).includes('should-never-leak'));}finally{globalThis.fetch=real;}});
