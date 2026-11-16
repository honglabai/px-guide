import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSearchCard,parseDetail,collectBatch} from '../price/browser-extract.mjs';
const url='https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3';
const target={slug:'biscuit',name:'해태 비스킷',brand:'해태',spec:'125g',quantity:'1개',comparisonQuantity:1,previousPrice:1260};
const card=(title='해태 비스킷 125g 1개',price='1,260원',fee='배송비 3,000원',u=url)=>({url:u,text:[title,price,fee].join('\n'),card:{title,priceText:price,shippingText:fee,conditionText:''}});
const detail=(title='해태 비스킷 125g 1개',price='1,260원',fee='배송비 3,000원',seller='판매자 A',u=url)=>({url:u,text:'',offer:{title,priceText:price,text:fee,seller,conditionText:'일반가'}});
const search=(cards=[card()])=>({text:'검색 결과',cards});
function task(reads){let n=0;return {finished:false,page(){return {async goto(){},async waitForFunction(){},async evaluate(){return reads[n++];}};},async finish(){this.finished=true;}};}
test('search card preserves IDs, count, raw price and separate shipping',()=>{const c=parseSearchCard(card());assert.equal(c.itemId,'2');assert.equal(c.quantity,'1개');assert.equal(c.displayedPrice,1260);assert.equal(c.shippingFee,3000);});
test('selected detail requires complete ordinary offer evidence',()=>{
 assert.equal(parseDetail({text:'CAPTCHA',url}).blocked,'CAPTCHA');
 for(const d of [detail('해태 비스킷 125g'),detail('해태 비스킷 125g 1개','1,260원',''),detail('해태 비스킷 125g 1개','1,260원','무료배송','')])assert.equal(parseDetail(d).failure,'PAGE_CHANGED');
 assert.equal(parseDetail({...detail(),offer:{...detail().offer,priceText:'',text:'배송비 3,000원'}}).failure,'PAGE_CHANGED');
 assert.equal(parseDetail({...detail(),offer:{...detail().offer,conditionText:'쿠폰가'}}).failure,'PAGE_CHANGED');
});
test('normal selected offer includes shipping, seller and ordinary condition',()=>{const d=parseDetail(detail());assert.equal(d.shippingFee,3000);assert.equal(d.seller,'판매자 A');assert.equal(d.priceCondition,'일반가');assert.equal(d.quantity,'1개');});
test('same observed card and detail emit complete server evidence',async()=>{const [o]=await collectBatch(task([search(),detail()]),[target],{pauseMs:0});assert.equal(o.failure,undefined);assert.equal(o.comparisonQuantity,1);assert.equal(o.searchCard.title,'해태 비스킷 125g 1개');assert.equal(o.searchCard.productId,o.productId);assert.equal(o.searchCard.shippingFee,o.shippingFee);assert.equal(o.displayedPrice,1260);});
test('Lotus target twenty excludes one-pack card and retains raw total',async()=>{
 const p={slug:'lotus',name:'로투스 비스코프',brand:'로투스',spec:'125g',quantity:'20개',comparisonQuantity:20,referencePrice:25950};
 const one=card('로투스 비스코프 125g 1개','1,260원','배송비 3,000원',url.replace('=3','=4'));
 const twenty=card('로투스 비스코프 125g 20개','25,950원','무료배송');
 const [o]=await collectBatch(task([search([one,twenty]),detail('로투스 비스코프 125g 20개','25,950원','무료배송')]),[p],{pauseMs:0});assert.equal(o.failure,undefined);assert.equal(o.displayedPrice,25950);assert.equal(o.comparisonQuantity,20);assert.equal(o.quantity,'20개');assert.equal(o.searchCard.title,twenty.card.title);
});
test('Samdasu q1 retains the inner twenty-bottle PX unit',async()=>{const p={slug:'water',name:'제주삼다수 그린',brand:'제주삼다수',spec:'500ml',quantity:'20병',comparisonQuantity:1};const c=card('제주삼다수 그린 500ml 20병','12,000원','무료배송');const [o]=await collectBatch(task([search([c]),detail(c.card.title,'12,000원','무료배송')]),[p],{pauseMs:0});assert.equal(o.displayedPrice,12000);assert.equal(o.comparisonQuantity,1);assert.equal(o.quantity,'20병');});
test('catalog aliases drive concise search and exact card/detail matching for Samdasu',async()=>{
 const p={slug:'water',name:'제주삼다수 그린 500ml×20병',brand:'광동제약',spec:'500ml*20pet',quantity:'20병',comparisonQuantity:1,comparisonAliases:['제주삼다수 그린','제주삼다수','삼다수'],comparisonSearchQuery:'삼다수 500ml 20병'};
 const title='제주삼다수 500ml 20병';const c=card(title,'8,900원','무료배송');const t=task([search([c]),detail(title,'8,900원','무료배송')]);let searched='';const page=t.page();const goto=page.goto;page.goto=async url=>{if(!searched)searched=url;await goto(url);};t.page=()=>page;
 const [o]=await collectBatch(t,[p],{pauseMs:0});assert.equal(o.failure,undefined);assert.equal(o.displayedPrice,8900);assert.equal(o.comparisonQuantity,1);assert.equal(o.brand,'제주삼다수');assert.equal(new URL(searched).searchParams.get('q'),'삼다수 500ml 20병');
});
test('alias card and selected detail must name the same verified item',async()=>{
 const p={slug:'water',name:'제주삼다수 그린 500ml×20병',brand:'광동제약',spec:'500ml',quantity:'20병',comparisonQuantity:1,comparisonAliases:['제주삼다수','삼다수']};
 const [o]=await collectBatch(task([search([card('제주삼다수 500ml 20병')]),detail('삼다수 500ml 20병')]),[p],{pauseMs:0});assert.equal(o.failure,'AMBIGUOUS_MATCH');
});
test('collector keeps an original catalog title when a separate alias exists',async()=>{
 const p={slug:'cookie',name:'제조사 믹스 125g',brand:'제조사',spec:'125g',quantity:'20개',comparisonQuantity:20,comparisonAliases:['믹스쿠키']};
 const title='제조사 믹스 125g 20개';
 const [o]=await collectBatch(task([search([card(title,'16,000원','무료배송')]),detail(title,'16,000원','무료배송')]),[p],{pauseMs:0});
 assert.equal(o.failure,undefined);assert.equal(o.displayedPrice,16000);assert.ok(o.brand);
});
test('Dunkin six-pack, coupon and missing selected count fail closed',async()=>{
 const p={slug:'dunkin',name:'던킨 커피',brand:'던킨',spec:'400ml',quantity:'24개',comparisonQuantity:24};const c=card('던킨 커피 400ml 24개','27,600원','무료배송');
 for(const d of [detail('던킨 커피 400ml 6개','27,600원','무료배송'),detail('던킨 커피 400ml','27,600원','무료배송'),{...detail(c.card.title,'27,600원','무료배송'),offer:{...detail(c.card.title,'27,600원','무료배송').offer,conditionText:'쿠폰가 26,310원'}}]){const [o]=await collectBatch(task([search([c]),d]),[p],{pauseMs:0});assert.ok(o.failure);}
});
test('same-option competing sellers and conflicting raw price remain ambiguous',async()=>{for(const cards of [[card(),card('해태 비스킷 125g 1개','1,500원','배송비 3,000원',url.replace('=3','=4'))],[card(),card('해태 비스킷 125g 1개','1,500원')]]){const [o]=await collectBatch(task([search(cards)]),[target],{pauseMs:0});assert.equal(o.failure,'AMBIGUOUS_MATCH');}});
test('card/detail price, shipping or seller disagreement cannot form accepted evidence',async()=>{for(const d of [detail(undefined,'1,500원'),detail(undefined,undefined,'무료배송')]){const [o]=await collectBatch(task([search(),d]),[target],{pauseMs:0});assert.equal(o.failure,'AMBIGUOUS_MATCH');}const c={...card(),card:{...card().card,seller:'판매자 B'}};const [o]=await collectBatch(task([search([c]),detail()]),[target],{pauseMs:0});assert.equal(o.failure,'AMBIGUOUS_MATCH');});
test('known item identity and detail ID cannot change',async()=>{for(const [p,d] of [[{...target,existingCoupangUrl:url.replace('=2','=9')},detail()],[target,detail(undefined,undefined,undefined,undefined,url.replace('=2','=9'))]]){const [o]=await collectBatch(task([search(),d]),[p],{pauseMs:0});assert.equal(o.failure,'IDENTITY_CHANGED');}});
test('25 percent raw-bundle delta rechecks the selected offer',async()=>{const p={...target,previousPrice:1000};const c=card(undefined,'1,250원');const d=detail(undefined,'1,250원');const [o]=await collectBatch(task([search([c]),d,d]),[p],{pauseMs:0});assert.equal(o.recheck.displayedPrice,1250);assert.ok(o.recheck.observedAt>o.observedAt);});
test('recheck changes in seller or shipping fail',async()=>{const p={...target,previousPrice:1000};const c=card(undefined,'1,250원');const d=detail(undefined,'1,250원');for(const changed of [detail(undefined,'1,250원',undefined,'B'),detail(undefined,'1,250원','무료배송')]){const [o]=await collectBatch(task([search([c]),d,changed]),[p],{pauseMs:0});assert.equal(o.failure,'RECHECK_DISAGREED');}});
test('missing target, nested count and block do not create prices',async()=>{
 for(const p of [{...target,quantity:null},{...target,quantity:'2개',name:'130입 간식',comparisonQuantity:2}]){const [o]=await collectBatch(task([]),[p],{pauseMs:0});assert.equal(o.failure,'NO_EXACT_MATCH');}
 const t=task([{text:'Access Denied',cards:[]}]);const out=await collectBatch(t,[target,target],{pauseMs:0});assert.equal(out.length,1);assert.equal(out[0].failure,'BLOCKED');assert.equal(t.finished,false);
});
test('search diagnostics identify rejected evidence and matching reasons without changing failures',async()=>{
 const messages=[];
 const wrong=card('해태 비스킷 125g 2개');
 const noShipping=card('해태 비스킷 125g 1개','1,260원','');
 const [o]=await collectBatch(task([search([wrong,noShipping])]),[target],{pauseMs:0,diagnostic:m=>messages.push(m)});
 assert.equal(o.failure,'NO_EXACT_MATCH');
 assert.deepEqual(Object.keys(o).sort(),['failure','observationId','observedAt','slug','sourceUrl']);
 assert.ok(messages.some(m=>m.includes('QUANTITY_MISMATCH')));
 assert.ok(messages.some(m=>m.includes('SHIPPING_UNVERIFIED')));
 assert.ok(messages.some(m=>m.includes('score=')));
});
test('detail diagnostics distinguish missing offer, conditional price and ambiguous price',async()=>{
 for(const [page,reason] of [[{url,text:'',offer:null},'OFFER_UNVERIFIED'],[{...detail(),offer:{...detail().offer,conditionText:'쿠폰가'}},'CONDITIONAL_PRICE'],[detail(undefined,'1,260원\n1,500원'),'AMBIGUOUS_PRICE']]){
  const messages=[];const [o]=await collectBatch(task([search(),page]),[target],{pauseMs:0,diagnostic:m=>messages.push(m)});
  assert.equal(o.failure,'PAGE_CHANGED');assert.ok(messages.some(m=>m.includes(reason)),reason);
 }
});
test('diagnostics bound card samples and omit raw card text',async()=>{
 const messages=[];const cards=Array.from({length:12},(_,i)=>card(`secret-token-${i} 125g 1개`,'1,260원',''));
 await collectBatch(task([search(cards)]),[target],{pauseMs:0,diagnostic:m=>messages.push(m)});
 const samples=messages.filter(m=>m.startsWith('search-card '));
 assert.ok(samples.length<=3);assert.ok(messages.some(m=>m.includes('omitted=')));
 assert.equal(messages.join(' ').includes('secret-token'),false);
});
test('selected detail mismatch logs match score and preserves fail closed result',async()=>{
 const messages=[];
 const [o]=await collectBatch(task([search(),detail('해태 다른 비스킷 125g 1개')]),[target],{pauseMs:0,diagnostic:m=>messages.push(m)});
 assert.equal(o.failure,'NO_EXACT_MATCH');
 assert.ok(messages.some(m=>m.includes('detail ')&&m.includes('LOW_MATCH_SCORE')&&m.includes('score=')));
});
test('detail diagnostics classify only distinct surviving ordinary prices as ambiguous',async()=>{
 const cases=[
  [detail(undefined,'1,260원\n배송비 3,000원',''),'SHIPPING_UNVERIFIED','PAGE_CHANGED'],
  [detail(undefined,'1,260원\n1,260원',''),'SHIPPING_UNVERIFIED','PAGE_CHANGED'],
  [detail(undefined,'0원\n1,260원'),'PRICE_UNVERIFIED','NO_PRICE'],
  [detail(undefined,'1,260원\n1,500원'),'AMBIGUOUS_PRICE','PAGE_CHANGED'],
  [detail(undefined,'1,260원','배송비 3,000원',undefined,url.replace('vendorItemId=3','')),'IDS_UNVERIFIED','PAGE_CHANGED'],
 ];
 for(const [page,reason,failure] of cases){const messages=[];const [o]=await collectBatch(task([search(),page]),[target],{pauseMs:0,diagnostic:m=>messages.push(m)});assert.equal(o.failure,failure);assert.ok(messages.some(m=>m===`detail item=1 reason=${reason}`),reason);}
});
test('search summary counts all rejected cards beyond the first three samples',async()=>{
 const cards=[...Array.from({length:5},(_,i)=>card(`unrelated-${i} 125g 1개`,'1,260원','')),
  card('해태 비스킷 125g 2개'),card('해태 비스킷 125g 1개','1,260원','')];
 const messages=[];const [o]=await collectBatch(task([search(cards)]),[target],{pauseMs:0,diagnostic:m=>messages.push(m)});
 assert.equal(o.failure,'NO_EXACT_MATCH');
 const summary=messages.find(m=>m.startsWith('search-summary '));
 assert.match(summary,/SHIPPING_UNVERIFIED:6/);
 assert.match(summary,/QUANTITY_MISMATCH:1/);
 assert.match(summary,/omitted=4/);
 assert.equal(messages.filter(m=>m.startsWith('search-card ')).length,3);
 assert.equal(messages.join(' ').includes('unrelated-'),false);
});
test('search summary records the best rejected match score with fixed reason codes',async()=>{
 const cards=[card('다른 상품 125g 1개'),card('해태 다른 비스킷 125g 1개'),card('해태 비스킷 125g 2개')];
 const messages=[];await collectBatch(task([search(cards)]),[target],{pauseMs:0,diagnostic:m=>messages.push(m)});
 const summary=messages.find(m=>m.startsWith('search-summary '));
 assert.match(summary,/bestRejected=score:80,reason:QUANTITY_MISMATCH/);
 assert.match(summary,/matchReasons:QUANTITY_MISMATCH/);
 assert.equal(messages.join(' ').includes('해태'),false);
});
