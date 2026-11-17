import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../product-ui.mjs';
test('subcategory respects category context and specific product types',()=>{
 assert.equal(typeof ui.productSubcategory,'function');
 for(const [category,name,expected] of [['화장품','퍼퓸 핸드크림','핸드·립케어'],['화장품','어성초 스팟패드','패드·팩'],['화장품','선크림','선케어'],['화장품','수딩 크림','크림'],['과자류','사워크림 감자칩','스낵·칩'],['아이스크림','월드콘 쿠키앤크림','콘'],['세제','울샴푸 리필','세탁세제'],['생활용품','샴푸','헤어케어'],['주류','조니워커 18년','위스키'],['의류','매쉬 드로즈','속옷']])assert.equal(ui.productSubcategory({category,name}),expected,name);
 assert.equal(ui.productSubcategory({category:'화장품',name:'신제품',subcategory:'클렌징'}),'클렌징');
});

import fs from 'node:fs';
import vm from 'node:vm';
class Element {
 constructor(){this.dataset={};this.children=[];this.attributes={};this.value='';this.innerHTML='';}
 setAttribute(k,v){this.attributes[k]=v;}
 replaceChildren(){this.children=[];}
 append(child){this.children.push(child);}
 querySelectorAll(){return [];}
 scrollIntoView(){}
 focus(){}
}
async function catalogFixture(query='',selective=false,mediaQueryMatches=undefined,customData=null){
 const nodes=new Map(['.product-list','.shop-search input','#product-sort','#product-results','#product-pagination','.category-empty','#product-subcategories','#product-panel','#product-sort-note','.category-tabs'].map(s=>[s,new Element()]));
 const tabs=['전체','화장품','주류'].map((category,i)=>Object.assign(new Element(),{dataset:{category},id:'tab-'+i}));
 nodes.get('#product-sort').value='registered';
 const data=customData||[...Array.from({length:12},(_,i)=>({slug:'cream-'+i,name:'수딩 크림 '+i,brand:'브랜드',category:'화장품',pxPrice:2000-i,officialPrice:3000})),{slug:'sun',name:'선크림',category:'화장품',pxPrice:1000,officialPrice:2000},{slug:'beer',name:'맥주',category:'주류',pxPrice:1500,officialPrice:2000}];
 let url='/products/'+query,requested=[],index=0;const entries=[url],listeners={};const browserLocation={search:query,pathname:'/products/'};
 let mediaQueryListener;
 const mql = mediaQueryMatches!==undefined?{
   matches:mediaQueryMatches,
   addEventListener:(ev,fn)=>{if(ev==='change')mediaQueryListener=fn;},
   addListener:(fn)=>{mediaQueryListener=fn;},
   removeEventListener:()=>{},
   removeListener:()=>{}
 }:null;
 const window={addEventListener:(type,fn)=>listeners[type]=fn,pxCurrentPrices:new Map(),pxLoadPrices:async slugs=>{requested.push(...slugs);}};
 if(mql)window.matchMedia=()=>mql;
 if(selective)window.pxCatalogData={catalog:async()=>data.map((p,i)=>({...p,...(i<10?{_catalogFull:true}:{})})),products:async slugs=>data.filter(p=>slugs.includes(p.slug))};
 vm.runInNewContext(fs.readFileSync('product-catalog.js','utf8').replace(/^import[^\n]+\n/,''),{...ui,window,URLSearchParams,Event,location:browserLocation,history:{state:{pxNav:{id:'list-entry',depth:0}},replaceState(a,b,next){url=next;entries[index]=next;browserLocation.search=new URL(next,'https://example.com').search;},pushState(a,b,next){entries.splice(index+1);entries.push(next);index++;url=next;browserLocation.search=new URL(next,'https://example.com').search;}},document:{querySelector:s=>nodes.get(s),querySelectorAll:()=>tabs,createElement:()=>new Element(),dispatchEvent(){}},fetch:async()=>({ok:true,json:async()=>data})});
 await new Promise(r=>setImmediate(r));
 return {nodes,tabs,requested,window,url:()=>url,historyLength:()=>entries.length,back:()=>{index=Math.max(0,index-1);url=entries[index];browserLocation.search=new URL(url,'https://example.com').search;listeners.popstate();},forward:()=>{index=Math.min(entries.length-1,index+1);url=entries[index];browserLocation.search=new URL(url,'https://example.com').search;listeners.popstate();},sub:label=>nodes.get('#product-subcategories').children.find(x=>x.textContent.startsWith(label+' ')),grid:()=>nodes.get('.product-list').innerHTML,summary:()=>nodes.get('#product-results').textContent,setMobile:(isMobile)=>{if(mql){mql.matches=isMobile;mediaQueryListener?.({matches:isMobile});}}};
}
test('subcategory selection combines with sorting, search, pagination and parent reset',async()=>{
 const f=await catalogFixture();f.tabs[1].onclick();f.nodes.get('#product-subcategories').value='크림';f.nodes.get('#product-subcategories').onchange();
 assert.match(f.summary(),/크림 · 12개 상품 중 1–10/);assert(!f.grid().includes('data-product-action="sun"'));
 f.nodes.get('#product-pagination').children.find(x=>x.textContent==='2').onclick();assert.match(f.summary(),/11–12/);
 f.nodes.get('#product-sort').value='price-low';f.nodes.get('#product-sort').onchange();assert.match(f.summary(),/1–10/);assert(f.grid().indexOf('cream-11')<f.grid().indexOf('cream-10'));
 f.nodes.get('.shop-search input').value='수딩 크림 11';f.nodes.get('.shop-search input').oninput();assert.match(f.summary(),/1개 상품/);assert.match(f.url(),/subcategory=/);
 f.nodes.get('.shop-search input').value='';f.nodes.get('.shop-search input').oninput();f.tabs[2].onclick();assert.match(f.grid(),/data-product-action="beer"/);assert.equal(f.nodes.get('#product-subcategories').value,'');assert(!f.sub('크림'));
});
test('subcategory URL restores the parent and selected filter',async()=>{
 const f=await catalogFixture('?category=화장품&subcategory=선케어');assert.equal(f.tabs[1].attributes['aria-selected'],'true');assert.equal(f.nodes.get('#product-subcategories').value,'선케어');assert.match(f.grid(),/data-product-action="sun"/);assert(!f.grid().includes('cream-'));
});

test('every catalog card uses its canonical subcategory label',()=>{
 const products=JSON.parse(fs.readFileSync('dist/client/favorites-data.json'));
 for(const p of products.filter(p=>p.catalogVisible!==false)){
  const label=ui.productSubcategory(p);
  assert.ok(ui.productCard(p).includes('<span class="product-kind">'+ui.esc(label)+'</span>'),p.name);
 }
});

test('global search matches title words and initials without searching metadata',async()=>{
 for(const [query,count] of [['수딩',12],['ㅅㄷ',12],['선크림',1],['ㅅㅋㄹ',1],['브랜드',0],['ㅂㄹㄷ',0],['화장품',0],['선케어',0],['수동',0]]){
  const f=await catalogFixture('?q='+encodeURIComponent(query));
  assert.match(f.summary(),count?new RegExp(count+'개 상품 중'):/검색 결과 0개/,query);
 }
});

test('catalog requests accepted prices for the full list so discount sorting can use them',async()=>{
 const f=await catalogFixture();
 assert.equal(new Set(f.requested).size,14);
});


test('catalog back and forward restore category, subcategory, sort and pagination',async()=>{
 const f=await catalogFixture('?category=화장품');
 f.nodes.get('#product-subcategories').value='크림';f.nodes.get('#product-subcategories').onchange();
 f.nodes.get('#product-pagination').children.find(x=>x.textContent==='2').onclick();assert.match(f.url(),/page=2/);
 f.nodes.get('#product-sort').value='price-high';f.nodes.get('#product-sort').onchange();assert.match(f.url(),/sort=price-high/);
 f.back();assert.equal(f.nodes.get('#product-sort').value,'registered');assert.equal(f.nodes.get('#product-subcategories').value,'크림');assert.match(f.summary(),/11–12/);
 f.back();assert.match(f.summary(),/1–10/);f.back();assert.equal(f.nodes.get('#product-subcategories').value,'');assert.match(f.summary(),/화장품/);
 f.forward();assert.equal(f.nodes.get('#product-subcategories').value,'크림');
});
test('typing one search adds one history entry and back restores the earlier query',async()=>{
 const f=await catalogFixture('?q=수딩');const input=f.nodes.get('.shop-search input');input.onfocus();input.value='선';input.oninput();const length=f.historyLength();input.value='선크림';input.oninput();assert.equal(f.historyLength(),length);
 f.back();assert.equal(input.value,'수딩');f.forward();assert.equal(input.value,'선크림');assert.match(f.summary(),/1개 상품/);
});

test('selective page hydration preserves cards, paging and rapid category changes',async()=>{const old=await catalogFixture(),next=await catalogFixture('',true);assert.equal(next.grid(),old.grid());old.nodes.get('#product-pagination').children.find(x=>x.textContent==='2').onclick();next.nodes.get('#product-pagination').children.find(x=>x.textContent==='2').onclick();await new Promise(r=>setImmediate(r));assert.equal(next.grid(),old.grid());next.tabs[1].onclick();next.tabs[2].onclick();await new Promise(r=>setImmediate(r));assert.match(next.grid(),/data-product-action="beer"/);assert.match(next.summary(),/1개 상품/);});
test('popup comparison link opens only products with the same subcategory',async()=>{
 const {productActionLinks}=await import('../product-action-links.mjs');
 const url=productActionLinks({slug:'cream-0',name:'수딩 크림 0',category:'화장품',subcategory:'크림',productGroup:'넓은 그룹'}).compare;
 const f=await catalogFixture(new URL(url,'https://px.test').search);
 assert.equal(f.nodes.get('#product-subcategories').value,'크림');assert.match(f.summary(),/크림 · 12개 상품/);assert.match(f.grid(),/cream-/);assert(!f.grid().includes('data-product-action="sun"'));assert(!f.grid().includes('data-product-action="beer"'));
});

test('desktop renders 15 items per page and mobile renders 10 items per page with live resize support',async()=>{
 const testItems=Array.from({length:20},(_,i)=>({slug:'item-'+i,name:'상품 '+i,category:'식품',pxPrice:1000+i,officialPrice:2000+i}));
 const fDesktop=await catalogFixture('',false,false,testItems);
 assert.match(fDesktop.summary(),/20개 상품 중 1–15개 표시/);
 const desktopCount=(fDesktop.grid().match(/class="product-card-shell"/g)||[]).length;
 assert.equal(desktopCount,15);
 fDesktop.nodes.get('#product-pagination').children.find(x=>x.textContent==='2').onclick();
 assert.match(fDesktop.summary(),/20개 상품 중 16–20개 표시/);
 const desktopP2Count=(fDesktop.grid().match(/class="product-card-shell"/g)||[]).length;
 assert.equal(desktopP2Count,5);

 const fMobile=await catalogFixture('',false,true,testItems);
 assert.match(fMobile.summary(),/20개 상품 중 1–10개 표시/);
 const mobileCount=(fMobile.grid().match(/class="product-card-shell"/g)||[]).length;
 assert.equal(mobileCount,10);
 fMobile.nodes.get('#product-pagination').children.find(x=>x.textContent==='2').onclick();
 assert.match(fMobile.summary(),/20개 상품 중 11–20개 표시/);
 const mobileP2Count=(fMobile.grid().match(/class="product-card-shell"/g)||[]).length;
 assert.equal(mobileP2Count,10);

 fDesktop.setMobile(true);
 assert.match(fDesktop.summary(),/20개 상품 중/);
});
