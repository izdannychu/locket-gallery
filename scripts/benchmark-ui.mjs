import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
const elements=new Map();let galleryWrites=0;
function element(id){if(!elements.has(id)){let html='';elements.set(id,{value:id==='#sort'?'new':'',textContent:'',get innerHTML(){return html;},set innerHTML(v){html=v;if(id==='#gallery')galleryWrites++;},classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelectorAll(){return [];},showModal(){},close(){}});}return elements.get(id);}
const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[]},localStorage:{getItem:()=>null,setItem(){}},Date,URL,Intl,AbortController,console,setTimeout:()=>0,clearTimeout(){},fetch:async()=>({ok:false,status:401,json:async()=>({error:'no session'})})});
vm.runInContext((await readFile('src/app.js','utf8'))+'\n'+await readFile('src/swipe-viewer.js','utf8'),context);
await new Promise(resolve=>setImmediate(resolve));
vm.runInContext("state.mode='demo';state.me={uid:'me',name:'Bạn'};state.friends=[{uid:'friend',name:'Linh'}];state.moments=Array.from({length:10000},(_,i)=>normalize({id:'m-'+i,user:i%2?'me':'friend',date:Date.now()-i*60000,image_url:'https://example.com/photo.jpg',caption:'Memory '+i},i))",context);
const measurements={};
for(const [name,code] of [['initial','render()'],['tab_mine',"setView('mine')"],['tab_friends',"setView('friends')"],['tab_all',"setView('all')"],['repeat_render','render()'],['layout',"document.querySelector('#layout').onclick()"]]){const start=performance.now();vm.runInContext(code,context);measurements[name]=Math.round((performance.now()-start)*10)/10;}
const cards=(element('#gallery').innerHTML.match(/class="moment card"/g)||[]).length;
console.log(JSON.stringify({note:'Synthetic DOM harness; scripting time only, not browser paint/network',moments:10000,ms:measurements,renderedCards:cards,galleryWrites},null,2));
