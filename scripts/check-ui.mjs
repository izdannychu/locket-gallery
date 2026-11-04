// Minimal DOM harness for the browser application; verifies data rendering and filters.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='#sort'?'new':'',textContent:'',innerHTML:'',hidden:false,disabled:false,classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return[];},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);};
const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>({})},localStorage:{getItem:()=>null,setItem(){}},location:{href:'https://gallery.example'},URL,Date,Set,Map,JSON,String,Array,Math,Number,Error,console,setTimeout:()=>0,clearTimeout(){},fetch:async()=>({ok:false,status:401,json:async()=>({error:'Not connected'})})});
vm.runInContext(await readFile('src/app.js','utf8'),context);
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
