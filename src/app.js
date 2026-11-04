const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const state={mode:'empty',me:{uid:'me',name:'Bạn'},friends:[],moments:[],view:'all',friend:null,type:'all',large:false,connected:false,loading:false,historyComplete:false,historyPhase:'idle',historyError:'',historyPages:0,syncController:null,syncWarnings:[],selection:null,jobs:[],archiveComplete:false,newWatermark:0,storageError:''};
let favorites=new Set();try{favorites=new Set(JSON.parse(localStorage.getItem('locket-favorites')||'[]'));}catch{}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{if(typeof s!=='string'||!s.trim())return '';try{const u=new URL(s);return ['https:','blob:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const names={all:'Tất cả khoảnh khắc',mine:'Locket của tôi',friends:'Từ bạn bè',favorites:'Yêu thích'};
const dateOf=m=>{let d=m.date||m.createdAt||m.created_at;const sec=d?._seconds??d?.seconds;if(sec!=null)return new Date(Number(sec)*1000);if(typeof d==='number'&&d<1e12)d*=1000;const result=new Date(d);return Number.isNaN(+result)?null:result;};
const uidOf=m=>typeof m.user==='object'?m.user.uid:m.user||m.user_uid||m.owner_uid||m.uid||state.me.uid;
const keyOf=m=>state.mode+':'+state.me.uid+':'+m.id;
const person=id=>id===state.me.uid?{...state.me,name:'Bạn'}:state.friends.find(f=>f.uid===id)||{uid:id,name:'Bạn bè'};
const avatar=p=>'<span class="avatar" style="background:'+(['#dedfd1','#ead7c3','#d6dfdd','#e7d9d5'][Math.abs([...String(p.uid)].reduce((n,c)=>n+c.charCodeAt(0),0))%4])+'">'+(safeUrl(p.avatar)?'<img src="'+esc(safeUrl(p.avatar))+'" alt="" loading="lazy">':esc((p.name||'?').split(' ').slice(-1)[0].slice(0,1)))+'</span>';
function normalize(m,i){return {...m,id:String(m.canonical_uid||m.id||m.moment_uid||'import-'+i),user:uidOf(m),image_url:safeUrl(m.image_url||m.imageUrl||m.url||m.thumbnail_url),thumbnail_url:safeUrl(m.thumbnail_url||m.image_url||m.imageUrl||m.url),video_url:safeUrl(m.video_url||m.videoUrl),caption:typeof m.caption==='string'?m.caption:typeof m.caption?.text==='string'?m.caption.text:''};}
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
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
  if(!selection)return false;const date=+dateOf(m);if(!Number.isFinite(date))return false;
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
  render();if(state.selection)await sync();else openPeriod();
}
function dayString(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
function applyPreset(){const days=Number($('#period-preset').value);if(!days)return;const end=new Date(),start=new Date(end.getFullYear(),end.getMonth(),end.getDate());start.setDate(start.getDate()-days+1);$('#period-start').value=dayString(start);$('#period-end').value=dayString(end);}
function openPeriod(){
  if(state.loading){toast('Tạm dừng đồng bộ trước khi đổi khoảng ngày.');return;}
  $('#period-error').textContent='';const today=dayString(new Date());$('#period-start').max=today;$('#period-end').max=today;
  if(state.selection){$('#period-preset').value='custom';$('#period-start').value=state.selection.startDay;$('#period-end').value=state.selection.endDay;}
  else{$('#period-preset').value='30';applyPreset();}
  $('#period-dialog').showModal();
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
['#connect-top','#connect-banner','#empty-connect'].forEach(id=>$(id).onclick=()=>state.connected?sync():openConnect());
$('#show-password').onclick=()=>{const i=$('#password');i.type=i.type==='password'?'text':'password';$('#show-password').textContent=i.type==='password'?'Hiện':'Ẩn';};
$('#login-form').onsubmit=async e=>{e.preventDefault();const button=$('#login-submit');button.disabled=true;button.textContent='Đang kết nối…';$('#login-error').textContent='';try{await api('login',{identifier:$('#identifier').value.trim(),password:$('#password').value});$('#password').value='';const r=await api('session');$('#connect-dialog').close();await activateAccount(r.me);}catch(e){$('#login-error').textContent=e.message;}finally{button.disabled=false;button.textContent='Kết nối tài khoản ↗';}};
function resetData(){state.syncController?.abort();state.moments=[];state.friends=[];state.friend=null;state.historyComplete=false;state.historyPhase='idle';state.historyError='';state.historyPages=0;state.syncWarnings=[];state.selection=null;state.jobs=[];state.archiveComplete=false;state.newWatermark=0;state.storageError='';state.view='all';$('#search').value='';$('#month').value='';state.type='all';$$('[data-type]').forEach(b=>b.classList.toggle('selected',b.dataset.type==='all'));}
function mergeMoments(rows){const moments=new Map(state.moments.filter(m=>state.mode!=='live'||allowedMoment(m)).map(m=>[m.id,m]));for(const row of rows){const m=normalize(row,moments.size);if(state.mode==='live'&&!allowedMoment(m))continue;moments.set(m.id,{...moments.get(m.id),...m});}state.moments=[...moments.values()];}
function renderSync(){
  $('#sync-choice').hidden=state.mode!=='live';
  $('#selection-summary').textContent=state.selection?state.selection.startDay+' → '+state.selection.endDay+' · Thêm ảnh mới của bạn bè từ '+new Date(state.selection.newSince).toLocaleString('vi-VN'):'Chọn khoảng ngày trước khi đồng bộ. Ảnh cũ ngoài khoảng sẽ không được lưu.';
  $('#selection-storage').textContent=state.storageError||'Đã chọn thì giữ cố định · Lưu riêng trên trình duyệt này';$('#choose-period').disabled=state.loading;
  $('#sync-progress').hidden=state.mode!=='live'||state.historyPhase==='idle';
  const dates=state.moments.map(dateOf).filter(d=>d&&Number.isFinite(+d));
  const oldest=dates.length?new Date(dates.reduce((oldest,date)=>Math.min(oldest,+date),Infinity)).toLocaleDateString('vi-VN'):null;
  $('#sync-summary').textContent=state.historyPhase==='complete'?'Đã lưu khoảng đã chọn và cập nhật ảnh mới':state.historyPhase==='error'?'Đồng bộ chưa hoàn tất':state.historyPhase==='paused'?'Đã tạm dừng tải lịch sử':state.jobs[0]?.kind==='new'?'Đang cập nhật ảnh mới của bạn bè…':'Đang tải ảnh trong khoảng đã chọn…';
  $('#sync-detail').textContent=state.moments.length+' khoảnh khắc · '+state.historyPages+' trang lịch sử'+(oldest?' · Ảnh cũ nhất đã tải: '+oldest:'')+(state.historyError?' · '+state.historyError:'')+(state.syncWarnings.length?' · '+state.syncWarnings.join(' '):'');
  $('#stop-sync').hidden=!state.loading;$('#retry-history').hidden=state.loading||state.historyComplete;$('#retry-history').textContent=state.historyPhase==='error'?'Thử tải tiếp':'Tiếp tục tải ảnh cũ';
}
async function sync(resume=false){
  if(!state.connected){openConnect();return;}if(state.loading)return;
  if(!state.selection){openPeriod();return;}
  const controller=new AbortController();state.syncController=controller;const signal=controller.signal;
  state.loading=true;state.historyPhase='loading';state.historyError='';state.syncWarnings=[];
  $('#sync-btn').disabled=true;$('#sync-btn').textContent='↻ Đang tải…';$('#load-more').disabled=true;renderSync();
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
    state.historyComplete=true;state.historyPhase='complete';toast('Đã lưu gallery theo khoảng ngày bạn chọn.');
  }catch(e){if(signal.aborted){if(state.mode==='live')state.historyPhase='paused';}else{state.historyPhase='error';state.historyError=e.message;toast(e.message);}}
  finally{if(state.syncController===controller){state.loading=false;state.syncController=null;$('#sync-btn').disabled=false;$('#sync-btn').textContent='↻ Đồng bộ';$('#load-more').disabled=false;render();}}
}
$('#sync-btn').onclick=()=>sync();$('#load-more').onclick=()=>sync(true);
$('#stop-sync').onclick=()=>state.syncController?.abort();$('#retry-history').onclick=()=>sync(true);
function setView(view,friend=null){state.view=view;state.friend=friend;render();}
$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$$('[data-type]').forEach(b=>b.onclick=()=>{state.type=b.dataset.type;$$('[data-type]').forEach(x=>x.classList.toggle('selected',x===b));renderGallery();});
$('#search').oninput=renderGallery;$('#month').onchange=renderGallery;$('#sort').onchange=renderGallery;$('#layout').onclick=()=>{state.large=!state.large;renderGallery();};
function render(){
  $('#all-count').textContent=state.moments.length||'';$('#fav-count').textContent=state.moments.filter(m=>favorites.has(keyOf(m))).length||'';$('#stat-moments').textContent=state.moments.length;$('#stat-friends').textContent=state.friends.length;$('#friend-count').textContent=state.friends.length;
  const dates=state.moments.map(dateOf).filter(Boolean);$('#stat-days').textContent=dates.length?new Set(dates.map(d=>d.toLocaleDateString('sv-SE'))).size:0;
  $('#dataset-label').textContent=state.mode==='demo'?'Ảnh minh họa':state.mode==='import'?'Dữ liệu đã nhập':state.mode==='live'?'Dữ liệu Locket':'Chưa có dữ liệu';
  $('#connection-status').textContent=state.connected?'● Đã kết nối':state.mode==='demo'?'● Đang xem minh họa':'● Chưa kết nối';$('#connection-status').classList.toggle('connected',state.connected);$('#connect-top').innerHTML=state.connected?'Đồng bộ Locket <span>↻</span>':'Kết nối Locket <span>↗</span>';
  $('#connection-banner').hidden=state.connected;$('#account-name').innerHTML=esc(state.connected?state.me.name:'Góc nhỏ của bạn')+'<small>'+(state.connected?'Đã kết nối Locket':'Chưa kết nối Locket')+'</small>';
  $$('.nav-item').forEach(b=>b.classList.toggle('active',!state.friend&&state.view===b.dataset.view));
  $('#friend-list').innerHTML=state.friends.length?state.friends.map(f=>'<button class="friend '+(state.friend===f.uid?'active':'')+'" data-friend="'+esc(f.uid)+'">'+avatar(f)+esc(f.name)+'<span class="dot"></span></button>').join(''):'<p class="friend-placeholder">Kết nối để gặp lại<br>những gương mặt quen.</p>';
  $$('[data-friend]').forEach(b=>b.onclick=()=>setView('all',b.dataset.friend));renderGallery();renderSync();
}
function renderGallery(){
  const query=$('#search').value.toLocaleLowerCase('vi');const month=$('#month').value;const title=state.friend?person(state.friend).name:names[state.view];$('#breadcrumb').textContent=title;$('#section-heading').innerHTML=esc(title)+' <span id="visible-count"></span>';
  let rows=state.moments.filter(m=>{const own=m.user===state.me.uid,d=dateOf(m),ym=d?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'):'';return (!state.friend||m.user===state.friend)&&(state.view!=='mine'||own)&&(state.view!=='friends'||!own)&&(state.view!=='favorites'||favorites.has(keyOf(m)))&&(state.type==='all'||(state.type==='video'?!!m.video_url:!m.video_url))&&(!month||ym===month)&&(!query||(person(m.user).name+' '+m.caption).toLocaleLowerCase('vi').includes(query));});
  rows.sort((a,b)=>((dateOf(b)?.getTime()||0)-(dateOf(a)?.getTime()||0))*($('#sort').value==='old'?-1:1));$('#visible-count').textContent=rows.length;
  const groups=new Map();for(const m of rows){const d=dateOf(m);const key=d?d.toLocaleDateString('vi-VN',{month:'long',year:'numeric'}):'Chưa có thời gian';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
  $('#gallery').innerHTML=[...groups].map(([date,items])=>'<h3 class="month-heading">'+esc(date[0].toUpperCase()+date.slice(1))+' <small>· '+items.length+' khoảnh khắc</small><span></span></h3><div class="photo-grid '+(state.large?'large':'')+'">'+items.map(m=>{const p=person(m.user),d=dateOf(m);return '<article class="moment"><div class="photo-wrap"><button class="photo-open" data-open="'+esc(m.id)+'" aria-label="Xem khoảnh khắc của '+esc(p.name)+'">'+(m.thumbnail_url||m.image_url?'<img src="'+esc(m.thumbnail_url||m.image_url)+'" alt="'+esc(m.caption||'Khoảnh khắc của '+p.name)+'" loading="lazy">':'<span class="broken-image">'+(m.video_url?'▶ Xem video':'Ảnh chưa có liên kết')+'</span>')+'</button><button class="save-button '+(favorites.has(keyOf(m))?'saved':'')+'" data-save="'+esc(m.id)+'" aria-label="Yêu thích" aria-pressed="'+favorites.has(keyOf(m))+'">'+(favorites.has(keyOf(m))?'♥':'♡')+'</button>'+(m.video_url?'<span class="video-tag">▶ Video</span>':'')+(m.caption?'<span class="caption">'+esc(m.caption)+'</span>':'')+'</div><div class="moment-meta">'+avatar(p)+'<strong>'+esc(p.name)+'</strong>'+(m.user===state.me.uid?'<span class="mine-tag">của tôi</span>':'')+'<time>'+(d?d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})+' · '+d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'Không rõ ngày')+'</time></div></article>';}).join('')+'</div>').join('');
  $('#empty').hidden=!!rows.length;$('#empty h3').textContent=state.moments.length?'Chưa tìm thấy khoảnh khắc phù hợp':'Chưa có khoảnh khắc nào';$('#empty p').textContent=state.moments.length?'Thử thay đổi từ khóa, tháng hoặc bộ lọc của bạn.':state.connected?'Locket chưa trả về ảnh. Hãy đồng bộ lại hoặc nhập bản lưu trữ để bổ sung.':'Kết nối tài khoản hoặc nhập ảnh để bắt đầu góc nhỏ của bạn.';$('#empty-connect').hidden=!!state.moments.length||state.connected;$('#demo-btn').hidden=!!state.moments.length||state.connected;
  $('#gallery-end').hidden=!rows.length;$('#load-more').hidden=!state.connected||state.loading||state.historyComplete;$('#load-more').textContent='Tiếp tục tải lịch sử cũ';
  $$('[data-open]').forEach(b=>b.onclick=()=>detail(b.dataset.open));$$('[data-save]').forEach(b=>b.onclick=()=>{const m=state.moments.find(m=>m.id===b.dataset.save);const key=keyOf(m);favorites.has(key)?favorites.delete(key):favorites.add(key);try{localStorage.setItem('locket-favorites',JSON.stringify([...favorites]));}catch{toast('Trình duyệt không cho lưu mục yêu thích.');}render();});
  $$('.photo-open img').forEach(i=>i.onerror=()=>{i.replaceWith(Object.assign(document.createElement('span'),{className:'broken-image',textContent:'Không tải được ảnh · nhấn để xem chi tiết'}));});
}
function detail(id){const m=state.moments.find(x=>x.id===id);if(!m)return;const p=person(m.user),date=dateOf(m);const media=m.video_url||m.image_url||m.thumbnail_url;$('#detail-content').innerHTML=(m.video_url?'<video class="detail-media" controls playsinline src="'+esc(m.video_url)+'"></video>':media?'<img class="detail-media" src="'+esc(media)+'" alt="'+esc(m.caption)+'">':'<div class="detail-media broken-image">Không có liên kết ảnh</div>')+'<div class="detail-info"><div class="author">'+avatar(p)+'<strong>'+esc(p.name)+'</strong></div><time>'+(date?esc(date.toLocaleString('vi-VN')):'Không có thời gian')+'</time><h3>'+esc(m.caption||'Một khoảnh khắc không cần lời.')+'</h3><dl><dt>Người gửi</dt><dd>'+esc(p.name)+'</dd><dt>Loại khoảnh khắc</dt><dd>'+(m.video_url?'Video':'Ảnh')+'</dd><dt>Mã khoảnh khắc</dt><dd>'+esc(m.id)+'</dd><dt>Nguồn dữ liệu</dt><dd>'+(state.mode==='live'?'Locket':state.mode==='demo'?'Ảnh minh họa':'Tệp đã nhập')+'</dd></dl>'+(media?'<a class="primary" target="_blank" rel="noreferrer" href="'+esc(media)+'">Mở tệp gốc ↗</a>':'')+'<details><summary>Xem tất cả dữ liệu của khoảnh khắc</summary><pre>'+esc(JSON.stringify(m,null,2))+'</pre></details></div>';$('#detail-dialog').showModal();}
function openImport(){if(state.loading){toast('Hãy đợi đồng bộ hoàn tất trước khi nhập dữ liệu.');return;}$('#import-error').textContent='';$('#import-dialog').showModal();}
$('#import-btn').onclick=openImport;$('#open-import').onclick=()=>{$('#connect-dialog').close();openImport();};
async function importFiles(files){try{if(!files.length)return;const result=[],friends=[];let importedMe={uid:'me',name:'Bạn'},skipped=0;for(const file of files){if(file.name.endsWith('.json')){if(file.size>20*1024*1024)throw Error('Tệp JSON quá lớn (tối đa 20 MB).');const data=JSON.parse(await file.text());let rows=Array.isArray(data)?data:data.moments||data.result?.data||data.photos;if(!Array.isArray(rows))throw Error('JSON chưa có danh sách moments, photos hoặc result.data. Cần điều chỉnh bộ đọc theo cấu trúc bản lưu trữ này.');rows.forEach(r=>{if(r&&typeof r==='object')result.push(r);});if(Array.isArray(data.friends))friends.push(...data.friends.filter(f=>f&&typeof f==='object'&&typeof f.uid==='string').map(f=>({uid:f.uid,name:String(f.name||[f.first_name,f.last_name].filter(Boolean).join(' ')||f.uid),avatar:safeUrl(f.avatar||f.profile_picture_url)})));if(data.me?.uid)importedMe={uid:String(data.me.uid),name:String(data.me.name||'Bạn')};}else if(file.type.startsWith('image/')||file.type.startsWith('video/')){const url=URL.createObjectURL(file);result.push({id:crypto.randomUUID(),user:'me',image_url:file.type.startsWith('image/')?url:'',video_url:file.type.startsWith('video/')?url:'',date:file.lastModified,caption:file.name,local_file:true});}else skipped++;}if(!result.length)throw Error('Không tìm thấy ảnh, video hoặc JSON phù hợp.');if(state.connected){await api('logout',{});state.connected=false;}resetData();state.mode='import';state.me=importedMe;state.friends=friends;state.moments=result.map(normalize);const people=new Set(state.moments.map(m=>m.user));people.forEach(uid=>{if(uid!==state.me.uid&&!state.friends.some(f=>f.uid===uid))state.friends.push({uid,name:String(uid)});});render();$('#import-dialog').close();toast('Đã nhập '+result.length+' khoảnh khắc'+(skipped?' · bỏ qua '+skipped+' tệp không hỗ trợ.':'.'));}catch(e){$('#import-error').textContent=e.message;}finally{$('#files').value='';}}
$('#files').onchange=e=>importFiles([...e.target.files]);$('#drop-zone').ondragover=e=>e.preventDefault();$('#drop-zone').ondrop=e=>{e.preventDefault();importFiles([...e.dataTransfer.files]);};
$('#account').onclick=()=>{if(!state.connected){openConnect();return;}$('#account-details').innerHTML='<p><strong>'+esc(state.me.name)+'</strong><br>'+esc(state.me.email||'')+'<br>'+esc(state.me.phone||'')+'</p><p>Mã tài khoản: '+esc(state.me.uid)+'</p><p>Phiên được giữ bằng cookie mã hóa. Ảnh chưa được sao lưu lên máy chủ của website.</p>';$('#account-dialog').showModal();};
$('#logout').onclick=async()=>{try{await api('logout',{});state.connected=false;state.mode='empty';state.me={uid:'me',name:'Bạn'};resetData();render();$('#account-dialog').close();toast('Đã ngắt kết nối và xóa dữ liệu khỏi màn hình.');}catch(e){toast(e.message);}};
$('#demo-btn').onclick=()=>{resetData();state.mode='demo';state.me={uid:'me',name:'Bạn'};state.friends=[{uid:'linh',name:'Khánh Linh'},{uid:'minh',name:'Minh Anh'},{uid:'an',name:'Hoàng An'},{uid:'ha',name:'Hà My'}];const samples=[['photo-1441974231531-c6227db76b6e','Một chút bình yên 🌿','linh'],['photo-1442512595331-e89e73853f31','Cà phê rồi tính ☕','me'],['photo-1470252649378-9c29740c9fa8','Nắng hôm nay đẹp quá','minh'],['photo-1476514525535-07fb3b4ae5f1','Hẹn một ngày đi xa 🏔','an'],['photo-1490750967868-88aa4486c946','Gửi cậu một chút dịu dàng','ha'],['photo-1500534623283-312aade485b7','Trốn phố một hôm','me'],['photo-1518837695005-2083093ee35b','Biển và những ngày lười','linh'],['photo-1464822759023-fed622ff2c3b','Ở đây thật thích','an'],['photo-1509042239860-f550ce710b93','Một ngày chậm thôi','minh'],['photo-1469474968028-56623f02e42e','Đi cùng nhau nhé','me'],['photo-1470770841072-f978cf4d019e','Nhớ những buổi chiều này','ha'],['photo-1519681393784-d120267933ba','Cất một bầu trời vào đây ✨','linh']];state.moments=samples.map((s,i)=>normalize({id:'sample-'+i,user:s[2],image_url:'https://images.unsplash.com/'+s[0]+'?auto=format&fit=crop&w=800&q=85',caption:s[1],date:new Date(2026,10,4-Math.floor(i/3),8+i%9,15).toISOString()},i));render();toast('Đang xem ảnh minh họa. Kết nối để xem dữ liệu Locket của bạn.');};
render();(async()=>{try{const r=await api('session');await activateAccount(r.me);}catch(e){if(e.status!==401)toast(e.message);}})();
if(typeof window!=='undefined'){
  let lastReturnSync=Date.now();
  const syncOnReturn=()=>{if(document.visibilityState==='visible'&&state.connected&&state.selection&&!state.loading&&Date.now()-lastReturnSync>60000){lastReturnSync=Date.now();sync();}};
  window.addEventListener('focus',syncOnReturn);document.addEventListener('visibilitychange',syncOnReturn);
}
