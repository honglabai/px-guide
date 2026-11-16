import test from 'node:test';
import assert from 'node:assert/strict';
import {extractVisiblePage,parseDetail} from '../price/browser-extract.mjs';
import * as browser from '../price/browser-extract.mjs';
// Synthetic DOM tree: implements the standards-based selectors used by the adapter.
class Element {
 constructor(tag,attrs={},text='',children=[]){Object.assign(this,{tag,attrs,text,children,value:attrs.value??''});for(const c of children)c.parent=this;}
 get innerText(){return [this.text,...this.children.map(c=>c.innerText)].filter(Boolean).join('\n');}
 get href(){return this.attrs.href;}
 getClientRects(){return this.attrs.hidden?[]:[{}];}
 matches(selector){if([...selector.split('[')[0].matchAll(/\.([\w-]+)/g)].some(([,name])=>!String(this.attrs.class??'').split(/\s+/).includes(name)))return false;const tag=selector.match(/^[a-z][a-z0-9]*/i)?.[0];if(tag&&tag!==this.tag)return false;return [...selector.matchAll(/\[([^\]=*$]+)(?:(\*=|\$=|=)"([^"]*)")?\]/g)].every(([,key,op,value])=>key in this.attrs&&(!op||op==='='&&this.attrs[key]===value||op==='*='&&this.attrs[key].includes(value)||op==='$='&&this.attrs[key].endsWith(value)));}
 querySelectorAll(selector){const matches=[];for(const c of this.children){if(selector.split(',').some(s=>c.matches(s.trim())))matches.push(c);matches.push(...c.querySelectorAll(selector));}return matches;}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 closest(selector){for(let n=this;n;n=n.parent)if(n.matches(selector))return n;return null;}
}
const el=(...args)=>new Element(...args);
const url='https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3';
function dom({sellers=[],extra='',condition='',generic=false}={}){
 const offer=el('section',{itemprop:'offers',itemscope:''},condition,[el('strong',{itemprop:'price'},'1,260원'),...sellers.map(s=>el('span',{itemprop:'seller'},s)),el('p',{},'배송비 3,000원'),el('p',{},extra)]);
 const product=el('article',{itemscope:'',itemtype:'https://schema.org/Product'},'', [el('h1',{itemprop:'name'},'해태 비스킷 125g 1개'),offer]);
 return el('body',{},'',generic?[el('h1',{},'쿠팡'),el('a',{href:url},'추천 상품')]:[product]);
}
function withDom(body,href,fn){const prior={document:globalThis.document,location:globalThis.location,getComputedStyle:globalThis.getComputedStyle};globalThis.document={body,readyState:'complete',querySelectorAll:s=>body.querySelectorAll(s),querySelector:s=>body.querySelector(s)};globalThis.location={href};globalThis.getComputedStyle=()=>({visibility:'visible'});try{return fn();}finally{Object.assign(globalThis,prior);}}
test('actual DOM extractor rejects absent, empty or multiple seller evidence',()=>{
 for(const fixture of [{extra:'판매자 A\n판매자 B'},{sellers:['']},{sellers:['A','B']}])withDom(dom(fixture),url,()=>assert.equal(extractVisiblePage().offer,null));
});
test('actual DOM extractor accepts one evidenced seller and rejects spaced conditional offers',()=>{
 withDom(dom({sellers:['판매자 A']}),url,()=>assert.equal(parseDetail(extractVisiblePage()).seller,'판매자 A'));
 for(const condition of ['카드 즉시할인 시 1,260원','카 드 청구 할인','와 우 회원 전용','W O W membership price','멤버십 전용 가격'])withDom(dom({sellers:['판매자 A'],condition}),url,()=>{const p=parseDetail(extractVisiblePage());assert.equal(p.failure,'PAGE_CHANGED',condition);assert.equal(p.priceCondition,undefined);});
});
test('readiness rejects generic and stale DOM and checks requested search/detail identity',()=>{
 assert.equal(typeof browser.pageContentReady,'function');
 withDom(dom({generic:true}),url,()=>assert.equal(browser.pageContentReady({url,kind:'detail'}),false));
 withDom(dom({sellers:['A']}),url.replace('=2','=9'),()=>assert.equal(browser.pageContentReady({url,kind:'detail'}),false));
 withDom(dom({sellers:['A']}),url,()=>assert.equal(browser.pageContentReady({url,kind:'detail'}),true));
 const search='https://www.coupang.com/np/search?q=biscuit';
 const body=el('body',{},'', [el('input',{name:'q',value:'old'}),el('a',{href:url},'비스킷 125g 1개 1260원')]);
 withDom(body,search,()=>{assert.equal(browser.pageContentReady({url:search,kind:'search'}),false);body.children[0].value='biscuit';assert.equal(browser.pageContentReady({url:search,kind:'search'}),true);});
});

// DOM-shaped fixture based on root's Ego Lite TaskSpace 2 observations, 2026-10-21.
const lotusUrl='https://www.coupang.com/vp/products/8285435999?itemId=5469699135&vendorItemId=96000779811';
const lotusTitle='로투스 비스코프 비스킷 일괄포장, 125g, 1개';
function liveCard(href=lotusUrl,price='1,260원',shipping='배송비 3,000원'){
 return el('a',{href},'',[
  el('div',{class:'ProductUnit_productNameV2__abc'},lotusTitle),
  el('div',{class:'PriceArea_priceArea__abc'},'', [el('del',{},'1,500원'),el('strong',{},price)]),
  el('div',{'data-badge-type':'feePrice'},shipping),
 ]);
}
function liveDetail({coupon=false,seller=true}={}){
 return el('body',{},'',[
  el('h1',{class:'product-title'},lotusTitle),
  el('div',{class:'price-container'},coupon?'쿠폰할인':'',[
   el('div',{class:'price-layout-container price-layout-normal'},'', [el('div',{class:'twc-line-through'},'1,500원'),el('strong',{},'1,260원'),el('span',{},'(10g당 101원)')]),
   el('div',{class:'price-shipping-fee-info-container'},'배송비\n3,000원'),
  ]),
  ...(seller?[el('div',{class:'seller-info'},'판매자:',[el('a',{href:'https://shop.coupang.com/vid/A00274612?viid=96000779811'},'주식회사 에스알유통',[el('div',{},'판매자 상품 보러가기')]),el('a',{href:'#other-sellers'},'다른 판매자 보기(12)')])]:[]),
  el('section',{},'1개 4,260원\n2개 5,680원\n4개 8,410원\n12개 25,000원\n20개 25,950원'),
 ]);
}
test('observed detail layout isolates normal price, shipping and selected seller',()=>{
 withDom(liveDetail(),lotusUrl,()=>{
  assert.equal(browser.pageContentReady({url:lotusUrl,kind:'detail'}),true);
  const p=parseDetail(extractVisiblePage());assert.equal(p.title,lotusTitle);assert.equal(p.displayedPrice,1260);assert.equal(p.shippingFee,3000);assert.equal(p.seller,'주식회사 에스알유통');
 });
 for(const variant of [{coupon:true},{seller:false}])withDom(liveDetail(variant),lotusUrl,()=>assert.equal(parseDetail(extractVisiblePage()).failure,'PAGE_CHANGED'));
});
test('observed search layout ignores hidden inputs and crossed prices; preserves competing sellers',()=>{
 const search='https://www.coupang.com/np/search?q=lotus';
 const body=el('body',{},'', [el('input',{name:'q',value:'lotus'}),el('input',{name:'q',value:'old',hidden:true}),el('input',{name:'q',value:'old',hidden:true}),liveCard(),liveCard(lotusUrl.replace('96000779811','99999999999'),'5,200원','무료배송')]);
 withDom(body,search,()=>{
  assert.equal(browser.pageContentReady({url:search,kind:'search'}),true);
  const cards=extractVisiblePage().cards.map(browser.parseSearchCard);assert.equal(cards.length,2);assert.equal(cards[0]?.displayedPrice,1260);assert.equal(cards[1]?.displayedPrice,5200);assert.notEqual(cards[0]?.vendorItemId,cards[1]?.vendorItemId);
 });
});
test('live-shaped competing offers produce review observation rather than cheapest selection',async()=>{
 const searchUrl='https://www.coupang.com/np/search?q=lotus';
 const body=el('body',{},'', [liveCard(),liveCard('https://www.coupang.com/vp/products/80660458?itemId=27914635087&vendorItemId=94873260668','5,200원','무료배송')]);
 const snapshot=withDom(body,searchUrl,()=>extractVisiblePage());let reads=0;
 const task={page:()=>({goto:async()=>{},waitForFunction:async()=>{},evaluate:async()=>{reads++;return snapshot;}}),finish:async()=>{}};
 const [observation]=await browser.collectBatch(task,[{slug:'lotus',name:'로투스 비스코프',brand:'로투스',spec:'125g',quantity:'1개',comparisonQuantity:1}],{pauseMs:0});
 assert.equal(observation.failure,'AMBIGUOUS_MATCH');assert.equal(observation.displayedPrice,undefined);assert.equal(reads,1);
});
test('coupon card is not mistaken for normal price and tracking parameters are removed',()=>{
 const tracked=lotusUrl+'&q=lotus&rank=10';
 withDom(el('body',{},'',[liveCard(tracked)]),tracked,()=>assert.equal(browser.parseSearchCard(extractVisiblePage().cards[0]).sourceUrl,lotusUrl));
 const coupon=liveCard();coupon.text='쿠폰할인';
 withDom(el('body',{},'',[coupon]),lotusUrl,()=>assert.equal(browser.parseSearchCard(extractVisiblePage().cards[0]),null));
});
test('missing selected and seller vendor identifiers never establish seller identity',()=>{
 const body=liveDetail();body.querySelector('a[href*="shop.coupang.com/vid/"]').attrs.href='https://shop.coupang.com/vid/A00274612';
 withDom(body,lotusUrl.split('?')[0],()=>assert.equal(extractVisiblePage().offer,null));
});
test('detail readiness waits for seller rendering but releases conditional terminal offers',()=>{
 withDom(liveDetail({seller:false}),lotusUrl,()=>assert.equal(browser.pageContentReady({url:lotusUrl,kind:'detail'}),false));
 withDom(liveDetail({seller:false,coupon:true}),lotusUrl,()=>assert.equal(browser.pageContentReady({url:lotusUrl,kind:'detail'}),true));
 withDom(liveDetail(),lotusUrl,()=>assert.equal(browser.pageContentReady({url:lotusUrl,kind:'detail'}),true));
});
test('option menu twenty-pack text cannot override selected one-pack detail',()=>{
 withDom(liveDetail(),lotusUrl,()=>{
  const selected=parseDetail(extractVisiblePage());
  assert.equal(selected.quantity,'1개');
  assert.equal(selected.title,lotusTitle);
  assert.equal(browser.parseDetail(extractVisiblePage()).quantity,'1개');
 });
});
test('missing selected seller is identified without exposing page text',()=>{
 withDom(liveDetail({seller:false}),lotusUrl,()=>{
  const page=extractVisiblePage();
  assert.equal(page.offer,null);
  assert.equal(page.offerIssue,'SELLER_UNVERIFIED');
  assert.equal(JSON.stringify(page.offerIssue).includes('주식회사'),false);
 });
});
test('observed seller link failures have distinct fixed reasons',()=>{
 const cases=[
  [body=>{body.querySelector('a[href*="shop.coupang.com/vid/"]').attrs.href='#other';},'SELLER_LINK_MISSING'],
  [body=>{body.querySelector('.seller-info').children.push(el('a',{href:'https://shop.coupang.com/vid/B?viid=96000779811'},'Other'));},'SELLER_LINK_AMBIGUOUS'],
  [body=>{body.querySelector('a[href*="shop.coupang.com/vid/"]').text='';},'SELLER_NAME_UNVERIFIED'],
  [body=>{body.querySelector('a[href*="shop.coupang.com/vid/"]').attrs.href='https://shop.coupang.com/vid/A00274612?viid=123';},'SELLER_ID_MISMATCH'],
  [body=>{body.querySelector('a[href*="shop.coupang.com/vid/"]').attrs.href='https://shop.coupang.com/vid/A00274612';},'SELLER_ID_UNVERIFIED'],
 ];
 for(const [change,reason] of cases){const body=liveDetail();change(body);withDom(body,lotusUrl,()=>{const page=extractVisiblePage();assert.equal(page.offer,null);assert.equal(page.offerIssue,reason);assert.equal(parseDetail(page).failure,'PAGE_CHANGED');});}
});
test('observed price and shipping region failures have fixed reasons',()=>{
 const cases=[
  [body=>{body.querySelector('.price-layout-normal').attrs.class='other';},'PRICE_REGION_UNVERIFIED'],
  [body=>{body.querySelector('.price-container').children.push(el('div',{class:'price-layout-container price-layout-normal'},'1,500원'));},'PRICE_REGION_AMBIGUOUS'],
  [body=>{body.querySelector('.price-container').children.push(el('div',{class:'price-shipping-fee-info-container'},'무료배송'));},'SHIPPING_REGION_AMBIGUOUS'],
 ];
 for(const [change,reason] of cases){const body=liveDetail();change(body);withDom(body,lotusUrl,()=>{const page=extractVisiblePage();assert.equal(page.offer,null);assert.equal(page.offerIssue,reason);});}
});
