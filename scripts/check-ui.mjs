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
const element=id=>{if(!elements.has(id)){let html='';elements.set(id,{value:id==='#sort'?'new':'',textContent:'',get innerHTML(){return html;},set innerHTML(value){html=value;this.htmlWrites=(this.htmlWrites||0)+1;},hidden:false,disabled:false,classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return[];},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});}return elements.get(id);};
const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>({})},localStorage:{getItem:()=>null,setItem(){}},indexedDB,location:{href:'https://gallery.example'},URL,Date:TestDate,Set,Map,JSON,String,Array,Math,Number,Error,AbortController,console,setTimeout:()=>0,clearTimeout(){},fetch:async()=>({ok:false,status:401,json:async()=>({error:'Not connected'})})});
const workerSource=await readFile('dist/server/index.js','utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64'))).default;
const html=await (await worker.fetch(new Request('https://gallery.example/'))).text();
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';
assert.ok(css.includes('.btn')&&css.includes('.tabs-box')&&css.includes('.loading-spinner'),'Compiled daisyUI components must be present in the served page');
assert.ok(!css.includes('@import "tailwindcss"')&&!css.includes('@plugin "daisyui"'),'UI library must be compiled before serving');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.equal(script,await readFile('src/app.js','utf8'),'Build must preserve the complete browser script byte for byte');
const htmlIDs=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const match of script.matchAll(/\$\(['"]#([a-z][a-z0-9-]*)['"]\)/g))assert.ok(htmlIDs.has(match[1]),'Script must reference an existing UI control: '+match[1]);
vm.runInContext(script,context);
vm.runInContext("document.querySelector('#account').onclick()",context);
assert.equal(element('#connect-dialog').open,true,'Connect button must open the login dialog');
assert.ok(!html.includes('id="import-btn"'));assert.ok(!html.includes('id="import-dialog"'));assert.ok(!html.includes('type="file"'));assert.ok(!script.includes('function importFiles'));assert.ok(!script.includes('function openImport'));
vm.runInContext("document.querySelector('#demo-btn').onclick()",context);
assert.match(element('#gallery').innerHTML,/images.unsplash.com/);assert.equal(element('#stat-moments').textContent,12);assert.equal(element('#dataset-label').textContent,'Ảnh minh họa');
vm.runInContext("setView('mine')",context);assert.equal(element('#visible-count').textContent,3);
vm.runInContext("setView('friends')",context);assert.equal(element('#visible-count').textContent,9);
vm.runInContext("setView('all'); state.type='video'; renderGallery()",context);assert.equal(element('#visible-count').textContent,0);assert.equal(element('#empty').hidden,false);
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
    assert.equal(element('#sync-pending').hidden,false,'Pending notification stays visible while history requests are running');
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
assert.equal(element('#toast-message').textContent,'Đã lưu khoảng đã chọn và cập nhật ảnh mới');
assert.equal(element('#sync-pending').hidden,true,'Finish hides pending before showing the success popup');
assert.match(element('#sync-detail').textContent,/2022/);
failNext=true;vm.runInContext('state.archiveComplete=false',context);await vm.runInContext('sync()',context);
assert.equal(vm.runInContext('state.historyComplete',context),false);
assert.equal(vm.runInContext('state.historyPhase',context),'error');
assert.equal(element('#sync-pending').hidden,true,'An error must not leave a permanent loading notification');
assert.equal(vm.runInContext('state.moments.length',context),2,'Keep already loaded photos after a failure');
assert.equal(element('#retry-history').hidden,false);
await vm.runInContext('sync(true)',context);assert.equal(vm.runInContext('state.historyComplete',context),true);
pauseNext=true;vm.runInContext('state.archiveComplete=false',context);await vm.runInContext('sync()',context);assert.equal(vm.runInContext('state.historyPhase',context),'paused');
assert.equal(element('#sync-pending').hidden,true,'Pause hides the pending notification');
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
vm.runInContext("resetData();state.mode='demo';state.me={uid:'me',name:'Bạn'};state.friends=[{uid:'friend',name:'Linh'}];state.moments=Array.from({length:10000},(_,i)=>normalize({id:'large-'+i,user:i%2?'me':'friend',date:Date.now()-i*60000,image_url:'https://example.com/photo.jpg',caption:'Memory '+i},i));render()",context);
const cards=()=>(element('#gallery').innerHTML.match(/class="moment card"/g)||[]).length;
assert.equal(cards(),60);assert.equal(element('#visible-count').textContent,10000);assert.equal(element('#gallery-pagination').hidden,false);
const writes=element('#gallery').htmlWrites;vm.runInContext('render();renderSync()',context);assert.equal(element('#gallery').htmlWrites,writes,'Status updates must retain existing image nodes');
vm.runInContext("document.querySelector('#layout').onclick()",context);assert.equal(element('#gallery').htmlWrites,writes,'Layout switch must only change CSS classes');
vm.runInContext("document.querySelector('#page-next').onclick()",context);assert.equal(cards(),60);assert.ok(element('#gallery').innerHTML.includes('large-60'));assert.ok(!element('#gallery').innerHTML.includes('data-open="large-0"'));
vm.runInContext("changeGalleryPage(10000)",context);assert.equal(cards(),40);assert.equal(element('#page-next').disabled,true);assert.ok(element('#gallery').innerHTML.includes('large-9999'));
vm.runInContext("setView('mine')",context);assert.equal(element('#visible-count').textContent,5000);assert.equal(vm.runInContext('galleryPage',context),0);assert.equal(cards(),60);
vm.runInContext("setView('all')",context);
const favoriteButton={dataset:{save:'large-0'},classList:{toggle(){}},setAttribute(name,value){this[name]=value;},textContent:''};
const beforeFavorite=element('#gallery').htmlWrites;
context.favoriteButton=favoriteButton;
vm.runInContext("document.querySelector('#gallery').onclick({target:{closest(selector){return selector==='[data-save]'?favoriteButton:null;}}})",context);
assert.equal(element('#gallery').htmlWrites,beforeFavorite,'Favoriting a card must not rebuild the gallery');assert.equal(favoriteButton['aria-pressed'],'true');assert.equal(element('#fav-count').textContent,1);
vm.runInContext("document.querySelector('#gallery').onclick({target:{closest(selector){return selector==='[data-open]'?{dataset:{open:'large-0'}}:null;}}})",context);assert.equal(element('#detail-dialog').open,true);
vm.runInContext("setView('favorites')",context);assert.equal(element('#visible-count').textContent,1);assert.equal(cards(),1);
vm.runInContext("toggleFavorite('large-0')",context);assert.equal(element('#visible-count').textContent,0);
vm.runInContext("setView('all');document.querySelector('#sort').value='old';renderGallery()",context);assert.ok(element('#gallery').innerHTML.includes('data-open="large-9999"'));
console.log('10,000-item gallery: bounded pages, oldest access, stable image nodes, delegated actions and filtering passed');
vm.runInContext("document.querySelector('#sort').value='new';render();document.querySelector('#friend-picker-options').onclick({target:{closest(){return {dataset:{pickerFriend:'friend'}}}}})",context);
assert.equal(vm.runInContext('state.friend',context),'friend');assert.equal(element('#visible-count').textContent,5000,'Phone friend selector must filter the full gallery');
assert.match(element('#friend-picker-value').innerHTML,/Linh/);
vm.runInContext("setView('mine')",context);assert.equal(element('#mobile-friend').value,'','Bottom navigation clears the friend selection');
console.log('Mobile friend filtering and navigation synchronization passed');
const mainHTML=html.match(/<main>[\s\S]*?<\/main>/)?.[0]||'';
const sidebarHTML=html.match(/<aside[\s\S]*?<\/aside>/)?.[0]||'';
const accountHTML=html.match(/<dialog id="account-dialog"[\s\S]*?<\/dialog>/)?.[0]||'';
assert.ok(!sidebarHTML.includes('little-note'),'Remove the sidebar memory note');assert.ok(!sidebarHTML.includes('id="account"'),'Account must leave the sidebar');
assert.match(mainHTML,/<header\b[^>]*>[\s\S]*id="account"/,'Account must appear in the header');
for(const id of ['sync-choice','sync-progress','sync-btn','choose-period','stop-sync','retry-history']){assert.ok(!mainHTML.includes('id="'+id+'"'),'No sync control in main gallery: '+id);assert.ok(accountHTML.includes('id="'+id+'"'),'Account owns sync control: '+id);}
assert.ok(!html.includes('id="connect-top"'));assert.ok(!html.includes('id="load-more"'));
vm.runInContext("state.connected=true;state.mode='live';document.querySelector('#account').onclick()",context);assert.equal(element('#account-dialog').open,true);
vm.runInContext("document.querySelector('#choose-period').onclick()",context);assert.equal(element('#account-dialog').open,false,'Close account before showing period picker');assert.equal(element('#period-dialog').open,true);
console.log('Header account, account-only sync controls and notification flow passed');
vm.runInContext("state.mode='live';state.loading=true;state.historyPhase='loading';state.historyPages=12;renderPending()",context);
assert.equal(element('#sync-pending').hidden,false);assert.match(element('#pending-detail').textContent,/12 trang/);
vm.runInContext("state.historyPages=13;renderPending()",context);assert.match(element('#pending-detail').textContent,/13 trang/);
vm.runInContext("state.loading=false;state.historyPhase='complete';toast('Đã lưu khoảng đã chọn và cập nhật ảnh mới')",context);assert.equal(element('#sync-pending').hidden,true);
console.log('Pending notification: running, live progress, success, pause and error states passed');
assert.ok(!html.includes('type="month"'),'Use the custom picker instead of the native browser month popup');
vm.runInContext("state.loading=false;setView('all');document.querySelector('#sort').value='new';chooseMonth('');document.querySelector('#month-open').onclick()",context);
assert.equal(element('#month-dialog').open,true);assert.equal(element('#month-label').textContent,'Chọn tháng');
assert.equal((element('#month-options').innerHTML.match(/data-month=/g)||[]).length,12);
const initialYear=element('#month-year').textContent;
vm.runInContext("document.querySelector('#month-prev-year').onclick()",context);assert.equal(element('#month-year').textContent,initialYear-1);
vm.runInContext("document.querySelector('#month-next-year').onclick()",context);assert.equal(element('#month-year').textContent,initialYear);
vm.runInContext("document.querySelector('#month-options').onclick({target:{closest(){return {dataset:{month:'2025-07'}}}}})",context);
assert.equal(element('#month').value,'2025-07');assert.equal(element('#month-label').textContent,'Tháng 7 / 2025');assert.equal(element('#month-dialog').open,false);assert.equal(element('#visible-count').textContent,0);
vm.runInContext("document.querySelector('#month-open').onclick()",context);assert.equal(element('#month-year').textContent,2025);assert.match(element('#month-options').innerHTML,/btn-primary[\s\S]*data-month="2025-07"/);
vm.runInContext("document.querySelector('#month-clear').onclick()",context);assert.equal(element('#month').value,'');assert.equal(element('#visible-count').textContent,10000);
vm.runInContext("document.querySelector('#month-current').onclick()",context);assert.equal(element('#month').value,'2026-11');assert.ok(element('#visible-count').textContent>0);
vm.runInContext("monthPickerYear=1970;document.querySelector('#month-prev-year').onclick()",context);assert.equal(element('#month-year').textContent,1970);assert.equal(element('#month-prev-year').disabled,true);
console.log('Custom month picker: twelve months, year navigation, select, reopen, clear and current month passed');
vm.runInContext("state.friends=[{uid:'friend',name:'Linh',avatar:'https://example.com/linh.jpg'},{uid:'no-photo',name:'Minh An'}];setView('all');render();document.querySelector('#friend-picker-options').hidden=true;document.querySelector('#friend-picker-open').onclick()",context);
assert.equal(element('#friend-picker-options').hidden,false);assert.match(element('#friend-picker-options').innerHTML,/linh\.jpg/);assert.match(element('#friend-picker-options').innerHTML,/person-avatar/);assert.match(element('#friend-picker-options').innerHTML,/>A<\/span>/);
vm.runInContext("document.querySelector('#friend-picker-options').onclick({target:{closest(){return {dataset:{pickerFriend:'friend'}}}}})",context);
assert.equal(vm.runInContext('state.friend',context),'friend');assert.match(element('#friend-picker-value').innerHTML,/linh\.jpg/);assert.match(element('#friend-picker-value').innerHTML,/Linh/);assert.equal(element('#friend-picker-options').hidden,true);
vm.runInContext("document.querySelector('#friend-picker-open').onclick()",context);assert.equal(element('#friend-picker-options').hidden,false);assert.match(element('#friend-picker-options').innerHTML,/data-picker-friend="friend" role="menuitemradio" aria-checked="true"/);
vm.runInContext("document.querySelector('#friend-picker-options').onkeydown({key:'Escape',preventDefault(){}})",context);assert.equal(element('#friend-picker-options').hidden,true);
vm.runInContext("document.querySelector('#friend-picker-options').onclick({target:{closest(){return {dataset:{pickerFriend:''}}}}})",context);assert.equal(vm.runInContext('state.friend',context),null);assert.match(element('#friend-picker-value').innerHTML,/Tất cả mọi người/);
vm.runInContext("document.querySelector('#friend-picker-options').onclick({target:{closest(){return {dataset:{pickerFriend:'unknown'}}}}})",context);assert.equal(vm.runInContext('state.friend',context),null,'Unknown IDs must not select an invalid friend');
console.log('Avatar friend picker: photo/name rows, fallback initials, selection, all people and Escape passed');
const triggerHTML=element('#friend-picker-value').innerHTML;
vm.runInContext("document.querySelector('#friend-picker-options').hidden=true;document.querySelector('#friend-picker-open').onclick()",context);
assert.equal(element('#friend-picker-value').innerHTML,triggerHTML,'Opening must not replace the clicked name/avatar');
vm.runInContext("handleFriendPickerOutsideClick({target:{closest(){return null;}},composedPath(){return [document.querySelector('#friend-picker-open')];}})",context);
assert.equal(element('#friend-picker-options').hidden,false,'Clicks on avatar, name or empty button space must stay open while bubbling');
vm.runInContext("document.querySelector('#friend-picker-open').onclick()",context);assert.equal(element('#friend-picker-options').hidden,true,'Click anywhere in the trigger again closes it');
vm.runInContext("document.querySelector('#friend-picker-open').onclick();handleFriendPickerOutsideClick({target:{closest(){return null;}},composedPath(){return [];}})",context);assert.equal(element('#friend-picker-options').hidden,true,'An actual outside click still closes the menu');
console.log('Full trigger click and outside-click bubbling regression passed');
const dropdown=element('#friend-picker-options'),trigger=element('#friend-picker-open'),directions=new Set(),animations=[];
dropdown.style={};dropdown.classList={toggle(name,on){on?directions.add(name):directions.delete(name);},contains(name){return directions.has(name);}};
trigger.getBoundingClientRect=()=>({top:500,bottom:554});trigger.parentElement={getBoundingClientRect:()=>({top:470,bottom:554})};
context.window={innerHeight:800,matchMedia:()=>({matches:false})};
dropdown.animate=(frames,options)=>{let finish;const animation={frames,options,cancel(){this.cancelled=true;},finished:new Promise(resolve=>{finish=resolve;}),finish:()=>finish()};animations.push(animation);return animation;};
dropdown.hidden=true;vm.runInContext("document.querySelector('#friend-picker-open').onclick()",context);
assert.equal(dropdown.style.bottom,'58px','Opening above anchors 4px from the button, excluding its label');assert.equal(dropdown.style.top,'auto');assert.equal(animations.at(-1).options.duration,180);
vm.runInContext('closeFriendPicker()',context);assert.equal(dropdown.hidden,false,'Closing animation finishes before hiding');assert.equal(dropdown.inert,true);assert.equal(animations.at(-1).options.duration,120);
const staleClose=animations.at(-1);vm.runInContext("document.querySelector('#friend-picker-open').onclick()",context);staleClose.finish();await Promise.resolve();assert.equal(dropdown.hidden,false,'Rapid reopening must cancel the stale close');assert.equal(dropdown.inert,false);
vm.runInContext('closeFriendPicker()',context);animations.at(-1).finish();await Promise.resolve();assert.equal(dropdown.hidden,true);
trigger.getBoundingClientRect=()=>({top:100,bottom:154});trigger.parentElement.getBoundingClientRect=()=>({top:70,bottom:154});
vm.runInContext("document.querySelector('#friend-picker-open').onclick()",context);assert.equal(dropdown.style.top,'88px','Opening below also uses a 4px gap');assert.equal(dropdown.style.bottom,'auto');
context.window.matchMedia=()=>({matches:true});vm.runInContext('closeFriendPicker()',context);assert.equal(dropdown.hidden,true,'Reduced motion hides immediately without animation');
console.log('Dropdown spacing, animation lifecycle, fast reopen and reduced-motion checks passed');
