import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real list renderer and handlers with a small DOM/storage fixture.
class Element {
 constructor(tag='div'){this.tagName=tag;this.dataset={};this.children=[];this.listeners={};this.attributes={};this.value='';this.textContent='';this.classList={add:()=>{}};}
 set innerHTML(value){this._innerHTML=value;}
 get innerHTML(){return this._innerHTML??'';}
 append(...items){for(const item of items)this.children.push(...(item.tagName==='fragment'?item.children:[item]));}
 before(...items){this.beforeItems=items;}
 replaceChildren(...items){this.children=[];this.append(...items);}
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(name,handler){this.listeners[name]=handler;}
 closest(tag){return this.tagName===tag?this:null;}
 focus(){}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){const match=element=>{if(['p','button','input'].includes(selector))return element.tagName===selector;const key=selector.match(/^\[data-([\w-]+)\]$/)?.[1];if(key)return Object.hasOwn(element.dataset,key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()));return false;};return this.children.flatMap(child=>[...(match(child)?[child]:[]),...child.querySelectorAll(selector)]);}
}
async function fixture(mode='favorite',overrides={},acceptedSlugs=null,selective=false){
 const nodes=new Map();for(const id of ['favorite-list','favorite-search','favorite-sort','favorite-select-all','favorite-move-selected','favorite-move-all','favorite-clear','favorite-import-button','favorite-import-dismiss','favorite-empty','favorite-no-results','favorite-message'])nodes.set('#'+id,new Element());
 nodes.set('[data-favorite-summary]',new Element());nodes.set('[data-favorite-total]',new Element());nodes.get('#favorite-sort').value='added';
 if(mode==='shopping') {
  nodes.delete('#favorite-list');
  for(const id of ['shopping-list','shopping-search','shopping-sort','shopping-empty','shopping-no-results','shopping-clear-completed','shopping-clear','shopping-message'])nodes.set('#'+id,new Element());
  for(const name of ['selected','total','saving','remaining','progress'])nodes.set(`[data-shopping-${name}]`,new Element());
  nodes.get('#shopping-sort').value='added';
 }
 const root=nodes.get(`#${mode}-list`),events={};const storage=new Map([['px-guide-favorites-v1',JSON.stringify(['b','a','d','c'])],['px-guide-cart-v1',JSON.stringify({b:{qty:2,checked:false}})]]);
 const products=[{slug:'a',name:'가',category:'과자',pxPrice:1000,officialPrice:2000},{slug:'b',name:'나',category:'과자',pxPrice:1500,shoppingPrice:900,officialPrice:1000},{slug:'c',name:'다',category:'과자',pxPrice:500,officialPrice:500},{slug:'d',name:'라',category:'과자',pxPrice:null,officialPrice:null},{slug:'e',name:'마',category:'과자',pxPrice:800,officialPrice:900}];
 if(mode==='shopping')storage.set('px-guide-shopping-v1',JSON.stringify({b:{qty:2,checked:false},a:{qty:1,checked:true},d:{qty:1,checked:false},c:{qty:1,checked:false}}));
 for(const product of products)Object.assign(product,overrides[product.slug]||{});
 const cards=new Element('section');
 const document={querySelector:s=>nodes.get(s)||null,querySelectorAll:s=>[...root.querySelectorAll(s),...cards.querySelectorAll(s)],createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment'),addEventListener:(type,fn)=>events[type]=fn};
 vm.runInNewContext(fs.readFileSync('favorites.js','utf8'),{document,window:{addEventListener(type,fn){events['window:'+type]=fn;},...(selective?{pxCatalogData:{list:async slugs=>products.filter(p=>slugs.includes(p.slug))}}:{}),pxLoadPrices:()=>{},pxCurrentPrices:new Map(products.filter(p=>p.officialPrice>0&&(acceptedSlugs===null||acceptedSlugs.includes(p.slug))).map(p=>[p.slug,{displayedPrice:p.officialPrice*20,comparisonQuantity:20,comparisonUnitPrice:p.officialPrice}]))},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async()=>({ok:true,json:async()=>products}),structuredClone,URLSearchParams,location:{search:''},CSS:{escape:s=>s},confirm:()=>true});
 await new Promise(resolve=>setImmediate(resolve));
 return {nodes,root,cards,storage,events,backup:root.beforeItems?.[0],order:()=>root.children.map(row=>row.dataset.slug),row:slug=>root.children.find(row=>row.dataset.slug===slug),click:button=>events.click({target:button}),sort:value=>{nodes.get(`#${mode}-sort`).value=value;nodes.get(`#${mode}-sort`).listeners.change();}};
}
function descendants(node){return node.children.flatMap(child=>[child,...descendants(child)]);}
function steps(row){return descendants(row).filter(el=>el.dataset.favoriteQtyStep);}
function quantityInput(row){return descendants(row).find(el=>el.dataset.favoriteQty);}

test('all six orders use sale prices and keep missing comparisons last',async()=>{
 const f=await fixture();
 for(const [sort,order]of [['added',['b','a','d','c']],['name',['a','b','c','d']],['price-low',['c','b','a','d']],['price-high',['a','b','c','d']],['discount-high',['a','b','c','d']],['discount-low',['c','b','a','d']]]){f.sort(sort);assert.deepEqual(f.order(),order);}
});
test('quantity buttons persist changes, recalculate totals and honor bounds',async()=>{
 const f=await fixture();assert.equal(f.nodes.get('[data-favorite-total]').textContent,'예상 구매 금액 3,300원');
 f.click(steps(f.row('b'))[1]);assert.equal(JSON.parse(f.storage.get('px-guide-cart-v1')).b.qty,3);assert.equal(f.nodes.get('[data-favorite-total]').textContent,'예상 구매 금액 4,200원');
 f.click(steps(f.row('b'))[0]);assert.equal(Number(quantityInput(f.row('b')).value),2);
 const minimum=steps(f.row('a'))[0];assert.equal(minimum.disabled,true);f.click(minimum);assert.equal(Number(quantityInput(f.row('a')).value),1);
 const input=quantityInput(f.row('b'));input.value='99';f.root.listeners.change({target:input});const maximum=steps(f.row('b'))[1];assert.equal(maximum.disabled,true);f.click(maximum);assert.equal(JSON.parse(f.storage.get('px-guide-cart-v1')).b.qty,99);
});
test('updated quantity is retained when a favorite moves to the shopping list',async()=>{
 const f=await fixture();f.click(steps(f.row('b'))[1]);const move=descendants(f.row('b')).find(el=>el.dataset.moveOne);f.click(move);
 assert.equal(JSON.parse(f.storage.get('px-guide-shopping-v1')).b.qty,3);assert(!f.order().includes('b'));assert(!Object.hasOwn(JSON.parse(f.storage.get('px-guide-cart-v1')),'b'));
});
test('favorites page omits the removed notice and share link controls',()=>{
 const html=fs.readFileSync('dist/client/favorites/index.html','utf8');assert(!html.includes('목록은 이 기기의 브라우저에 저장됩니다.'));assert(!html.includes('id="favorite-share"'));assert(!html.includes('id="favorite-share-link"'));assert.equal((html.match(/<option /g)||[]).length,6);
});

test('list pages do not show backup or restore controls',async()=>{
 for(const mode of ['favorite','shopping']){
  const f=await fixture(mode);
  assert.equal(f.backup,undefined);
 }
});

function checkShopping(f,slug,checked){const input=descendants(f.row(slug)).find(el=>el.dataset.shoppingCheck);input.checked=checked;f.root.listeners.change({target:input});}
function totals(f){return ['selected','total','saving','remaining'].map(name=>f.nodes.get(`[data-shopping-${name}]`).textContent);}
test('shopping has all six orders using the same sale-price comparison',async()=>{
 const f=await fixture('shopping');
 for(const [sort,order]of [['added',['b','a','d','c']],['name',['a','b','c','d']],['price-low',['c','b','a','d']],['price-high',['a','b','c','d']],['discount-high',['a','b','c','d']],['discount-low',['c','b','a','d']]]){f.sort(sort);assert.deepEqual(f.order(),order);}
});
test('shopping selection and quantity changes keep all four totals consistent',async()=>{
 const f=await fixture('shopping');assert.deepEqual(totals(f),['1,000원','3,300원','1,200원','2,300원']);
 checkShopping(f,'b',true);assert.deepEqual(totals(f),['2,800원','3,300원','1,200원','500원']);
 const input=descendants(f.row('b')).find(el=>el.dataset.shoppingQty);input.value='3';f.root.listeners.change({target:input});assert.deepEqual(totals(f),['3,700원','4,200원','1,300원','500원']);
 checkShopping(f,'a',false);assert.deepEqual(totals(f),['2,700원','4,200원','1,300원','1,500원']);
 checkShopping(f,'d',true);assert.deepEqual(totals(f),['2,700원','4,200원','1,300원','1,500원']);
});
test('shopping uses verified unit price when raw online total is a twenty-pack',async()=>{
 const f=await fixture('shopping');
 assert.equal(f.nodes.get('[data-shopping-saving]').textContent,'1,200원');
 assert.match(descendants(f.row('a')).find(el=>el.className==='receipt-reference').textContent,/2,000원/);
 assert.doesNotMatch(descendants(f.row('a')).find(el=>el.className==='receipt-reference').textContent,/40,000원/);
});
test('shopping shows a verified price difference for items still in the cart',async()=>{
 const f=await fixture('shopping');
 const difference=descendants(f.row('b')).find(el=>el.className==='receipt-difference');
 assert(difference);
 assert.match(difference.textContent,/200원 절약/);
 assert.equal(f.nodes.get('[data-shopping-saving]').textContent,'1,200원');
 checkShopping(f,'a',false);
 assert.equal(f.nodes.get('[data-shopping-saving]').textContent,'1,200원');
});
test('all stored site prices contribute regardless of date and composition labels',async()=>{
 const f=await fixture('shopping',{a:{comparisonKind:'sameBundle',priceCheckedAt:'2026-09-29'},b:{comparisonKind:'unverifiedBundle',priceCheckedAt:'2026-09-29'},c:{comparisonKind:'differentBundle',priceCheckedAt:'2026-09-29'}},[]);
 checkShopping(f,'a',false);
 const difference=descendants(f.row('a')).find(el=>el.className==='receipt-difference');
 assert(difference);
 assert.match(difference.textContent,/1,000원 절약/);
 assert.doesNotMatch(difference.textContent,/기록/);
 assert.equal(f.nodes.get('[data-shopping-saving]').textContent,'1,200원');
 assert.match(descendants(f.row('b')).find(el=>el.className==='receipt-difference').textContent,/200원 절약/);
});
test('higher PX prices produce signed savings and clearing purchases recalculates totals',async()=>{
 const f=await fixture('shopping',{b:{shoppingPrice:1200}});checkShopping(f,'a',false);checkShopping(f,'b',true);assert.deepEqual(totals(f),['2,400원','3,900원','600원','1,500원']);
 f.nodes.get('#shopping-clear-completed').listeners.click();assert(!f.order().includes('b'));assert.deepEqual(totals(f),['0원','1,500원','1,000원','1,500원']);
});
test('shopping page publishes requested boxes in order and removes both notices',()=>{
 const html=fs.readFileSync('dist/client/shopping/index.html','utf8');const names=['구매 완료 합계','전체 합계','절약한 금액','남은 구매금액'];const indexes=names.map(name=>html.indexOf(`>${name}<`));assert(indexes.every(i=>i>=0));assert.deepEqual([...indexes].sort((a,b)=>a-b),indexes);
 assert.doesNotMatch(html,/과거 기록가 포함|참고 차액/);
 assert(!html.includes('체크를 해제하면 구매 예정으로 돌아갑니다'));assert(!html.includes('data-shopping-note'));assert(!html.includes('data-shopping-reference'));assert(html.includes('>구매 상품 지우기<'));assert.equal((html.match(/<option /g)||[]).length,6);
});
test('shopping fallback shows only the stored amount and still calculates savings',async()=>{
 const f=await fixture('shopping',{},[]);
 const reference=descendants(f.row('b')).find(el=>el.className==='receipt-reference');
 assert.equal(reference.textContent,'2,000원');
 assert.equal(f.nodes.get('[data-shopping-saving]').textContent,'1,200원');
});


test('visible cart quantity buttons update row amounts, all totals and stored quantities',async()=>{
 const f=await fixture('shopping');
 const shoppingSteps=slug=>descendants(f.row(slug)).filter(el=>el.dataset.shoppingQtyStep);
 const amount=(slug,cls)=>descendants(f.row(slug)).find(el=>el.className===cls || el.className===cls+' receipt-px');
 const qty=()=>descendants(f.row('b')).find(el=>el.dataset.shoppingQty);
 // Quantity and delete controls are available directly on each row.
 const label=f.row('b').children.find(el=>el.className==='favorite-quantity');
 assert(label);assert.equal(shoppingSteps('b').length,2);
 assert(!descendants(f.row('b')).some(el=>el.tagName==='details'));
 const remove=descendants(f.row('b')).find(el=>el.dataset.shoppingRemove);assert.equal(remove.textContent,'삭제');
 f.click(shoppingSteps('b')[1]);
 assert.equal(Number(qty().value),3);
 assert.equal(JSON.parse(f.storage.get('px-guide-shopping-v1')).b.qty,3);
 assert.equal(amount('b','receipt-reference').textContent,'3,000원');
 assert.equal(amount('b','receipt-difference').textContent,'300원 절약');
 assert.equal(amount('b','favorite-row-price').children[0].textContent,'2,700원');
 assert.deepEqual(totals(f),['1,000원','4,200원','1,300원','3,200원']);
 checkShopping(f,'b',true);
 f.click(shoppingSteps('b')[1]);
 assert.deepEqual(totals(f),['4,600원','5,100원','1,400원','500원']);
 f.click(shoppingSteps('b')[0]);
 assert.deepEqual(totals(f),['3,700원','4,200원','1,300원','500원']);
 const minimum=shoppingSteps('c')[0];assert.equal(minimum.disabled,true);f.click(minimum);
 assert.equal(JSON.parse(f.storage.get('px-guide-shopping-v1')).c.qty,1);
 qty().value='99';f.root.listeners.change({target:qty()});
 const maximum=shoppingSteps('b')[1];assert.equal(maximum.disabled,true);f.click(maximum);
 assert.equal(JSON.parse(f.storage.get('px-guide-shopping-v1')).b.qty,99);
 f.click(descendants(f.row('b')).find(el=>el.dataset.shoppingRemove));
 assert(!f.row('b'));assert.deepEqual(totals(f),['1,000원','1,500원','1,000원','500원']);
});

test('selective catalog loads new products from another tab before recomputing totals',async()=>{const f=await fixture('shopping',{},null,true);const state=JSON.parse(f.storage.get('px-guide-shopping-v1'));state.e={qty:3,checked:false};f.storage.set('px-guide-shopping-v1',JSON.stringify(state));f.events['window:storage']({key:'px-guide-shopping-v1'});await new Promise(r=>setImmediate(r));assert.ok(f.row('e'));assert.equal(f.nodes.get('[data-shopping-total]').textContent,'5,700원');});

test('cart image, name and prices are inside a completion button instead of a detail link',async()=>{
 const f=await fixture('shopping');
 let toggle=descendants(f.row('b')).find(e=>e.dataset.shoppingToggle==='b');
 assert.equal(toggle.tagName,'button');assert.equal(toggle.href,undefined);assert.equal(toggle.attributes['aria-pressed'],'false');
 assert(descendants(toggle).some(e=>e.tagName==='img'));assert(descendants(toggle).some(e=>e.tagName==='strong'&&e.textContent==='나'));assert(descendants(toggle).some(e=>e.className==='receipt-reference'));
 f.click({closest:tag=>tag==='button'?toggle:null});
 assert.equal(JSON.parse(f.storage.get('px-guide-shopping-v1')).b.checked,true);assert.deepEqual(totals(f),['2,800원','3,300원','1,200원','500원']);
 toggle=descendants(f.row('b')).find(e=>e.dataset.shoppingToggle==='b');assert.equal(toggle.attributes['aria-pressed'],'true');
 f.click(toggle);assert.equal(JSON.parse(f.storage.get('px-guide-shopping-v1')).b.checked,false);assert.deepEqual(totals(f),['1,000원','3,300원','1,200원','2,300원']);
 const favorite=await fixture();assert.equal(descendants(favorite.row('b')).find(e=>e.className==='favorite-row-link').tagName,'a');
});

test('card cart action adds independently of wishes, updates state, and toggles off without duplication',async()=>{
 const f=await fixture(),button=new Element('button');button.dataset.shoppingAdd='b';button.dataset.shoppingName='나';f.cards.append(button);
 const wishes=f.storage.get('px-guide-favorites-v1'),wishQuantity=f.storage.get('px-guide-cart-v1');
 f.click(button);let cart=JSON.parse(f.storage.get('px-guide-shopping-v1'));
 assert.deepEqual(cart.b,{qty:1,checked:false});assert.equal(button.attributes['aria-pressed'],'true');assert.equal(button.attributes['aria-label'],'나 장바구니에서 빼기');assert.equal(f.storage.get('px-guide-favorites-v1'),wishes);assert.equal(f.storage.get('px-guide-cart-v1'),wishQuantity);
 f.click(button);cart=JSON.parse(f.storage.get('px-guide-shopping-v1'));assert.equal(Object.hasOwn(cart,'b'),false);assert.equal(button.attributes['aria-pressed'],'false');assert.equal(f.storage.get('px-guide-favorites-v1'),wishes);
});
test('every product card has separate outline heart and cart actions outside its product link',async()=>{
 const {productCard}=await import('../product-ui.mjs');const card=productCard({slug:'a',name:'가',category:'과자류',pxPrice:100,officialPrice:200});
 assert.match(card,/<\/a><button[^>]+class="favorite-toggle"/);assert.match(card,/data-favorite="a"/);assert.match(card,/class="shopping-toggle" data-shopping-add="a"/);assert.equal((card.match(/aria-pressed="false"/g)||[]).length,2);assert.match(card,/class="shopping-cart"[^>]+fill="none"/);
});
