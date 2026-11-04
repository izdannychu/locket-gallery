// Minimal DOM harness for the browser application; verifies data rendering and filters.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='#sort'?'new':'',textContent:'',innerHTML:'',hidden:false,disabled:false,classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return[];},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);};
const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>({})},localStorage:{getItem:()=>null,setItem(){}},location:{href:'https://gallery.example'},URL,Date,Set,Map,JSON,String,Array,Math,Number,Error,AbortController,console,setTimeout:()=>0,clearTimeout(){},fetch:async()=>({ok:false,status:401,json:async()=>({error:'Not connected'})})});
const workerSource=await readFile('dist/server/index.js','utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64'))).default;
const html=await (await worker.fetch(new Request('https://gallery.example/'))).text();
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.equal(script,await readFile('src/app.js','utf8'),'Build must preserve the complete browser script byte for byte');
vm.runInContext(script,context);
vm.runInContext("document.querySelector('#connect-top').onclick()",context);
assert.equal(element('#connect-dialog').open,true,'Connect button must open the login dialog');
vm.runInContext("document.querySelector('#import-btn').onclick()",context);
assert.equal(element('#import-dialog').open,true,'Import button must open the file dialog');
vm.runInContext("document.querySelector('#demo-btn').onclick()",context);
assert.match(element('#gallery').innerHTML,/images.unsplash.com/);assert.equal(element('#stat-moments').textContent,12);assert.equal(element('#dataset-label').textContent,'Ảnh minh họa');
vm.runInContext("setView('mine')",context);assert.equal(element('#visible-count').textContent,3);
vm.runInContext("setView('friends')",context);assert.equal(element('#visible-count').textContent,9);
vm.runInContext("setView('all'); document.querySelector('#search').value='bình yên'; renderGallery()",context);assert.equal(element('#visible-count').textContent,1);
vm.runInContext("document.querySelector('#search').value=''; state.type='video'; renderGallery()",context);assert.equal(element('#visible-count').textContent,0);assert.equal(element('#empty').hidden,false);
vm.runInContext("state.type='all'; document.querySelector('#month').value='2026-10'; renderGallery()",context);assert.equal(element('#visible-count').textContent,0);
vm.runInContext("detail('sample-0')",context);assert.match(element('#detail-content').innerHTML,/Khánh Linh/);assert.equal(element('#detail-dialog').open,true);
assert.equal(vm.runInContext("safeUrl('javascript:alert(1)')",context),'');assert.equal(vm.runInContext("esc('<img onerror=bad>')",context),'&lt;img onerror=bad&gt;');
console.log('Gallery rendering, filters, detail and escaping passed');
// Exercise the built app against multiple pages, not just the unbuilt sync function.
await new Promise(resolve=>setImmediate(resolve)); // Let the initial unauthenticated session check settle.
const historyRequests=[];let historyCalls=0,failNext=false,pauseNext=false,repeatCursor=false;
context.fetch=async(path,options)=>{
  if(path.startsWith('/api/friends'))return {ok:true,json:async()=>({friends:[],nextPageToken:null})};
  if(path==='/api/feed')return {ok:true,json:async()=>({moments:[{canonical_uid:'new',user:'me',date:'2026-11-04T10:00:00Z'}]})};
  if(path==='/api/history'){
    const request=JSON.parse(options.body);historyRequests.push(request);historyCalls++;
    if(failNext){failNext=false;return {ok:false,status:502,json:async()=>({error:'Temporary history error'})};}
    if(pauseNext){pauseNext=false;vm.runInContext('state.syncController.abort()',context);options.signal.throwIfAborted();}
    let page;
    if(repeatCursor)page={moments:[{id:'new',date:'2026-11-04T10:00:00Z'}],nextCursor:{date:'2026-11-04T10:00:00Z',id:'new'},complete:false};
    else if(!request.cursor)page={moments:[{canonical_uid:'new',user:'me',date:'2026-11-04T10:00:00Z'}],nextCursor:{date:'2026-11-04T10:00:00Z',id:'new'},complete:false};
    else if(request.cursor.id==='new')page={moments:[{id:'oldest',user:'me',date:'2022-01-01T00:00:00.123456789Z'}],nextCursor:{date:'2022-01-01T00:00:00.123456789Z',id:'oldest'},complete:false};
    else page={moments:[],nextCursor:null,complete:true};
    return {ok:true,json:async()=>page};
  }throw Error('Unexpected request '+path);
};
vm.runInContext("resetData(); state.connected=true; state.mode='live'; state.me={uid:'me',name:'Bạn'}",context);
await vm.runInContext('sync()',context);
assert.equal(historyCalls,3,'Automatically request every page, including the final empty page');
assert.equal(historyRequests[2].cursor.id,'oldest');
assert.equal(vm.runInContext('state.moments.length',context),2,'Feed/history overlap must not duplicate a photo');
assert.equal(vm.runInContext('state.historyComplete',context),true);
assert.match(element('#sync-summary').textContent,/Đã duyệt hết/);
assert.match(element('#sync-detail').textContent,/2022/);
failNext=true;await vm.runInContext('sync()',context);
assert.equal(vm.runInContext('state.historyComplete',context),false);
assert.equal(vm.runInContext('state.historyPhase',context),'error');
assert.equal(vm.runInContext('state.moments.length',context),2,'Keep already loaded photos after a failure');
assert.equal(element('#retry-history').hidden,false);
await vm.runInContext('sync(true)',context);assert.equal(vm.runInContext('state.historyComplete',context),true);
pauseNext=true;await vm.runInContext('sync()',context);assert.equal(vm.runInContext('state.historyPhase',context),'paused');
repeatCursor=true;await vm.runInContext('sync()',context);assert.equal(vm.runInContext('state.historyComplete',context),false);assert.equal(vm.runInContext('state.historyPhase',context),'error');
console.log('Full history traversal, oldest photo, deduplication, retry, pause and repeated cursor checks passed');
