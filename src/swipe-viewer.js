// The viewer snapshots the current order and mounts a bounded three-card stack.
const viewer={items:[],index:0,version:0,busy:false,drag:null,animation:null,frame:null};
function fitViewerMedia(viewportWidth,viewportHeight){
  const side=Math.max(1,Math.min(560,viewportWidth-72,viewportHeight-180));
  return {width:side,height:side};
}
function sizeViewer(){
  if(!viewer.items.length)return;
  const viewport=typeof window!=='undefined'?(window.visualViewport||window):{};
  const width=viewport.width||viewport.innerWidth||440,height=viewport.height||viewport.innerHeight||800;
  // Every moment uses the same square canvas; metadata and captions never resize it.
  const fit=fitViewerMedia(width,height);
  $('#swipe-stage').style.width=fit.width+'px';$('#swipe-stage').style.height=fit.height+'px';
}
const reducedViewerMotion=()=>typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function pauseViewerVideo(){for(const video of $('#swipe-card').querySelectorAll('video'))video.pause();}
function playViewerVideo(){
  if(!$('#detail-dialog').open)return;
  const video=$('#swipe-card').querySelector?.('video');if(!video)return;
  video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;video.controls=false;
  // Muted inline playback works without a second tap on mobile browsers.
  video.play()?.catch(()=>{});
}
function viewerCardHTML(m,back=false){
  const p=person(m.user),image=m.image_url||m.thumbnail_url;
  const media=back
    ?(m.thumbnail_url||image?'<img src="'+esc(m.thumbnail_url||image)+'" alt="" draggable="false" decoding="async">':'')
    :m.video_url?'<video src="'+esc(m.video_url)+'"'+(m.thumbnail_url?' poster="'+esc(m.thumbnail_url)+'"':'')+' autoplay muted loop playsinline preload="auto" disablepictureinpicture disableremoteplayback aria-label="Video khoảnh khắc tự phát"></video>'
    :image?'<img src="'+esc(image)+'" alt="'+esc(m.caption||'Khoảnh khắc của '+p.name)+'" draggable="false" decoding="async">':'<div class="viewer-media-empty">Không tải được ảnh</div>';
  return '<div class="viewer-media">'+media+'</div><div class="viewer-author">'+avatar(p)+'<strong>'+esc(p.name)+'</strong></div>'+(m.caption?'<div class="viewer-caption"><p>'+esc(m.caption)+'</p></div>':'');
}
function liftViewerStack(progress=0){
  const rest=1-Math.max(0,Math.min(1,progress));
  $('#swipe-back').style.transform='translate3d('+(10*rest)+'px,'+(14*rest)+'px,0) rotate('+(2*rest)+'deg) scale('+(1-.03*rest)+')';
  $('#swipe-far').style.transform='translate3d('+(-10*rest)+'px,'+(14+13*rest)+'px,0) rotate('+(-3*rest)+'deg) scale('+(.97-.03*rest)+')';
}
function prepareViewerBack(direction=1){
  for(const [id,offset] of [['#swipe-back',1],['#swipe-far',2]]){
    const m=viewer.items[viewer.index+direction*offset],card=$(id),key=m?String(viewer.index+direction*offset):'';
    card.hidden=!m;if(card.stackKey!==key){card.innerHTML=m?viewerCardHTML(m,true):'';card.stackKey=key;}
  }
  liftViewerStack();
}
function renderViewer(){
  const m=viewer.items[viewer.index];if(!m)return;
  pauseViewerVideo();$('#swipe-card').innerHTML=viewerCardHTML(m);$('#swipe-card').style.transform='';$('#swipe-card').style.opacity='';
  $('#swipe-card').classList.remove('is-dragging');prepareViewerBack();
  $('#swipe-prev').disabled=viewer.index===0;$('#swipe-next').disabled=viewer.index>=viewer.items.length-1;
  $('#swipe-announcement').textContent=person(m.user).name+(m.caption?'. '+m.caption:'');
  sizeViewer();
  playViewerVideo();
}
function releaseViewerPointer(drag){if(drag&&$('#swipe-card').hasPointerCapture?.(drag.id))$('#swipe-card').releasePointerCapture(drag.id);}
function stopViewer(){
  viewer.version++;const drag=viewer.drag;viewer.drag=null;releaseViewerPointer(drag);viewer.animation?.cancel();viewer.animation=null;
  if(viewer.frame!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(viewer.frame);viewer.frame=null;
  pauseViewerVideo();viewer.busy=false;viewer.items=[];$('#swipe-card').innerHTML='';
  for(const id of ['#swipe-back','#swipe-far']){$(id).innerHTML='';$(id).stackKey=null;$(id).hidden=true;}
}
function detail(id){
  const m=collection().byId.get(id);if(!m)return;
  stopViewer();const candidates=filteredCache.source===state.moments?filteredCache.rows:collection().sorted;
  viewer.items=candidates.some(row=>row.id===id)?[...candidates]:[m];viewer.index=viewer.items.findIndex(row=>row.id===id);
  renderViewer();if(!$('#detail-dialog').open){$('#detail-dialog').showModal();playViewerVideo();}sizeViewer();
}
async function animateViewer(frames,options){
  const card=$('#swipe-card');if(!card.animate||reducedViewerMotion())return;
  const animation=card.animate(frames,options);viewer.animation=animation;
  try{await animation.finished;}catch{}finally{if(viewer.animation===animation){animation.cancel();viewer.animation=null;}}
}
async function resetViewerDrag(){
  const version=viewer.version;viewer.busy=true;
  $('#swipe-card').classList.remove('is-dragging');liftViewerStack();
  await animateViewer([{transform:$('#swipe-card').style.transform||'none'},{transform:'translate3d(0,0,0) rotate(0deg)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});
  if(version!==viewer.version)return;$('#swipe-card').style.transform='';$('#swipe-card').classList.remove('is-dragging');viewer.busy=false;
}
async function swipeViewer(direction){
  if(viewer.busy||!viewer.items.length)return;
  const target=viewer.index+direction;if(target<0||target>=viewer.items.length){await resetViewerDrag();return;}
  const version=viewer.version;viewer.busy=true;pauseViewerVideo();prepareViewerBack(direction);
  $('#swipe-card').classList.remove('is-dragging');liftViewerStack(1);
  const card=$('#swipe-card'),width=card.getBoundingClientRect?.().width||420;
  await animateViewer([{transform:card.style.transform||'none',opacity:1},{transform:'translate3d('+(-direction*(width+220))+'px,20px,0) rotate('+(-direction*15)+'deg)',opacity:0}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
  if(version!==viewer.version)return;viewer.index=target;renderViewer();
  await animateViewer([{transform:'translate3d(0,9px,0) scale(.97)',opacity:.85},{transform:'translate3d(0,0,0) scale(1)',opacity:1}],{duration:210,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'});
  if(version===viewer.version)viewer.busy=false;
}
$('#swipe-prev').onclick=()=>swipeViewer(-1);$('#swipe-next').onclick=()=>swipeViewer(1);
$('#detail-dialog').addEventListener('close',stopViewer);
$('#detail-dialog').addEventListener('keydown',e=>{
  if(e.target.closest?.('input,textarea,select'))return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();swipeViewer(e.key==='ArrowRight'?1:-1);}
});
$('#swipe-card').onpointerdown=e=>{
  if(viewer.busy||!viewer.items.length||e.isPrimary===false||(e.pointerType!=='touch'&&e.button!==0)||e.target.closest?.('button,a,input'))return;
  viewer.drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:e.timeStamp,dx:0,dy:0,locked:false};
  // Capture at pointerdown so touch events stay on the card instead of the image.
  $('#swipe-card').setPointerCapture?.(e.pointerId);
};
function drawViewerDrag(){
  viewer.frame=null;const drag=viewer.drag;if(!drag?.locked)return;
  $('#swipe-card').style.transform='translate3d('+drag.dx+'px,'+(drag.dy*.18)+'px,0) rotate('+Math.max(-14,Math.min(14,drag.dx/24))+'deg)';
  const width=$('#swipe-card').getBoundingClientRect?.().width||420;liftViewerStack(Math.abs(drag.dx)/Math.max(1,width*.65));
}
$('#swipe-card').onpointermove=e=>{
  const drag=viewer.drag;if(!drag||drag.id!==e.pointerId)return;
  drag.dx=e.clientX-drag.x;drag.dy=e.clientY-drag.y;
  if(!drag.locked){
    if(Math.abs(drag.dy)>9&&Math.abs(drag.dy)>Math.abs(drag.dx)){viewer.drag=null;releaseViewerPointer(drag);return;}
    if(Math.abs(drag.dx)<8||Math.abs(drag.dx)<Math.abs(drag.dy)*1.1)return;
    drag.locked=true;$('#swipe-card').setPointerCapture?.(e.pointerId);$('#swipe-card').classList.add('is-dragging');prepareViewerBack(drag.dx<0?1:-1);
  }
  if(e.cancelable)e.preventDefault();
  if(typeof requestAnimationFrame==='function'){if(viewer.frame===null)viewer.frame=requestAnimationFrame(drawViewerDrag);}else drawViewerDrag();
};
function finishViewerPointer(e,cancelled=false){
  const drag=viewer.drag;if(!drag||drag.id!==e.pointerId)return;
  if(viewer.frame!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(viewer.frame);viewer.frame=null;
  drawViewerDrag();viewer.drag=null;releaseViewerPointer(drag);
  if(!drag.locked)return;
  const width=$('#swipe-card').getBoundingClientRect?.().width||420,elapsed=Math.max(1,e.timeStamp-drag.start);
  const passed=Math.abs(drag.dx)>Math.min(110,width*.23)||(Math.abs(drag.dx)>35&&Math.abs(drag.dx)/elapsed>.55);
  return !cancelled&&passed?swipeViewer(drag.dx<0?1:-1):resetViewerDrag();
}
$('#swipe-card').onpointerup=e=>finishViewerPointer(e);$('#swipe-card').onpointercancel=e=>finishViewerPointer(e,true);
$('#swipe-card').onlostpointercapture=e=>{if(e.target===$('#swipe-card')&&viewer.drag&&!$('#swipe-card').hasPointerCapture?.(e.pointerId))finishViewerPointer(e,true);};
$('#swipe-card').ondragstart=e=>e.preventDefault();
$('#swipe-card').addEventListener('error',e=>{if(e.target.tagName==='IMG'&&e.target.closest?.('.viewer-media'))e.target.replaceWith(Object.assign(document.createElement('div'),{className:'viewer-media-empty',textContent:'Không tải được ảnh'}));},true);
if(typeof window!=='undefined'){window.addEventListener?.('resize',sizeViewer);window.visualViewport?.addEventListener('resize',sizeViewer);}
