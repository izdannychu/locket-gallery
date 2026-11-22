const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const state={mode:'empty',me:{uid:'me',name:'Bạn'},friends:[],moments:[],view:'all',friend:null,type:'all',large:false,connected:false,loading:false,historyComplete:false,historyPhase:'idle',historyError:'',historyPages:0,syncController:null,syncWarnings:[],selection:null,jobs:[],archiveComplete:false,newWatermark:0,storageError:''};
let favorites=new Set();try{favorites=new Set(JSON.parse(localStorage.getItem('locket-favorites')||'[]'));}catch{}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{if(typeof s!=='string'||!s.trim())return '';try{const u=new URL(s);return ['https:','blob:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const names={all:'Khoảnh khắc',mine:'Locket của tôi',friends:'Từ bạn bè',favorites:'Yêu thích'};
const dateOf=m=>{let d=m.date||m.createdAt||m.created_at;const sec=d?._seconds??d?.seconds;if(sec!=null)return new Date(Number(sec)*1000);if(typeof d==='number'&&d<1e12)d*=1000;const result=new Date(d);return Number.isNaN(+result)?null:result;};
const uidOf=m=>typeof m.user==='object'?m.user.uid:m.user||m.user_uid||m.owner_uid||m.uid||state.me.uid;
const keyOf=m=>state.mode+':'+state.me.uid+':'+m.id;
let friendSource,friendIndex=new Map();
function person(id){if(id===state.me.uid)return {...state.me,name:'Bạn'};if(friendSource!==state.friends){friendSource=state.friends;friendIndex=new Map(state.friends.map(f=>[f.uid,f]));}return friendIndex.get(id)||{uid:id,name:'Bạn bè'};}
const PAGE_SIZE=60,metadataCache=new WeakMap();
const monthFormatter=new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric'}),dayFormatter=new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit'}),timeFormatter=new Intl.DateTimeFormat('vi-VN',{hour:'2-digit',minute:'2-digit'});
let galleryPage=0,lastFilterKey='',lastGalleryHTML=null,lastFriendHTML=null,favoriteRevision=0;
let collectionCache={source:null,owner:null},filteredCache={key:null},favoriteCache={key:null};
function metadata(m){let data=metadataCache.get(m);if(!data){const date=dateOf(m),valid=date&&Number.isFinite(+date);const month=valid?date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0'):'';data={date:valid?date:null,time:valid?+date:0,month,day:valid?month+'-'+date.getDate():''};metadataCache.set(m,data);}return data;}
function collection(){if(collectionCache.source!==state.moments||collectionCache.owner!==state.me.uid){const days=new Set();let oldest=Infinity;const byId=new Map();for(const m of state.moments){const data=metadata(m);if(data.date){days.add(data.day);oldest=Math.min(oldest,data.time);}byId.set(m.id,m);}collectionCache={source:state.moments,owner:state.me.uid,byId,days:days.size,oldest:Number.isFinite(oldest)?oldest:null,sorted:[...state.moments].sort((a,b)=>metadata(b).time-metadata(a).time)};}return collectionCache;}
function favoriteCount(){const key=state.mode+':'+state.me.uid+':'+favoriteRevision+':'+favorites.size;if(favoriteCache.source!==state.moments||favoriteCache.key!==key)favoriteCache={source:state.moments,key,count:state.moments.reduce((n,m)=>n+Number(favorites.has(keyOf(m))),0)};return favoriteCache.count;}
function renderNavigation(){ $$('.nav-item').forEach(b=>{const active=!state.friend&&state.view===b.dataset.view;b.classList.toggle('active',active);b.setAttribute?.('aria-current',active?'page':'false');});$$('[data-friend]').forEach(b=>b.classList.toggle('active',state.friend===b.dataset.friend));}
const avatar=p=>'<span class="person-avatar" style="background:'+(['#dedfd1','#ead7c3','#d6dfdd','#e7d9d5'][Math.abs([...String(p.uid)].reduce((n,c)=>n+c.charCodeAt(0),0))%4])+'">'+(safeUrl(p.avatar)?'<img src="'+esc(safeUrl(p.avatar))+'" alt="" loading="lazy">':esc((p.name||'?').split(' ').slice(-1)[0].slice(0,1)))+'</span>';
function normalize(m,i){return {...m,id:String(m.canonical_uid||m.id||m.moment_uid||'moment-'+i),user:uidOf(m),image_url:safeUrl(m.image_url||m.imageUrl||m.url||m.thumbnail_url),thumbnail_url:safeUrl(m.thumbnail_url||m.image_url||m.imageUrl||m.url),video_url:safeUrl(m.video_url||m.videoUrl),caption:typeof m.caption==='string'?m.caption:typeof m.caption?.text==='string'?m.caption.text:''};}
$('#toast').setAttribute?.('popover','manual');
$('#sync-pending').setAttribute?.('popover','manual');
let pendingVisible=false;
function renderPending(){
  const active=state.loading&&state.historyPhase==='loading'&&state.mode==='live';
  if(active){
    $('#pending-detail').textContent=state.historyPages?state.moments.length+' khoảnh khắc · Đã kiểm tra '+state.historyPages+' trang lịch sử':'Đang kết nối và kiểm tra dữ liệu…';
    if(!pendingVisible){$('#sync-pending').hidden=false;$('#sync-pending').showPopover?.();pendingVisible=true;}
  }else if(pendingVisible){$('#sync-pending').hidePopover?.();$('#sync-pending').hidden=true;pendingVisible=false;}
}
function dismissToast(){clearTimeout(toast.timer);$('#toast').classList.remove('show');$('#toast').hidePopover?.();}
function toast(s){renderPending();$('#toast-message').textContent=s;$('#toast').showPopover?.();$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(dismissToast,5000);}
$('#toast-close').onclick=dismissToast;
async function api(path,body,signal){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal});const data=await r.json();if(!r.ok){const e=Error(data.error||'Có lỗi xảy ra.');e.status=r.status;throw e;}return data;}
let cacheDB;
function openCache(){
  if(!cacheDB)cacheDB=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(Error('Trình duyệt không hỗ trợ lưu gallery.'));return;}
    const request=indexedDB.open('locket-gallery-selected',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('galleries');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=request.onblocked=()=>reject(Error('Không mở được bộ nhớ gallery trên trình duyệt.'));
  }).catch(e=>{cacheDB=null;throw e;});return cacheDB;
}
async function cacheRequest(uid,record){
  const db=await openCache();return new Promise((resolve,reject)=>{
    const tx=db.transaction('galleries',record===undefined?'readonly':'readwrite');
    const store=tx.objectStore('galleries'),request=record===undefined?store.get(uid):store.put(record,uid);
    tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(Error('Không lưu được gallery. Hãy kiểm tra dung lượng và quyền lưu dữ liệu của trình duyệt.'));
  });
}
function allowedMoment(m,selection=state.selection){
  if(!selection)return false;const info=metadata(m);if(!info.date)return false;const date=info.time;
  return (date>=selection.from&&date<selection.to)||(m.user!==state.me.uid&&date>=selection.newSince&&date<=Date.now());
}
function cacheRecord(){return {version:1,selection:state.selection,moments:state.moments.filter(m=>allowedMoment(m)),friends:state.friends,jobs:state.jobs,archiveComplete:state.archiveComplete,newWatermark:state.newWatermark,historyPages:state.historyPages};}
async function persistGallery(){try{await cacheRequest(state.me.uid,cacheRecord());state.storageError='';}catch(e){state.storageError=e.message;throw e;}}
async function activateAccount(me){
  resetData();state.connected=true;state.mode='live';state.me=me;
  try{
    const saved=await cacheRequest(me.uid),choice=saved?.selection;
    if(saved?.version===1&&choice&&Number.isSafeInteger(choice.from)&&Number.isSafeInteger(choice.to)&&choice.from>=0&&choice.to>choice.from&&Number.isSafeInteger(choice.newSince)){
      state.selection=choice;state.friends=Array.isArray(saved.friends)?saved.friends:[];
      state.moments=(Array.isArray(saved.moments)?saved.moments:[]).map(normalize).filter(m=>allowedMoment(m));
      state.archiveComplete=saved.archiveComplete===true;state.newWatermark=Math.max(choice.newSince,Number(saved.newWatermark)||choice.newSince);
      state.jobs=(Array.isArray(saved.jobs)?saved.jobs:[]).filter(j=>j&&(j.kind==='selected'&&j.from===choice.from&&j.to===choice.to||j.kind==='new'&&j.from>=choice.newSince-1&&j.to<=Date.now()+1000)&&Number.isSafeInteger(j.from)&&Number.isSafeInteger(j.to)&&j.to>j.from);
      state.historyPages=Number(saved.historyPages)||0;
    }
  }catch(e){state.storageError=e.message;}
  render();if(state.selection)await sync();else openAccount();
}
function dayString(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
function applyPreset(){const days=Number($('#period-preset').value);if(!days)return;const end=new Date(),start=new Date(end.getFullYear(),end.getMonth(),end.getDate());start.setDate(start.getDate()-days+1);$('#period-start').value=dayString(start);$('#period-end').value=dayString(end);}
function openPeriod(){
  if(state.loading){toast('Tạm dừng đồng bộ trước khi đổi khoảng ngày.');return;}
  $('#period-error').textContent='';const today=dayString(new Date());$('#period-start').max=today;$('#period-end').max=today;
  if(state.selection){$('#period-preset').value='custom';$('#period-start').value=state.selection.startDay;$('#period-end').value=state.selection.endDay;}
  else{$('#period-preset').value='30';applyPreset();}
  $('#account-dialog').close();$('#period-dialog').showModal();
}
$('#choose-period').onclick=openPeriod;$('#period-preset').onchange=applyPreset;
['#period-start','#period-end'].forEach(id=>$(id).onchange=()=>{$('#period-preset').value='custom';});
$('#period-form').onsubmit=async e=>{
  e.preventDefault();if(!state.connected){openConnect();return;}const button=$('#period-submit');button.disabled=true;$('#period-error').textContent='';
  try{
    const startDay=$('#period-start').value,endDay=$('#period-end').value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(startDay)||!/^\d{4}-\d{2}-\d{2}$/.test(endDay)||startDay>endDay||endDay>dayString(new Date())||startDay<'1970-01-01')throw Error('Chọn ngày bắt đầu và ngày kết thúc hợp lệ, không ở tương lai.');
    const from=+new Date(startDay+'T00:00:00'),end=new Date(endDay+'T00:00:00');end.setDate(end.getDate()+1);
    if(!Number.isFinite(from)||!Number.isFinite(+end))throw Error('Khoảng ngày không hợp lệ.');
    const selection={from,to:+end,startDay,endDay,newSince:state.selection?.newSince??Date.now()};
    const kept=state.moments.filter(m=>allowedMoment(m,selection));
    const record={version:1,selection,moments:kept,friends:state.friends,jobs:[],archiveComplete:false,newWatermark:state.newWatermark||selection.newSince,historyPages:0};
    // Commit before changing the current gallery, so storage failure preserves the old choice.
    await cacheRequest(state.me.uid,record);
    Object.assign(state,{selection,moments:kept,jobs:[],archiveComplete:false,newWatermark:record.newWatermark,historyPages:0,historyComplete:false,historyPhase:'idle',storageError:''});
    $('#period-dialog').close();render();await sync();
  }catch(e){$('#period-error').textContent=e.message;}finally{button.disabled=false;}
};
function openConnect(){$('#login-error').textContent='';$('#connect-dialog').showModal();}
$$('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>{d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});d.addEventListener('close',()=>{d.querySelectorAll('video').forEach(v=>v.pause());if(d.id==='connect-dialog')$('#password').value='';});});
['#connect-banner','#empty-connect'].forEach(id=>$(id).onclick=()=>state.connected?openAccount():openConnect());
$('#show-password').onclick=()=>{const i=$('#password');i.type=i.type==='password'?'text':'password';$('#show-password').textContent=i.type==='password'?'Hiện':'Ẩn';};
$('#login-form').onsubmit=async e=>{e.preventDefault();const button=$('#login-submit');button.disabled=true;button.textContent='Đang kết nối…';$('#login-error').textContent='';try{await api('login',{identifier:$('#identifier').value.trim(),password:$('#password').value});$('#password').value='';const r=await api('session');$('#connect-dialog').close();await activateAccount(r.me);}catch(e){$('#login-error').textContent=e.message;}finally{button.disabled=false;button.textContent='Kết nối tài khoản';}};
function resetData(){state.syncController?.abort();state.moments=[];state.friends=[];state.friend=null;state.historyComplete=false;state.historyPhase='idle';state.historyError='';state.historyPages=0;state.syncWarnings=[];state.selection=null;state.jobs=[];state.archiveComplete=false;state.newWatermark=0;state.storageError='';state.view='all';$('#month').value='';state.type='all';$$('[data-type]').forEach(b=>{const active=b.dataset.type==='all';b.classList.toggle('selected',active);b.classList.toggle('tab-active',active);b.setAttribute?.('aria-selected',String(active));});}
function mergeMoments(rows){if(!rows.length)return;const moments=new Map(state.moments.filter(m=>state.mode!=='live'||allowedMoment(m)).map(m=>[m.id,m]));for(const row of rows){const m=normalize(row,moments.size);if(state.mode==='live'&&!allowedMoment(m))continue;moments.set(m.id,{...moments.get(m.id),...m});}state.moments=[...moments.values()];}
function renderSync(){
  $('#sync-choice').hidden=state.mode!=='live';
  $('#selection-summary').textContent=state.selection?state.selection.startDay+' → '+state.selection.endDay+' · Thêm ảnh mới của bạn bè từ '+new Date(state.selection.newSince).toLocaleString('vi-VN'):'Chọn khoảng ngày trước khi đồng bộ. Ảnh cũ ngoài khoảng sẽ không được lưu.';
  $('#selection-storage').textContent=state.storageError||'Đã chọn thì giữ cố định · Lưu riêng trên trình duyệt này';$('#choose-period').disabled=state.loading;
  $('#sync-progress').hidden=state.mode!=='live'||state.historyPhase==='idle';
  const first=collection().oldest;
  const oldest=first!==null?new Date(first).toLocaleDateString('vi-VN'):null;
  $('#sync-summary').textContent=state.historyPhase==='complete'?'Đã lưu khoảng đã chọn và cập nhật ảnh mới':state.historyPhase==='error'?'Đồng bộ chưa hoàn tất':state.historyPhase==='paused'?'Đã tạm dừng tải lịch sử':state.jobs[0]?.kind==='new'?'Đang cập nhật ảnh mới của bạn bè…':'Đang tải ảnh trong khoảng đã chọn…';
  $('#sync-detail').textContent=state.moments.length+' khoảnh khắc · '+state.historyPages+' trang lịch sử'+(oldest?' · Ảnh cũ nhất đã tải: '+oldest:'')+(state.historyError?' · '+state.historyError:'')+(state.syncWarnings.length?' · '+state.syncWarnings.join(' '):'');
  $('#stop-sync').hidden=!state.loading;$('#retry-history').hidden=state.loading||state.historyComplete;$('#retry-history').textContent=state.historyPhase==='error'?'Thử tải tiếp':'Tiếp tục tải ảnh cũ';
  renderPending();
}
async function sync(resume=false){
  if(!state.connected){openConnect();return;}if(state.loading)return;
  if(!state.selection){openPeriod();return;}
  const controller=new AbortController();state.syncController=controller;const signal=controller.signal;
  state.loading=true;state.historyPhase='loading';state.historyError='';state.syncWarnings=[];
  dismissToast();$('#sync-btn').disabled=true;$('#sync-btn').textContent='Đang đồng bộ…';renderSync();
  try{
    if(!resume){
      let pageToken=null;const friends=[];const seen=new Set();
      try{do{const r=await api('friends'+(pageToken?'?pageToken='+encodeURIComponent(pageToken):''),undefined,signal);signal.throwIfAborted();friends.push(...r.friends);pageToken=r.nextPageToken;if(pageToken&&seen.has(pageToken))throw Error('Locket lặp lại trang bạn bè.');if(pageToken)seen.add(pageToken);}while(pageToken);state.friends=friends;}
      catch(e){if(signal.aborted)throw e;state.syncWarnings.push('Danh sách bạn bè chưa tải đủ.');}
      // Latest feed is supplementary; failure here must not prevent reading history.
      try{const feed=await api('feed',{users:[]},signal);signal.throwIfAborted();mergeMoments(feed.moments);}
      catch(e){if(signal.aborted)throw e;state.syncWarnings.push('Chưa cập nhật được feed mới nhất.');}
      render();
    }
    if(!state.archiveComplete&&!state.jobs.some(j=>j.kind==='selected'))state.jobs.push({kind:'selected',from:state.selection.from,to:state.selection.to,cursor:null});
    const latestNew=state.jobs.filter(j=>j.kind==='new').at(-1)?.to||state.newWatermark||state.selection.newSince;
    const now=Date.now();if(now>latestNew)state.jobs.push({kind:'new',from:Math.max(state.selection.newSince,latestNew-1),to:now,cursor:null});
    state.historyComplete=false;await persistGallery();const cursors=new Set();
    while(state.jobs.length){
      signal.throwIfAborted();
      const job=state.jobs[0];const page=await api('history',{cursor:job.cursor,from:job.from,to:job.to},signal);signal.throwIfAborted();
      if(!Array.isArray(page.moments)||typeof page.complete!=='boolean')throw Error('Lịch sử trả về không hợp lệ.');
      mergeMoments(page.moments);state.historyPages++;
      if(page.complete){if(page.moments.length)throw Error('Locket trả về trạng thái lịch sử không nhất quán.');if(job.kind==='selected')state.archiveComplete=true;else state.newWatermark=job.to;state.jobs.shift();cursors.clear();}
      else{const next=page.nextCursor,signature=JSON.stringify(next);if(!next||signature===JSON.stringify(job.cursor)||cursors.has(signature))throw Error('Locket lặp lại mốc tải ảnh; chưa thể xác nhận đã tải hết.');cursors.add(signature);job.cursor=next;}
      await persistGallery();signal.throwIfAborted();render();
    }
    state.historyComplete=true;state.historyPhase='complete';toast('Đã lưu khoảng đã chọn và cập nhật ảnh mới');
  }catch(e){if(signal.aborted){if(state.mode==='live')state.historyPhase='paused';}else{state.historyPhase='error';state.historyError=e.message;toast(e.message);}}
  finally{if(state.syncController===controller){state.loading=false;state.syncController=null;$('#sync-btn').disabled=false;$('#sync-btn').textContent='Đồng bộ ngay';render();}}
}
$('#sync-btn').onclick=()=>sync();
$('#stop-sync').onclick=()=>state.syncController?.abort();$('#retry-history').onclick=()=>sync(true);
function setView(view,friend=null){closeFriendPicker();if(state.view===view&&state.friend===friend)return;state.view=view;state.friend=friend;renderFriendPicker();renderNavigation();renderGallery();}
function pickerPerson(uid){return uid?person(uid):{uid:'everyone',name:'Tất cả mọi người'};}
function pickerAvatar(p){return p.uid==='everyone'?'<span class="person-avatar picker-everyone"><svg class="icon" aria-hidden="true"><use href="#i-users"/></svg></span>':avatar(p);}
function renderFriendPicker(){
  const selected=pickerPerson(state.friend);$('#mobile-friend').value=state.friend||'';
  $('#friend-picker-value').innerHTML=pickerAvatar(selected)+'<span class="picker-person-name">'+esc(selected.name)+'</span>';
  $('#friend-picker-options').innerHTML=[{uid:'',name:'Tất cả mọi người'},...state.friends].map(f=>{
    const active=(state.friend||'')===f.uid,p=pickerPerson(f.uid);
    return '<button type="button" class="friend-picker-option'+(active?' is-selected':'')+'" data-picker-friend="'+esc(f.uid)+'" role="menuitemradio" aria-checked="'+active+'">'+pickerAvatar(p)+'<span class="picker-person-name">'+esc(p.name)+'</span>'+(active?'<span class="picker-check" aria-hidden="true">✓</span>':'')+'</button>';
  }).join('');
}
let friendPickerAnimation=null,friendPickerClosing=false;
function animateFriendPicker(open){
  const menu=$('#friend-picker-options');friendPickerAnimation?.cancel();friendPickerAnimation=null;
  const reduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(!menu.animate||reduced){if(!open)menu.hidden=true;friendPickerClosing=false;return;}
  const offset=menu.classList.contains('opens-up')?5:-5;
  const expanded={opacity:1,transform:'translateY(0) scale(1)'},collapsed={opacity:0,transform:'translateY('+offset+'px) scale(.985)'};
  const animation=menu.animate(open?[collapsed,expanded]:[expanded,collapsed],{duration:open?180:120,easing:open?'cubic-bezier(.16,1,.3,1)':'ease-in',fill:'both'});friendPickerAnimation=animation;
  animation.finished.then(()=>{if(friendPickerAnimation!==animation)return;if(!open)menu.hidden=true;animation.cancel();friendPickerAnimation=null;friendPickerClosing=false;},()=>{});
}
function closeFriendPicker(restoreFocus=false){const menu=$('#friend-picker-options');$('#friend-picker-open').setAttribute?.('aria-expanded','false');if(!menu.hidden&&!friendPickerClosing){friendPickerClosing=true;menu.inert=true;animateFriendPicker(false);}if(restoreFocus)$('#friend-picker-open').focus?.();}
$('#friend-picker-open').onclick=()=>{
  if(!$('#friend-picker-options').hidden&&!friendPickerClosing){closeFriendPicker();return;}
  // Keep the clicked avatar/name nodes intact while this click is bubbling.
  const menu=$('#friend-picker-options');menu.hidden=false;menu.inert=false;friendPickerClosing=false;$('#friend-picker-open').setAttribute?.('aria-expanded','true');
  if(typeof window!=='undefined'){
    const rect=$('#friend-picker-open').getBoundingClientRect(),below=window.innerHeight-rect.bottom-95,above=rect.top-16;
    const upward=below<240&&above>below,container=$('#friend-picker-open').parentElement.getBoundingClientRect();
    menu.classList.toggle('opens-up',upward);menu.style.maxHeight=Math.max(100,Math.min(360,upward?above:below))+'px';
    // Anchor to the actual button rather than the wrapper, which also includes its label.
    menu.style.top=upward?'auto':rect.bottom-container.top+4+'px';
    menu.style.bottom=upward?container.bottom-rect.top+4+'px':'auto';
  }
  animateFriendPicker(true);
};
$('#friend-picker-options').onclick=e=>{const button=e.target.closest('[data-picker-friend]');if(!button)return;const uid=button.dataset.pickerFriend;if(uid&&!state.friends.some(f=>f.uid===uid))return;setView('all',uid||null);closeFriendPicker(true);};
$('#friend-picker-options').onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();closeFriendPicker(true);return;}
  const buttons=Array.from($('#friend-picker-options').querySelectorAll('[data-picker-friend]')),index=buttons.indexOf(document.activeElement);
  const next=e.key==='ArrowDown'?(index+1)%buttons.length:e.key==='ArrowUp'?(index-1+buttons.length)%buttons.length:e.key==='Home'?0:e.key==='End'?buttons.length-1:null;
  if(next!==null&&buttons.length){e.preventDefault();buttons[next].focus();}
};
$('#friend-picker-open').onkeydown=e=>{if(e.key==='Escape')closeFriendPicker();else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if($('#friend-picker-options').hidden)$('#friend-picker-open').onclick();const buttons=$('#friend-picker-options').querySelectorAll('[data-picker-friend]');(e.key==='ArrowUp'?buttons[buttons.length-1]:buttons[0])?.focus();}};
function handleFriendPickerOutsideClick(e){
  // composedPath keeps the original ancestry even if a render replaces a child.
  const path=e.composedPath?.()||[];
  if(path.includes($('#friend-picker-open'))||path.includes($('#friend-picker-options'))||e.target.closest?.('.friend-picker'))return;
  closeFriendPicker();
}
document.addEventListener?.('click',handleFriendPickerOutsideClick);
for(const id of ['#friend-picker-options','#friend-picker-value'])$(id).addEventListener('error',e=>{const img=e.target;if(img.tagName==='IMG'){const holder=img.closest('.person-avatar'),uid=img.closest('[data-picker-friend]')?.dataset.pickerFriend||state.friend;holder.textContent=(pickerPerson(uid).name||'?').split(' ').slice(-1)[0].slice(0,1);}},true);
let monthPickerYear=new Date().getFullYear();
function updateMonthLabel(){
  const value=$('#month').value,valid=/^\d{4}-\d{2}$/.test(value);
  $('#month-label').textContent=valid?'Tháng '+Number(value.slice(5))+' / '+value.slice(0,4):'Chọn tháng';
  $('#month-open').classList.toggle('has-month',valid);
  $('#month-open').setAttribute?.('aria-label',valid?'Lọc theo tháng: '+$('#month-label').textContent:'Lọc theo tháng');
}
function renderMonthPicker(){
  $('#month-year').textContent=monthPickerYear;
  $('#month-prev-year').disabled=monthPickerYear<=1970;$('#month-next-year').disabled=monthPickerYear>=9999;
  const current=new Date(),selected=$('#month').value;
  $('#month-options').innerHTML=Array.from({length:12},(_,index)=>{
    const month=index+1,value=monthPickerYear+'-'+String(month).padStart(2,'0'),active=value===selected,today=monthPickerYear===current.getFullYear()&&month===current.getMonth()+1;
    return '<button type="button" class="btn month-option '+(active?'btn-primary':'btn-ghost')+(today?' is-current':'')+'" data-month="'+value+'" aria-pressed="'+active+'" aria-label="Tháng '+month+' năm '+monthPickerYear+'"><span>Tháng '+month+'</span>'+(today?'<span class="month-today-dot" aria-hidden="true"></span>':'')+'</button>';
  }).join('');
}
function chooseMonth(value){$('#month').value=value;$('#month-dialog').close();renderGallery();}
$('#month-open').onclick=()=>{const selected=$('#month').value;monthPickerYear=/^\d{4}-\d{2}$/.test(selected)?Number(selected.slice(0,4)):new Date().getFullYear();renderMonthPicker();$('#month-dialog').showModal();};
$('#month-prev-year').onclick=()=>{monthPickerYear=Math.max(1970,monthPickerYear-1);renderMonthPicker();};
$('#month-next-year').onclick=()=>{monthPickerYear=Math.min(9999,monthPickerYear+1);renderMonthPicker();};
$('#month-options').onclick=e=>{const button=e.target.closest('[data-month]');if(button&&/^\d{4}-(0[1-9]|1[0-2])$/.test(button.dataset.month))chooseMonth(button.dataset.month);};
$('#month-clear').onclick=()=>chooseMonth('');$('#month-current').onclick=()=>{const now=new Date();chooseMonth(now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0'));};
$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$$('[data-type]').forEach(b=>b.onclick=()=>{state.type=b.dataset.type;$$('[data-type]').forEach(x=>{x.classList.toggle('selected',x===b);x.classList.toggle('tab-active',x===b);x.setAttribute?.('aria-selected',String(x===b));});renderGallery();});
$('#month').onchange=renderGallery;$('#sort').onchange=renderGallery;$('#layout').onclick=()=>{state.large=!state.large;$('#layout').setAttribute?.('aria-pressed',String(state.large));$$('.photo-grid').forEach(grid=>grid.classList.toggle('large',state.large));};
function render(){
  $('#all-count').textContent=state.moments.length||'';$('#fav-count').textContent=favoriteCount()||'';$('#stat-moments').textContent=state.moments.length;$('#stat-friends').textContent=state.friends.length;$('#friend-count').textContent=state.friends.length;
  $('#stat-days').textContent=collection().days;
  $('#dataset-label').textContent=state.mode==='demo'?'Ảnh minh họa':state.mode==='live'?'Dữ liệu Locket':'Chưa có dữ liệu';
  $('#connection-status').textContent=state.connected?'● Đã kết nối':state.mode==='demo'?'● Đang xem minh họa':'● Chưa kết nối';$('#connection-status').classList.toggle('connected',state.connected);
  $('#connection-banner').hidden=state.connected;$('#account-name').innerHTML=esc(state.connected?state.me.name:'Góc nhỏ của bạn')+'<small>'+(state.connected?'Đã kết nối Locket':'Chưa kết nối Locket')+'</small>';
  const friendHTML=state.friends.length?state.friends.map(f=>'<button class="friend" data-friend="'+esc(f.uid)+'">'+avatar(f)+esc(f.name)+'<span class="dot"></span></button>').join(''):'<p class="friend-placeholder">Kết nối để gặp lại<br>những gương mặt quen.</p>';
  if(friendHTML!==lastFriendHTML){$('#friend-list').innerHTML=friendHTML;lastFriendHTML=friendHTML;}
  renderFriendPicker();
  renderNavigation();renderGallery();renderSync();
}
let galleryPageCount=1;
function renderGallery(){
  updateMonthLabel();
  const month=$('#month').value,sort=$('#sort').value;
  const title=state.friend?person(state.friend).name:names[state.view];$('#breadcrumb').textContent=title;
  const filterKey=JSON.stringify([state.mode,state.me.uid,state.view,state.friend,state.type,month,sort,state.view==='favorites'?favoriteRevision:0,state.view==='favorites'?favorites.size:0]);
  if(filterKey!==lastFilterKey){galleryPage=0;lastFilterKey=filterKey;}
  if(filteredCache.source!==state.moments||filteredCache.friends!==state.friends||filteredCache.key!==filterKey){
    let rows=collection().sorted;
    if(state.friend||state.view!=='all'||state.type!=='all'||month)rows=rows.filter(m=>{
      const own=m.user===state.me.uid;
      return (!state.friend||m.user===state.friend)&&(state.view!=='mine'||own)&&(state.view!=='friends'||!own)&&(state.view!=='favorites'||favorites.has(keyOf(m)))&&(state.type==='all'||(state.type==='video'?!!m.video_url:!m.video_url))&&(!month||metadata(m).month===month);
    });
    filteredCache={source:state.moments,friends:state.friends,key:filterKey,rows:sort==='old'?[...rows].reverse():rows};
  }
  const rows=filteredCache.rows;
  $('#section-heading').innerHTML=esc(title)+' <span id="visible-count">'+rows.length+'</span>';
  $('#visible-count').textContent=rows.length;
  galleryPageCount=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));galleryPage=Math.min(galleryPage,galleryPageCount-1);
  const pageRows=rows.slice(galleryPage*PAGE_SIZE,(galleryPage+1)*PAGE_SIZE),groups=new Map();
  for(const m of pageRows){const data=metadata(m);if(!data.monthLabel)data.monthLabel=data.date?monthFormatter.format(data.date):'Chưa có thời gian';if(!groups.has(data.monthLabel))groups.set(data.monthLabel,[]);groups.get(data.monthLabel).push(m);}
  const html=[...groups].map(([date,items])=>'<h3 class="month-heading">'+esc(date[0].toUpperCase()+date.slice(1))+' <small>· '+items.length+' khoảnh khắc</small><span></span></h3><div class="photo-grid">'+items.map(m=>{
    const p=person(m.user),data=metadata(m);if(!data.timeLabel)data.timeLabel=data.date?dayFormatter.format(data.date)+' · '+timeFormatter.format(data.date):'Không rõ ngày';
    return '<article class="moment card"><div class="photo-wrap"><button class="photo-open" data-open="'+esc(m.id)+'" aria-label="Xem khoảnh khắc của '+esc(p.name)+'">'+(m.thumbnail_url||m.image_url?'<img src="'+esc(m.thumbnail_url||m.image_url)+'" alt="'+esc(m.caption||'Khoảnh khắc của '+p.name)+'" loading="lazy" decoding="async" width="480" height="480">':'<span class="broken-image">'+(m.video_url?'▶ Xem video':'Ảnh chưa có liên kết')+'</span>')+'</button><button class="btn btn-circle save-button '+(favorites.has(keyOf(m))?'saved':'')+'" data-save="'+esc(m.id)+'" aria-label="Yêu thích" aria-pressed="'+favorites.has(keyOf(m))+'">'+(favorites.has(keyOf(m))?'♥':'♡')+'</button>'+(m.video_url?'<span class="video-tag">▶ Video</span>':'')+(m.caption?'<span class="caption">'+esc(m.caption)+'</span>':'')+'</div><div class="moment-meta">'+avatar(p)+'<strong>'+esc(p.name)+'</strong>'+(m.user===state.me.uid?'<span class="badge mine-tag">của tôi</span>':'')+'<time>'+esc(data.timeLabel)+'</time></div></article>';
  }).join('')+'</div>').join('');
  if(html!==lastGalleryHTML){$('#gallery').innerHTML=html;lastGalleryHTML=html;$$('.photo-grid').forEach(grid=>grid.classList.toggle('large',state.large));}
  $('#gallery-pagination').hidden=rows.length<=PAGE_SIZE;$('#page-prev').disabled=galleryPage===0;$('#page-next').disabled=galleryPage>=galleryPageCount-1;
  $('#page-label').textContent='Trang '+(galleryPage+1)+' / '+galleryPageCount+' · '+(rows.length?galleryPage*PAGE_SIZE+1:0)+'–'+Math.min((galleryPage+1)*PAGE_SIZE,rows.length)+' / '+rows.length+' khoảnh khắc';
  $('#empty').hidden=!!rows.length;$('#empty h3').textContent=state.moments.length?'Chưa tìm thấy khoảnh khắc phù hợp':'Chưa có khoảnh khắc nào';$('#empty p').textContent=state.moments.length?'Thử thay đổi tháng hoặc bộ lọc của bạn.':state.connected?'Chưa có khoảnh khắc trong khoảng đã chọn. Mở tài khoản để kiểm tra đồng bộ hoặc đổi khoảng ngày.':'Kết nối tài khoản Locket để bắt đầu góc nhỏ của bạn.';$('#empty-connect').hidden=!!state.moments.length||state.connected;$('#demo-btn').hidden=!!state.moments.length||state.connected;
  $('#gallery-end').hidden=!rows.length;
}
function changeGalleryPage(delta){galleryPage=Math.max(0,Math.min(galleryPage+delta,galleryPageCount-1));renderGallery();$('#gallery').scrollIntoView?.({block:'start'});}
$('#page-prev').onclick=()=>changeGalleryPage(-1);$('#page-next').onclick=()=>changeGalleryPage(1);
function toggleFavorite(id,button){
  const m=collection().byId.get(id);if(!m)return;const key=keyOf(m);favorites.has(key)?favorites.delete(key):favorites.add(key);favoriteRevision++;
  try{localStorage.setItem('locket-favorites',JSON.stringify([...favorites]));}catch{toast('Trình duyệt không cho lưu mục yêu thích.');}
  $('#fav-count').textContent=favoriteCount()||'';
  if(state.view==='favorites')renderGallery();else if(button){const saved=favorites.has(key);button.classList.toggle('saved',saved);button.setAttribute('aria-pressed',String(saved));button.textContent=saved?'♥':'♡';lastGalleryHTML=null;}
}
$('#gallery').onclick=e=>{const save=e.target.closest('[data-save]');if(save){toggleFavorite(save.dataset.save,save);return;}const open=e.target.closest('[data-open]');if(open)detail(open.dataset.open);};
$('#gallery').addEventListener('error',e=>{const image=e.target;if(image.matches?.('.photo-open img'))image.replaceWith(Object.assign(document.createElement('span'),{className:'broken-image',textContent:'Không tải được ảnh · nhấn để xem chi tiết'}));},true);
$('#friend-list').onclick=e=>{const button=e.target.closest('[data-friend]');if(button)setView('all',button.dataset.friend);};


function openAccount(){if(!state.connected){openConnect();return;}$('#account-details').innerHTML='<p><strong>'+esc(state.me.name)+'</strong><br>'+esc(state.me.email||'')+'<br>'+esc(state.me.phone||'')+'</p><p class="account-id">Mã tài khoản: '+esc(state.me.uid)+'</p>';renderSync();$('#account-dialog').showModal();}
$('#account').onclick=openAccount;
$('#logout').onclick=async()=>{try{await api('logout',{});state.connected=false;state.mode='empty';state.me={uid:'me',name:'Bạn'};resetData();render();$('#account-dialog').close();toast('Đã ngắt kết nối và xóa dữ liệu khỏi màn hình.');}catch(e){toast(e.message);}};
$('#demo-btn').onclick=()=>{resetData();state.mode='demo';state.me={uid:'me',name:'Bạn'};state.friends=[{uid:'linh',name:'Khánh Linh'},{uid:'minh',name:'Minh Anh'},{uid:'an',name:'Hoàng An'},{uid:'ha',name:'Hà My'}];const samples=[['photo-1441974231531-c6227db76b6e','Một chút bình yên 🌿','linh'],['photo-1442512595331-e89e73853f31','Cà phê rồi tính ☕','me'],['photo-1470252649378-9c29740c9fa8','Nắng hôm nay đẹp quá','minh'],['photo-1476514525535-07fb3b4ae5f1','Hẹn một ngày đi xa 🏔','an'],['photo-1490750967868-88aa4486c946','Gửi cậu một chút dịu dàng','ha'],['photo-1500534623283-312aade485b7','Trốn phố một hôm','me'],['photo-1518837695005-2083093ee35b','Biển và những ngày lười','linh'],['photo-1464822759023-fed622ff2c3b','Ở đây thật thích','an'],['photo-1509042239860-f550ce710b93','Một ngày chậm thôi','minh'],['photo-1469474968028-56623f02e42e','Đi cùng nhau nhé','me'],['photo-1470770841072-f978cf4d019e','Nhớ những buổi chiều này','ha'],['photo-1519681393784-d120267933ba','Cất một bầu trời vào đây ✨','linh']];state.moments=samples.map((s,i)=>normalize({id:'sample-'+i,user:s[2],image_url:'https://images.unsplash.com/'+s[0]+'?auto=format&fit=crop&w=800&q=85',caption:s[1],date:new Date(2026,10,4-Math.floor(i/3),8+i%9,15).toISOString()},i));render();toast('Đang xem ảnh minh họa. Kết nối để xem dữ liệu Locket của bạn.');};
render();(async()=>{try{const r=await api('session');await activateAccount(r.me);}catch(e){if(e.status!==401)toast(e.message);}})();
if(typeof window!=='undefined'){
  let lastReturnSync=Date.now();
  const syncOnReturn=()=>{if(document.visibilityState==='visible'&&state.connected&&state.selection&&!state.loading&&Date.now()-lastReturnSync>60000){lastReturnSync=Date.now();sync();}};
  window.addEventListener('focus',syncOnReturn);document.addEventListener('visibilitychange',syncOnReturn);
}
