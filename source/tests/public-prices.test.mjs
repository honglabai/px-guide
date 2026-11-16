import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productCard} from '../product-ui.mjs';
import {fetchCurrentPrices,mergeCurrentPrices,applyVisiblePrices} from '../price/public-prices.js';

const product={slug:'lotus-biscoff-125g',name:'로투스 비스코프 125g',category:'과자류',pxPrice:820,officialPrice:1235,priceCheckedAt:'2026-09-29'};
const current={slug:product.slug,displayedPrice:25200,comparisonQuantity:20,comparisonUnitPrice:1260,shippingFee:0,sourceUrl:'https://www.coupang.com/vp/products/1',checkedAt:'2026-10-14T09:00:00.000Z'};
test('verified raw bundle totals compare at the PX sale unit without rounding calculations',()=>{
 const lotus={...current,displayedPrice:25950,comparisonUnitPrice:1297.5};
 const [merged]=mergeCurrentPrices([product],new Map([[product.slug,lotus]]));
 assert.equal(merged.comparisonPrice,1297.5);
 assert.match(productCard(merged),/1,298원/);
 assert.match(productCard(merged),/477\.5원|478원/);
 assert.equal(merged.comparisonPrice-product.pxPrice,477.5);
 const dunkin={...current,slug:'dunkin',displayedPrice:27600,comparisonQuantity:24,comparisonUnitPrice:1150};
 assert.equal(mergeCurrentPrices([{...product,slug:'dunkin'}],new Map([['dunkin',dunkin]]))[0].comparisonPrice,1150);
 const samdasu={...current,displayedPrice:12000,comparisonQuantity:1,comparisonUnitPrice:12000};
 assert.equal(mergeCurrentPrices([{...product,slug:'water',pxPrice:11000}],new Map([['water',{...samdasu,slug:'water'}]]))[0].comparisonPrice,12000);
});
test('invalid current row falls back to the stored price',()=>{
 const row={...current,comparisonUnitPrice:null};
 assert.match(productCard(mergeCurrentPrices([product],new Map([[product.slug,row]]))[0]),/쿠팡가 1,235원/);
});
test('static detail and card show stored site price as Coupang price',()=>{
 const html=fs.readFileSync(`dist/client/products/${product.slug}/index.html`,'utf8');
 assert.match(html,/쿠팡가<\/span><strong data-price-value>1,235원/);
 assert.doesNotMatch(html,/2026-09-29 기록가/);
 assert.match(productCard(product),/product-rate/);
 assert.match(productCard(product),/쿠팡가 1,235원/);
});
test('accepted current price updates numeric price and difference without dates',()=>{
 const [merged]=mergeCurrentPrices([product],new Map([[product.slug,current]]));
 assert.equal(merged.currentPrice,1260);
 const html=productCard(merged);
 assert.match(html,/1,260원/);
 assert.match(html,/440원/);
 assert.match(html,/쿠팡가 1,260원/);assert.doesNotMatch(html,/기록가|쿠팡 확인/);
});
test('accepted older observation still displays only the comparison price',()=>{
 const [merged]=mergeCurrentPrices([product],new Map([[product.slug,{...current,checkedAt:'2026-09-13T09:00:00.000Z'}]]),new Date('2026-10-15T09:00:00.000Z'));
 assert.match(productCard(merged),/쿠팡가 1,260원/);assert.doesNotMatch(productCard(merged),/재확인 필요|기록가/);
});
test('API failure keeps stored price and requests batches of at most 100',async()=>{
 const slugs=Array.from({length:101},(_,i)=>`item-${i}`);const calls=[];
 const prices=await fetchCurrentPrices(slugs,async url=>{calls.push(url);throw Error('offline')});
 assert.equal(prices.size,0);assert.equal(calls.length,2);
 assert.match(productCard(mergeCurrentPrices([product],prices)[0]),/쿠팡가 1,235원/);
});
test('visible comparison nodes expose a slug for shared hydration',()=>{
 assert.match(productCard(product),/data-price-slug="lotus-biscoff-125g"/);
 assert.equal(typeof applyVisiblePrices,'function');
});
test('accepted values take precedence while stored prices remain usable',()=>{
 const accepted=mergeCurrentPrices([product],new Map([[product.slug,current]]))[0];
 const missing=mergeCurrentPrices([product],new Map())[0];
 assert.equal(accepted.comparisonPrice,1260);
 assert.equal(missing.comparisonPrice,1235);
 assert.equal((accepted.comparisonPrice-accepted.pxPrice)*2,880);
});
test('hydration keeps detail price numeric and card chevron intact',()=>{
 const value={tagName:'STRONG',textContent:'1,235원'};
 const result={textContent:'',querySelector:()=>null};
 const status={textContent:''};
 const element={dataset:{priceSlug:product.slug,pricePx:'820'},querySelector:key=>({'[data-price-value]':value,'[data-price-result]':result,'[data-price-status]':status})[key]};
 applyVisiblePrices({querySelectorAll:()=>[element]},new Map([[product.slug,current]]),new Date('2026-10-15T00:00:00.000Z'));
 assert.equal(value.textContent,'1,260원');
 assert.match(result.textContent,/440원/);
});
test('detail hydration displays only the unit price and hides metadata',()=>{
 const link={};const evidence={textContent:'',append(node){this.link=node;},ownerDocument:{createElement:()=>link}};
 const value={tagName:'STRONG',textContent:''},status={textContent:''},result={textContent:'',querySelector:()=>null};
 const element={dataset:{priceSlug:product.slug,pricePx:'820'},querySelector:key=>({'[data-price-value]':value,'[data-price-status]':status,'[data-price-result]':result,'[data-price-evidence]':evidence})[key]};
 applyVisiblePrices({querySelectorAll:()=>[element]},new Map([[product.slug,{...current,displayedPrice:25950,comparisonUnitPrice:1297.5,shippingFee:3000}]]));
 assert.equal(value.textContent,'1,298원');
 assert.equal(evidence.textContent,'');assert.equal(evidence.hidden,true);
 assert.match(result.textContent,/478원 차이/);
 assert.equal(link.href,undefined);
});
test('built browser price modules exist at the URLs requested by HTML',()=>{
 const html=fs.readFileSync(`dist/client/products/${product.slug}/index.html`,'utf8');
 assert.match(html,/src="\/price\/public-runtime.js"/);
 for(const name of ['public-runtime.js','public-prices.js'])assert.ok(fs.existsSync(`dist/client/price/${name}`),name);
});
test('card hydration inserts an accessible difference before the chevron element',()=>{
 assert.match(productCard(product),/data-price-result>.*<b aria-hidden="true">›<\/b>/);
 const chevron={tagName:'B',textContent:'›'},children=[chevron];
 const result={firstChild:chevron,querySelector:selector=>selector==='b'?chevron:null,insertBefore(node,before){children.splice(children.indexOf(before),0,node);}};
 const element={dataset:{priceSlug:product.slug,pricePx:'820'},querySelector:key=>key==='[data-price-result]'?result:null};
 applyVisiblePrices({querySelectorAll:()=>[element],createTextNode:text=>({textContent:text})},new Map([[product.slug,current]]));
 assert.equal(children[1],chevron);
 assert.match(children[0].textContent,/440원/);
});
