import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture({url='https://pxguide.zeromorow.chatgpt.site/products/',referrer='',state=null,prior=0,storage=new Map()}={}){
 const events={},docEvents={},dialogs=[],moves=[];let backCalls=0,scroll=0;
 const on=(map,k,fn)=>(map[k]??=[]).push(fn),fire=(map,k,e={})=>(map[k]||[]).forEach(fn=>fn(e));
 const location={href:url,assign(to){moves.push(['assign',to]);},replace(to){moves.push(['replace',to]);}};
 function setUrl(next){const u=new URL(next,location.href);Object.assign(location,{href:u.href,origin:u.origin,pathname:u.pathname,search:u.search});}setUrl(url);
 const entries=[...Array.from({length:prior},()=>({url:'https://outside.example/',state:null})),{url,state}];let index=entries.length-1;
 const history={get state(){return entries[index].state;},get length(){return entries.length;},replaceState(s,unused,next){setUrl(next);entries[index]={state:s,url:location.href};},pushState(s,unused,next){setUrl(next);entries.splice(index+1);entries.push({state:s,url:location.href});index++;},back(){backCalls++;if(index){index--;setUrl(entries[index].url);fire(events,'popstate',{state:history.state});}},forward(){if(index<entries.length-1){index++;setUrl(entries[index].url);fire(events,'popstate',{state:history.state});}}};
 const window={scrollY:0,addEventListener:(k,fn)=>on(events,k,fn),scrollTo:({top})=>{scroll=top;window.scrollY=top;}};
 const document={referrer,querySelector:s=>s==='dialog[open]'?dialogs.find(d=>d.open)||null:null,addEventListener:(k,fn)=>on(docEvents,k,fn)};
 vm.runInNewContext(fs.readFileSync('app-navigation.js','utf8'),{window,document,location,history,URL,URLSearchParams,FormData,Date,Math,Set,Map,requestAnimationFrame:fn=>fn(),sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 function dialog(){const listeners={};const d={dataset:{},open:false,addEventListener:(k,fn)=>on(listeners,k,fn),showModal(){this.open=true;},close(){this.open=false;fire(listeners,'close');}};dialogs.push(d);return d;}
 function clickLink(href,extra={}){const link={href,target:'',hasAttribute:()=>false};const event={target:{closest:s=>s==='a[href]'?link:null},button:0,preventDefault(){this.defaultPrevented=true;},...extra};fire(events,'click',event);return event;}
 return {nav:window.pxNavigation,history,location,window,storage,dialog,moves,clickLink,entries,fire:(k,e)=>fire(events,k,e),docFire:(k,e)=>fire(docEvents,k,e),backCalls:()=>backCalls,scroll:()=>scroll};
}
test('direct entry falls back to home instead of going to unrelated external history',()=>{
 const f=fixture({prior:4,referrer:'https://outside.example/'});f.nav.back();assert.deepEqual(f.moves,[['assign','/']]);assert.equal(f.backCalls(),0);
});
test('internal navigation records a safe return route and restores the list scroll',()=>{
 const a=fixture();a.window.scrollY=640;a.clickLink('https://pxguide.zeromorow.chatgpt.site/products/item/');
 const b=fixture({url:'https://pxguide.zeromorow.chatgpt.site/products/item/',prior:1,storage:a.storage});assert.equal(b.history.state.pxNav.depth,1);
 const saved=JSON.parse(a.storage.get('px-navigation-scroll-v1:'+a.history.state.pxNav.id));assert.equal(saved.y,640);
 a.nav.restoreScroll();assert.equal(a.scroll(),640);
});
test('open popups consume back once, can reopen forward, and repeated openings stay consistent',()=>{
 const f=fixture(),dialog=f.dialog();f.nav.openDialog(dialog);assert(dialog.open);assert(f.history.state.pxPopup);
 f.nav.back();assert(!dialog.open);assert.equal(f.backCalls(),1);
 f.history.forward();assert(dialog.open);f.nav.back();assert(!dialog.open);
 f.nav.openDialog(dialog);f.nav.back();assert(!dialog.open);f.history.forward();assert(dialog.open);
});
test('detail navigation replaces the popup entry to avoid a duplicate list stop',()=>{
 const f=fixture(),dialog=f.dialog();f.nav.openDialog(dialog);const event=f.clickLink('https://pxguide.zeromorow.chatgpt.site/products/item/');assert(event.defaultPrevented);assert(!dialog.open);
 assert.deepEqual(f.moves,[['replace','https://pxguide.zeromorow.chatgpt.site/products/item/']]);
 const pending=JSON.parse(f.storage.get('px-navigation-pending-v1'));assert.equal(pending.depth,0);
});
test('category views push records, text edits replace one record, and app state survives',()=>{
 const f=fixture();f.nav.commitView('/products/?category=과자류');assert.equal(f.history.state.pxNav.depth,1);const length=f.history.length;
 f.nav.commitView('/products/?category=과자류&q=마',{replace:true});assert.equal(f.history.length,length);assert.equal(f.history.state.pxNav.depth,1);
 f.nav.back();assert.equal(f.location.search,'');
});
test('modified clicks, downloads, external links and prevented popup links do not record navigation',()=>{
 for(const extra of [{ctrlKey:true},{defaultPrevented:true}]){const f=fixture();f.clickLink('https://pxguide.zeromorow.chatgpt.site/products/item/',extra);assert(!f.storage.has('px-navigation-pending-v1'));}
 const f=fixture();f.clickLink('https://map.kakao.com/');assert(!f.storage.has('px-navigation-pending-v1'));
});
test('back controls and scripts are included in list and detail shells',()=>{
 for(const page of ['index.html','products/index.html','shopping/index.html','nearby/index.html']){
  const html=fs.readFileSync('dist/client/'+page,'utf8');assert(html.includes('data-app-back'));assert(html.includes('src="/app-navigation.js"'));
 }
 assert(fs.readFileSync('product-actions.js','utf8').includes('class="dialog-back" data-app-back'));
});


test('a missing referrer never treats unrelated browser history as an internal page',()=>{
 const f=fixture({prior:4,referrer:''});f.nav.back();assert.deepEqual(f.moves,[['assign','/']]);assert.equal(f.backCalls(),0);
});
