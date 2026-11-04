import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile('src/server.js','utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from('const HTML="<html lang=vi>Gallery</html>";\n'+source).toString('base64'))).default;
const env={SESSION_SECRET:'a-random-secret-used-only-in-tests'};
const req=(path,body,cookie,owner='alice')=>new Request('https://gallery.example'+path,{method:body?'POST':'GET',headers:{origin:'https://gallery.example','oai-authenticated-user-id':owner,...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(path==='/api/history'?{from:Date.UTC(2020,0,1),to:Date.UTC(2026,10,5),...body}:body)}:{})});
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
test('History uses the account history database, stable cursor and exact timestamps',async()=>{
  const real=globalThis.fetch,calls=[];let historyPage=0,deny=false;
  const timestamp='2022-01-01T00:00:00.123456789Z';
  globalThis.fetch=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body||'{}'),headers:options.headers});
    if(url.includes('verifyPassword'))return Response.json({idToken:'id-token',refreshToken:'refresh',expiresIn:'3600'});
    if(url.includes('getAccountInfo'))return Response.json({users:[{localId:'my-uid'}]});
    assert.match(url,/databases\/locket\/documents\/history\/my-uid:runQuery$/);
    assert.equal(options.headers.authorization,'Bearer id-token');
    if(deny)return Response.json({error:{message:'PERMISSION_DENIED'}},{status:403});
    historyPage++;
    if(historyPage===3)return Response.json([{readTime:'2026-11-04T10:00:00Z'}]);
    const id=historyPage===1?'photo-z':'photo-a';
    return Response.json([{document:{name:'projects/locket-4252a/databases/locket/documents/history/my-uid/entries/'+id,fields:{date:{timestampValue:timestamp},user:{stringValue:'friend-uid'},thumbnail_url:{stringValue:'https://example.com/photo.jpg'},caption:{stringValue:'Old memory'},reactions:{arrayValue:{values:[{mapValue:{fields:{emoji:{stringValue:'💛'},count:{integerValue:'2'}}}}]}}}}}]);
  };
  try{
    const login=await worker.fetch(req('/api/login',{identifier:'test@example.com',password:'password'}),env);const cookie=login.headers.get('set-cookie');
    const first=await worker.fetch(req('/api/history',{},cookie),env);assert.equal(first.status,200);const a=await first.json();assert.equal(a.complete,false,'A short page does not imply end of history');assert.equal(a.moments[0].id,'photo-z');assert.equal(a.moments[0].date,timestamp);assert.equal(a.moments[0].reactions[0].count,2);
    const query=calls.at(-1).body.structuredQuery;assert.deepEqual(query.orderBy.map(x=>x.field.fieldPath),['date','__name__']);assert.equal(query.limit,50);
    assert.deepEqual(query.where.compositeFilter.filters.map(f=>[f.fieldFilter.op,f.fieldFilter.value.timestampValue]),[['GREATER_THAN_OR_EQUAL','2020-01-01T00:00:00.000Z'],['LESS_THAN','2026-11-05T00:00:00.000Z']]);
    const badRange=await worker.fetch(req('/api/history',{from:10,to:5},cookie),env);assert.equal(badRange.status,400);
    const missingRange=await worker.fetch(req('/api/history',{from:null,to:null},cookie),env);assert.equal(missingRange.status,400);
    const second=await worker.fetch(req('/api/history',{cursor:a.nextCursor},cookie),env);const b=await second.json();assert.equal(b.moments[0].id,'photo-a');const start=calls.at(-1).body.structuredQuery.startAt;assert.equal(start.values[0].timestampValue,timestamp);assert.match(start.values[1].referenceValue,/history\/my-uid\/entries\/photo-z$/);assert.equal(start.before,false);
    const end=await worker.fetch(req('/api/history',{cursor:b.nextCursor},cookie),env);assert.deepEqual(await end.json(),{moments:[],nextCursor:null,complete:true});
    const before=calls.length;const bad=await worker.fetch(req('/api/history',{cursor:{date:timestamp,id:'../../someone-else'}},cookie),env);assert.equal(bad.status,400);assert.equal(calls.length,before,'Reject a cross-account cursor before making a request');
    deny=true;const denied=await worker.fetch(req('/api/history',{},cookie),env);assert.equal(denied.status,502);assert.match((await denied.json()).error,/Không tải được lịch sử/);
  }finally{globalThis.fetch=real;}
});
