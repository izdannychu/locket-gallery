const API = 'https://api.locketcamera.com/';
const IDENTITY = 'https://www.googleapis.com/identitytoolkit/v3/relyingparty/';
const KEY = 'AIzaSyCQngaaXQIfJaH0aS2l7REgIjD7nL431So'; // Public Firebase application identifier, not a credential.
const baseHeaders = {'content-type':'application/json','x-ios-bundle-identifier':'com.locket.Locket','user-agent':'com.locket.Locket.LocketWidget/1.100.0 iPhone/18.2 hw/iPhone14_3'};
class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const json = (value,status=200,extra={}) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}});
async function upstream(url,body,token){
  const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:{...baseHeaders,...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  let data;try{data=await r.json();}catch{throw new AppError('Locket trả về dữ liệu không hợp lệ. Vui lòng thử lại.',502);}
  if(!r.ok || data.error || (data.result?.status && ![200,304].includes(data.result.status))){
    const code=data.error?.message||'';
    throw new AppError(/PASSWORD|EMAIL|CREDENTIAL|LOGIN/i.test(code)?'Email/số điện thoại hoặc mật khẩu chưa đúng.':r.status===429?'Locket đang giới hạn số yêu cầu. Hãy thử lại sau.':'Locket từ chối yêu cầu hoặc API đã thay đổi. Vui lòng đăng nhập lại hoặc nhập bản lưu trữ.',r.status===401?401:502);
  }return data;
}
function b64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
function unb64(s){return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
async function cryptoKey(secret){if(!secret)throw new AppError('Máy chủ chưa cấu hình SESSION_SECRET.',503);return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(value,env){const iv=crypto.getRandomValues(new Uint8Array(12));return b64(iv)+'.'+b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cryptoKey(env.SESSION_SECRET),new TextEncoder().encode(JSON.stringify(value))));}
async function session(req,env){
  const cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('lg_session='))?.slice(11);
  if(!cookie)throw new AppError('Bạn chưa kết nối Locket.',401);
  try{const [iv,cipher]=cookie.split('.');const s=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await cryptoKey(env.SESSION_SECRET),unb64(cipher))));if(s.until<Date.now()||s.owner!==(req.headers.get('oai-authenticated-user-id')||'local'))throw Error();return s;}catch{throw new AppError('Phiên đã hết hạn. Vui lòng kết nối lại.',401);}
}
function cookie(value,req,age=604800){return 'lg_session='+value+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+age+(new URL(req.url).protocol==='https:'?'; Secure':'');}
async function fresh(s){if(s.expires<Date.now()+60000){const r=await upstream('https://securetoken.googleapis.com/v1/token?key='+KEY,{grantType:'refresh_token',refreshToken:s.refresh});s.token=r.id_token;s.refresh=r.refresh_token;s.expires=Date.now()+Number(r.expires_in)*1000;}return s;}
async function body(req){if(Number(req.headers.get('content-length'))>16384)throw new AppError('Yêu cầu quá lớn.',413);const raw=await req.text();if(raw.length>16384)throw new AppError('Yêu cầu quá lớn.',413);try{return JSON.parse(raw);}catch{throw new AppError('Dữ liệu yêu cầu không hợp lệ.');}}
function firestoreValue(value){
  if('nullValue' in value)return null;
  for(const key of ['stringValue','booleanValue','timestampValue','referenceValue'])if(key in value)return value[key];
  if('integerValue' in value)return Number(value.integerValue);
  if('doubleValue' in value)return value.doubleValue;
  if(value.arrayValue)return (value.arrayValue.values||[]).map(firestoreValue);
  if(value.mapValue)return firestoreFields(value.mapValue.fields||{});
  return null;
}
function firestoreFields(fields){return Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,firestoreValue(value)]));}
async function historyPage(s,input){
  // Locket history is in the named `locket` database, separate from the latest feed.
  const parent='projects/locket-4252a/databases/locket/documents/history/'+s.uid;
  const query={from:[{collectionId:'entries'}],orderBy:[{field:{fieldPath:'date'},direction:'DESCENDING'},{field:{fieldPath:'__name__'},direction:'DESCENDING'}],limit:50};
  if(input.cursor!=null){
    const c=input.cursor;
    if(typeof c.date!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(c.date)||!Number.isFinite(Date.parse(c.date))||typeof c.id!=='string'||!c.id||c.id.length>1500||c.id.includes('/')||['.','..'].includes(c.id))throw new AppError('Mốc lịch sử không hợp lệ.');
    // Include the document ID so equal timestamps cannot skip photos at a page boundary.
    query.startAt={values:[{timestampValue:c.date},{referenceValue:parent+'/entries/'+c.id}],before:false};
  }
  let response;
  try{response=await upstream('https://firestore.googleapis.com/v1/'+parent+':runQuery',{structuredQuery:query},s.token);}
  catch(e){if(e.status===401)throw e;throw new AppError('Không tải được lịch sử Locket. Dữ liệu đã tải vẫn được giữ; bạn có thể thử tiếp tục. Locket có thể giới hạn quyền đọc lịch sử.',e.status===429?429:502);}
  if(!Array.isArray(response)||response.some(row=>row.error))throw new AppError('Locket trả về lịch sử không hợp lệ. Hãy thử lại.',502);
  const docs=response.filter(row=>row.document).map(row=>row.document);
  if(docs.some(doc=>!doc.name?.startsWith(parent+'/entries/')||!doc.fields?.date?.timestampValue))throw new AppError('Lịch sử thiếu mốc thời gian để tải tiếp; chưa thể xác nhận đã tải hết.',502);
  const moments=docs.map(doc=>{const value=firestoreFields(doc.fields||{});const id=doc.name.split('/').pop();return {...value,id:value.canonical_uid||value.moment_uid||id,history_entry_id:id};});
  const last=docs.at(-1);
  // A short page is not proof of completion. Only an empty query confirms the end.
  return {moments,nextCursor:last?{date:last.fields.date.timestampValue,id:last.name.split('/').pop()}:null,complete:docs.length===0};
}
async function handle(req,env){
  const url=new URL(req.url),p=url.pathname;
  if(p==='/' && req.method==='GET')return new Response(HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: blob: data:; media-src https: blob:; connect-src 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; base-uri 'none'; form-action 'self'"}});
  if(!p.startsWith('/api/'))return new Response('Not found',{status:404});
  if(req.method==='POST' && req.headers.get('origin')!==url.origin)throw new AppError('Nguồn yêu cầu không hợp lệ.',403);
  if(p==='/api/login' && req.method==='POST'){
    const b=await body(req);if(typeof b.identifier!=='string'||typeof b.password!=='string'||!b.password||b.identifier.length>254||b.password.length>256)throw new AppError('Hãy nhập tài khoản và mật khẩu.');
    let r;if(b.identifier.includes('@'))r=await upstream(IDENTITY+'verifyPassword?key='+KEY,{email:b.identifier.trim(),password:b.password,returnSecureToken:true,clientType:'CLIENT_TYPE_IOS'});
    else{if(!/^\+[1-9]\d{7,14}$/.test(b.identifier))throw new AppError('Dùng số điện thoại quốc tế, ví dụ +84901234567.');const phone=await upstream(API+'signInWithPhonePassword',{data:{phone:b.identifier,password:b.password}});if(!phone.result?.token)throw new AppError('Không đăng nhập được bằng số điện thoại này.',401);r=await upstream(IDENTITY+'verifyCustomToken?key='+KEY,{token:phone.result.token,returnSecureToken:true});}
    if(!r.idToken||!r.refreshToken)throw new AppError('Locket không cấp phiên đăng nhập.',502);
    const info=await upstream(IDENTITY+'getAccountInfo?key='+KEY,{idToken:r.idToken});const me=info.users?.[0];if(!me?.localId)throw new AppError('Không đọc được tài khoản Locket.',502);
    const s={token:r.idToken,refresh:r.refreshToken,uid:me.localId,expires:Date.now()+Number(r.expiresIn||3600)*1000,until:Date.now()+604800000,owner:req.headers.get('oai-authenticated-user-id')||'local'};
    return json({connected:true},200,{'set-cookie':cookie(await seal(s,env),req)});
  }
  if(p==='/api/logout' && req.method==='POST')return json({ok:true},200,{'set-cookie':cookie('',req,0)});
  const s=await fresh(await session(req,env));let result;
  if(p==='/api/session' && req.method==='GET'){
    const info=await upstream(IDENTITY+'getAccountInfo?key='+KEY,{idToken:s.token});const me=info.users?.[0]||{};
    result={connected:true,me:{uid:s.uid,name:me.displayName||'Bạn',email:me.email,phone:me.phoneNumber,avatar:me.photoUrl||me.profilePicture,createdAt:me.createdAt,lastLoginAt:me.lastLoginAt}};
  }else if(p==='/api/friends' && req.method==='GET'){
    const endpoint='https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents/users/'+encodeURIComponent(s.uid)+'/friends?pageSize=20';
    const page=url.searchParams.get('pageToken');const r=await upstream(endpoint+(page?'&pageToken='+encodeURIComponent(page):''),undefined,s.token);
    const friends=await Promise.all((r.documents||[]).map(async d=>{const uid=d.fields?.user?.stringValue||d.name.split('/').pop();try{const profile=await upstream(API+'fetchUserV2',{data:{user_uid:uid}},s.token);const u=profile.result?.data||{};return {uid,name:[u.first_name,u.last_name].filter(Boolean).join(' ')||u.username||uid,avatar:u.profile_picture_url,username:u.username,sharedHistoryOn:d.fields?.shared_history_on?.timestampValue,createdAt:d.createTime};}catch{return {uid,name:uid,profileUnavailable:true};}}));result={friends,nextPageToken:r.nextPageToken||null};
  }else if(p==='/api/history' && req.method==='POST'){
    result=await historyPage(s,await body(req));
  }else if(p==='/api/feed' && req.method==='POST'){
    const b=await body(req);const users=b.users;if(!Array.isArray(users)||users.length>200||users.some(u=>typeof u!=='string'||u.length>128))throw new AppError('Danh sách người dùng không hợp lệ.');
    const data={users,excluded_users:[],should_count_missed_moments:true};if(typeof b.syncToken==='string'&&b.syncToken.length<1024)data.sync_token=b.syncToken;
    const r=await upstream(API+'getLatestMomentV2',{data},s.token);result={moments:r.result?.data||[],syncToken:r.result?.sync_token||null,status:r.result?.status,missed:r.result?.missed_moments_count};
  }else throw new AppError('Không tìm thấy API.',404);
  return json(result,200,{'set-cookie':cookie(await seal(s,env),req)});
}
export default {async fetch(req,env={}){try{return await handle(req,env);}catch(e){return json({error:e instanceof AppError?e.message:e.name==='TimeoutError'?'Locket phản hồi quá lâu. Hãy thử lại.':'Không thể kết nối Locket lúc này. Vui lòng thử lại.',},e.status||502);}}};
