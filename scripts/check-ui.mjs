// Minimal DOM harness for the browser application; verifies data rendering and filters.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements=new Map();
const cacheRecords=new Map();let storageDenied=false,testNow=Date.UTC(2026,10,4,12);
class TestDate extends Date{constructor(...args){super(...(args.length?args:[testNow]));}static now(){return testNow;}}
// Model asynchronous IndexedDB transactions, including failed writes and structured cloning.
const fakeDB={
  createObjectStore(){},
  transaction(){
    const tx={objectStore(){return {
      get(uid){const r={};queueMicrotask(()=>{r.result=structuredClone(cacheRecords.get(uid));tx.oncomplete?.();});return r;},
      put(record,uid){const r={},copy=structuredClone(record);queueMicrotask(()=>{if(storageDenied)tx.onerror?.();else{cacheRecords.set(uid,copy);tx.oncomplete?.();}});return r;},
    };}};
    return tx;
  },
};
const indexedDB={open(){const r={};queueMicrotask(()=>{r.result=fakeDB;r.onsuccess?.();});return r;}};
const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='#sort'?'new':'',textContent:'',innerHTML:'',hidden:false,disabled:false,classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return[];},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);};
const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>({})},localStorage:{getItem:()=>null,setItem(){}},indexedDB,location:{href:'https://gallery.example'},URL,Date:TestDate,Set,Map,JSON,String,Array,Math,Number,Error,AbortController,console,setTimeout:()=>0,clearTimeout(){},fetch:async()=>({ok:false,status:401,json:async()=>({error:'Not connected'})})});
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
vm.runInContext("resetData(); state.connected=true; state.mode='live'; state.me={uid:'me',name:'Bạn'}; state.selection={from:Date.UTC(2020,0,1),to:Date.UTC(2026,10,5),newSince:Date.now(),startDay:'2020-01-01',endDay:'2026-11-04'}; state.newWatermark=Date.now()",context);
await vm.runInContext('sync()',context);
assert.equal(historyCalls,3,'Automatically request every page, including the final empty page');
assert.equal(historyRequests[2].cursor.id,'oldest');
assert.equal(vm.runInContext('state.moments.length',context),2,'Feed/history overlap must not duplicate a photo');
assert.equal(vm.runInContext('state.historyComplete',context),true);
assert.match(element('#sync-summary').textContent,/Đã lưu khoảng/);
assert.match(element('#sync-detail').textContent,/2022/);
failNext=true;vm.runInContext('state.archiveComplete=false',context);await vm.runInContext('sync()',context);
assert.equal(vm.runInContext('state.historyComplete',context),false);
assert.equal(vm.runInContext('state.historyPhase',context),'error');
assert.equal(vm.runInContext('state.moments.length',context),2,'Keep already loaded photos after a failure');
assert.equal(element('#retry-history').hidden,false);
await vm.runInContext('sync(true)',context);assert.equal(vm.runInContext('state.historyComplete',context),true);
pauseNext=true;vm.runInContext('state.archiveComplete=false',context);await vm.runInContext('sync()',context);assert.equal(vm.runInContext('state.historyPhase',context),'paused');
repeatCursor=true;await vm.runInContext('sync()',context);assert.equal(vm.runInContext('state.historyComplete',context),false);assert.equal(vm.runInContext('state.historyPhase',context),'error');
console.log('Full history traversal, oldest photo, deduplication, retry, pause and repeated cursor checks passed');
// Selection is saved before sync and constrains feed, history, cache and later visits.
repeatCursor=false;historyCalls=0;historyRequests.length=0;
const baseline=testNow;
const selected={from:Date.UTC(2026,9,1),to:Date.UTC(2026,10,1),startDay:'2026-10-01',endDay:'2026-10-31',newSince:baseline};
vm.runInContext("resetData(); state.mode='live';state.connected=true;state.me={uid:'selected-account',name:'Bạn'}",context);
const rows=[{id:'outside',user:'friend',date:'2022-01-01T00:00:00Z'},{id:'selected-own',user:'selected-account',date:'2026-10-15T00:00:00Z'},{id:'selected-friend',user:'friend',date:'2026-10-31T12:00:00Z'},{id:'gap',user:'friend',date:'2026-11-02T00:00:00Z'},{id:'future-own',user:'selected-account',date:new Date(baseline+1000).toISOString()},{id:'new-friend',user:'friend',date:new Date(baseline+1000).toISOString()}];
context.fetch=async(path,options)=>{
  if(path.startsWith('/api/friends'))return {ok:true,json:async()=>({friends:[{uid:'friend',name:'Linh'}],nextPageToken:null})};
  if(path==='/api/feed')return {ok:true,json:async()=>({moments:rows})};
  if(path==='/api/history'){
    const input=JSON.parse(options.body);historyRequests.push(input);historyCalls++;
    const page=input.cursor?[]:rows.filter(m=>+new Date(m.date)>=input.from&&+new Date(m.date)<input.to);
    return {ok:true,json:async()=>({moments:page,nextCursor:page.length?{date:page.at(-1).date,id:page.at(-1).id}:null,complete:!page.length})};
  }throw Error('Unexpected request '+path);
};
vm.runInContext('mergeMoments([{id:"unselected",date:"2022-01-01T00:00:00Z"}])',context);assert.equal(vm.runInContext('state.moments.length',context),0,'No unselected live data is retained');
await vm.runInContext('sync()',context);assert.equal(historyCalls,0,'Do not query history before the user chooses a range');assert.equal(element('#period-dialog').open,true);
element('#period-start').value=selected.startDay;element('#period-end').value=selected.endDay;
await vm.runInContext("document.querySelector('#period-form').onsubmit({preventDefault(){}})",context);
assert.equal(cacheRecords.has('selected-account'),true);
assert.equal(vm.runInContext('state.moments.length',context),2,'Initially keep only selected photos, excluding old and future photos');
assert.ok(!JSON.stringify(cacheRecords.get('selected-account').moments).includes('outside'));
assert.equal(historyRequests[0].from,+new TestDate('2026-10-01T00:00:00'));
// Exact date behavior uses browser local midnight, including all of the end date.
const chosen=cacheRecords.get('selected-account').selection;assert.equal(chosen.to,+new TestDate('2026-11-01T00:00:00'));
const initialCalls=historyCalls;
testNow+=5000;await vm.runInContext("activateAccount({uid:'selected-account',name:'Bạn'})",context);
assert.equal(vm.runInContext('state.moments.some(m=>m.id==="new-friend")',context),true);
assert.equal(vm.runInContext('state.moments.some(m=>m.id==="future-own")',context),false);
assert.ok(historyRequests.slice(initialCalls).every(r=>r.from>=baseline),'Later visits only query newly arrived moments');
const persisted=structuredClone(cacheRecords.get('selected-account'));
vm.runInContext('resetData()',context);await vm.runInContext("activateAccount({uid:'selected-account',name:'Bạn'})",context);
assert.equal(vm.runInContext('state.selection.startDay',context),selected.startDay);assert.equal(vm.runInContext('state.moments.length',context),3,'Restore gallery after clearing all in-memory state');
await vm.runInContext("activateAccount({uid:'different-account',name:'Other'})",context);assert.equal(vm.runInContext('state.moments.length',context),0,'Never restore another account gallery');assert.equal(vm.runInContext('state.selection',context),null);
await vm.runInContext("activateAccount({uid:'selected-account',name:'Bạn'})",context);
element('#period-start').value='2026-10-20';element('#period-end').value='2026-10-31';
await vm.runInContext("document.querySelector('#period-form').onsubmit({preventDefault(){}})",context);
assert.equal(vm.runInContext('state.moments.some(m=>m.id==="selected-own")',context),false,'Narrowing selection removes photos outside the new range');
assert.equal(vm.runInContext('state.moments.some(m=>m.id==="new-friend")',context),true,'Preserve new friend photos when changing selected history');
storageDenied=true;element('#period-start').value='2026-10-25';await vm.runInContext("document.querySelector('#period-form').onsubmit({preventDefault(){}})",context);assert.match(element('#period-error').textContent,/Không lưu được/);assert.equal(vm.runInContext('state.selection.startDay',context),'2026-10-20','Failed storage cannot silently replace the saved choice');storageDenied=false;
assert.ok(!JSON.stringify(persisted).includes('password'));
console.log('Selected ranges, persistence, account isolation, incremental friend updates, narrowing and storage errors passed');
