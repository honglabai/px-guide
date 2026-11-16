import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/index.js';
import { recordObservation } from '../price/store.mjs';
import { collectBatch } from '../price/browser-extract.mjs';
import {comparisonBasisKey} from '../price/comparison-basis.mjs';
const catalog = [{slug:'sample-item',name:'Sample',brand:'Brand',spec:'100ml',quantity:'1개',option:null,comparisonKind:'sameBundle',comparisonQuantity:1,referencePrice:1000}];
function setup(loadedCatalog=catalog) {
 const sqlite = new DatabaseSync(':memory:');
 for (const file of ['0000_supreme_ozymandias.sql','0001_moaning_true_believers.sql','0002_gorgeous_the_executioner.sql','0003_verified_bundle_basis.sql','0004_verified_offer_evidence.sql']) sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
 const env = {PRICE_ADMIN_EMAIL:`${crypto.randomUUID()}@example.invalid`, DB:{prepare(sql){return {bind(...args){ if(args.length>100) throw new Error('D1 bind limit exceeded'); const stmt=sqlite.prepare(sql);return {run:async()=>stmt.run(...args),first:async()=>stmt.get(...args)??null,all:async()=>({results:stmt.all(...args)})};}};}},ASSETS:{fetch:async request=>new URL(request.url).pathname==='/price-catalog.json'?Response.json(loadedCatalog):new Response('asset')}};
 const request = (path,body,owner=false,headers={})=>worker.fetch(new Request(`https://example.test${path}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(owner?{'oai-authenticated-user-email':env.PRICE_ADMIN_EMAIL}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 const rpc=(name,args={},owner=true)=>request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},owner);
 return {env,sqlite,request,rpc};
}
const observation = (extra={})=>{const value={observationId:crypto.randomUUID(),slug:'sample-item',title:'Sample 100ml 1개',brand:'Brand',spec:'100ml',quantity:'1개',displayedPrice:1000,shippingFee:0,seller:'Seller',priceCondition:'일반가',productId:'p1',itemId:'i1',vendorItemId:'v1',sourceUrl:'https://www.coupang.com/vp/products/123',observedAt:new Date().toISOString(),...extra};return {...value,searchCard:Object.hasOwn(extra,'searchCard')?extra.searchCard:{title:value.title,brand:value.brand,spec:value.spec,quantity:value.quantity,option:value.option,displayedPrice:value.displayedPrice,shippingFee:value.shippingFee,productId:value.productId,itemId:value.itemId,vendorItemId:value.vendorItemId,priceCondition:'일반가'}};};
test('one price index contains the same verified values as every bounded price batch',async()=>{
 const items=Array.from({length:110},(_,i)=>({...catalog[0],slug:'sample-'+i}));const {sqlite,request}=setup(items);
 for(const p of items)sqlite.prepare('INSERT INTO coupang_price_current(product_slug,normalized_name,normalized_spec,normalized_quantity,displayed_price,source_url,match_score,checked_at,last_history_id,comparison_quantity,comparison_basis) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(p.slug,p.name,p.spec,'1개',2000,'https://www.coupang.com/vp/products/123',100,'2026-10-24T00:00:00Z',1,1,comparisonBasisKey(p));
 const r=await request('/api/prices/index');assert.equal(r.status,200);const index=(await r.json()).prices;assert.equal(index.length,110);
 const old=[];for(let i=0;i<items.length;i+=100)old.push(...(await (await request('/api/prices?slugs='+items.slice(i,i+100).map(p=>p.slug).join(','))).json()).prices);
 assert.deepEqual(index.sort((a,b)=>a.slug.localeCompare(b.slug)),old.sort((a,b)=>a.slug.localeCompare(b.slug)));
});
test('owner authorization gates admin reads/writes and MCP calls; body identity cannot authorize',async()=>{
 const {request,env}=setup();
 for(const headers of [{},{'oai-authenticated-user-email':'other@example.invalid'},{authorization:'Bearer fake'}]) {
  assert.equal((await request('/api/admin/prices',undefined,false,headers)).status,403);
  assert.equal((await request('/api/admin/prices/review',{historyId:1,action:'ACCEPT',email:env.PRICE_ADMIN_EMAIL},false,headers)).status,403);
  assert.equal((await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'seed_price_queue',arguments:{}}},false,headers)).status,403);
 }
 env.PRICE_ADMIN_EMAIL=''; assert.equal((await request('/api/admin/prices',undefined,true)).status,403);
});
test('MCP discovery and four tool schemas are public metadata',async()=>{
 const {request}=setup();
 const discover=await request('/mcp',{jsonrpc:'2.0',id:3,method:'server/discover'});
 assert.deepEqual((await discover.json()).result.supportedVersions,['2026-07-28']);
 const list=await request('/mcp',{jsonrpc:'2.0',id:4,method:'tools/list'});
 const data=await list.json();assert.equal(data.id,4);
 assert.deepEqual(data.result.tools.map(t=>t.name),['seed_price_queue','get_price_batch','submit_price_observations','review_price_observation']);
 for(const tool of data.result.tools) assert.equal(tool.inputSchema.type,'object');
});
test('owner seeds, claims, submits and public reads accepted projections only',async()=>{
 const {rpc,request,sqlite}=setup();
 assert.equal((await rpc('seed_price_queue',{offset:0,limit:10})).status,200);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM price_update_queue').get().n,1);
 const claimed=await (await rpc('get_price_batch',{limit:20})).json();
 assert.equal(JSON.parse(claimed.result.content[0].text).items[0].slug,'sample-item');
 assert.equal((await rpc('submit_price_observations',{observations:[observation()]})).status,200);
 await rpc('submit_price_observations',{observations:[observation({displayedPrice:5000})]});
 const res=await request('/api/prices?slugs=sample-item');assert.equal(res.headers.get('cache-control'),'no-store');
 const data=await res.json();assert.equal(data.prices.length,1);assert.equal(data.prices[0].displayedPrice,1000);
 assert.equal(data.prices[0].comparisonQuantity,1);assert.equal(data.prices[0].comparisonUnitPrice,1000);
 const admin=await (await request('/api/admin/prices',undefined,true)).json();assert.equal(admin.history.length,2);assert.equal(admin.queue.length,1);
 const id=sqlite.prepare("SELECT id FROM price_history WHERE status='REVIEW'").get().id;
 assert.equal((await request('/api/admin/prices/review',{historyId:id,action:'REJECT'},true)).status,200);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM price_history WHERE entry_kind='REVIEW_DECISION'").get().n,1);
});
test('invalid observations reject whole batch before writes and server ignores supplied score',async()=>{
 const {rpc,sqlite}=setup();
 for(const extra of [{slug:'../bad'},{slug:'unknown'},{displayedPrice:0},{displayedPrice:1.5},{sourceUrl:'https://coupang.com.evil.test/x'},{sourceUrl:'http://coupang.com/x'},{sourceUrl:'https://user:pass@coupang.com/x'},{observedAt:'bad'},{title:null}]) {
  assert.equal((await rpc('submit_price_observations',{observations:[observation(),observation(extra)]})).status,400,JSON.stringify(extra));
 }
 assert.equal((await rpc('submit_price_observations',{observations:Array.from({length:21},()=>observation())})).status,400);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM price_history').get().n,0);
 await rpc('submit_price_observations',{observations:[observation({spec:'200ml',matchScore:100,hardMismatch:false})]});
 assert.equal(sqlite.prepare('SELECT status FROM price_history').get().status,'REJECT');
});
test('first price uses catalog reference only as an anomaly guard, with server-checked second observation',async()=>{
 const recheckFor=first=>({displayedPrice:first.displayedPrice,sourceUrl:first.sourceUrl,productId:first.productId,itemId:first.itemId,vendorItemId:first.vendorItemId,observedAt:new Date(Date.parse(first.observedAt)+1000).toISOString()});
 const submit=async (extra,withRecheck=false)=>{
  const {rpc,sqlite,request}=setup();
  const first=observation({observedAt:new Date(Date.now()-2000).toISOString(),productId:'123',itemId:'456',vendorItemId:'789',...extra});
  if(withRecheck) first.recheck=recheckFor(first);
  const response=await rpc('submit_price_observations',{observations:[first]});
  const result=await response.json();
  return {response,result:result.result&&JSON.parse(result.result.content[0].text).results[0],sqlite,request,first};
 };
 const unverified=await submit({displayedPrice:1300,reverified:true});
 assert.equal(unverified.result.status,'REVERIFY');
 assert.equal(unverified.sqlite.prepare('SELECT count(*) n FROM coupang_price_current').get().n,0);
 const verified=await submit({displayedPrice:1300},true);
 assert.equal(verified.result.status,'ACCEPT');
 assert.equal((await (await verified.request('/api/prices?slugs=sample-item')).json()).prices[0].displayedPrice,1300);
 const tooLarge=await submit({displayedPrice:1500},true);
 assert.equal(tooLarge.result.status,'REVIEW');
 for (const bad of [{displayedPrice:1400},{sourceUrl:'https://evil.test/'},{itemId:'other'},{observedAt:new Date(Date.now()-10000).toISOString()}]) {
  const base=observation({displayedPrice:1300,observedAt:new Date(Date.now()-2000).toISOString(),productId:'123',itemId:'456',vendorItemId:'789'});
  const {rpc}=setup();
  const response=await rpc('submit_price_observations',{observations:[{...base,recheck:{...recheckFor(base),...bad}}]});
  assert.equal(response.status,400,JSON.stringify(bad));
 }
});
test('replayed observation ID reports stored decision and fresh recheck needs a new ID',async()=>{
 const {rpc,sqlite,request}=setup();
 const submit=async item=>JSON.parse((await (await rpc('submit_price_observations',{observations:[item]})).json()).result.content[0].text).results[0];
 const first=observation({displayedPrice:1300,observedAt:new Date(Date.now()-5000).toISOString(),productId:'123',itemId:'456',vendorItemId:'789'});
 const recheck={displayedPrice:1300,sourceUrl:first.sourceUrl,productId:first.productId,itemId:first.itemId,vendorItemId:first.vendorItemId,observedAt:new Date(Date.parse(first.observedAt)+1000).toISOString()};
 assert.equal((await submit(first)).status,'REVERIFY');
 const reused=await rpc('submit_price_observations',{observations:[{...first,recheck}]});
 assert.equal(reused.status,400);
 assert.match((await reused.json()).result.content[0].text,/new observationId/);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM price_history').get().n,1);
 assert.deepEqual((await (await request('/api/prices?slugs=sample-item')).json()).prices,[]);
 const fresh=await submit({...first,observationId:crypto.randomUUID(),recheck});
 assert.equal(fresh.status,'ACCEPT');
 assert.equal((await (await request('/api/prices?slugs=sample-item')).json()).prices[0].displayedPrice,1300);
});
test('replay uses persisted decision after another observation changes the price baseline',async()=>{
 const {rpc,sqlite}=setup();
 const submit=async item=>JSON.parse((await (await rpc('submit_price_observations',{observations:[item]})).json()).result.content[0].text).results[0];
 const first=observation({displayedPrice:1300,observedAt:new Date(Date.now()-5000).toISOString()});
 assert.equal((await submit(first)).status,'REVERIFY');
 assert.equal((await submit(observation({displayedPrice:1100,observedAt:new Date(Date.now()-2000).toISOString()}))).status,'ACCEPT');
 const replay=await submit(first);
 const stored=sqlite.prepare("SELECT status, reason FROM price_history WHERE observation_id = ?").get(first.observationId);
 assert.equal(replay.status,stored.status);
 assert.equal(replay.reason,stored.reason);
 assert.equal(replay.status,'REVERIFY');
 assert.equal(sqlite.prepare('SELECT displayed_price FROM coupang_price_current').get().displayed_price,1100);
});
test('public query limits, interest validation and cross-origin write rejection',async()=>{
 const {request}=setup();
 for(const query of ['', '../bad',Array.from({length:101},(_,i)=>`item-${i}`).join(',')]) assert.equal((await request(`/api/prices?slugs=${query}`)).status,400);
 const valid=await request('/api/interest',{slug:'sample-item',kind:'favorite'});assert.equal(valid.status,200);assert.deepEqual(await valid.json(),{recorded:true});
 for(const event of [{slug:'sample-item',kind:'remove'},{slug:'unknown',kind:'shopping'},{slug:'../bad',kind:'favorite'}]) assert.equal((await request('/api/interest',event)).status,400);
 assert.equal((await request('/api/interest',{slug:'sample-item',kind:'shopping'},false,{origin:'https://evil.test'})).status,403);
 assert.equal((await request('/api/admin/prices/review',{historyId:1,action:'ACCEPT'},true,{origin:'https://evil.test'})).status,403);
});
test('malformed requests fail safely and existing visitor and asset routes survive',async()=>{
 const {request,env}=setup();
 const malformed=await worker.fetch(new Request('https://example.test/mcp',{method:'POST',body:'{'}),env);assert.equal(malformed.status,400);
 assert.equal((await request('/mcp')).status,405);
 assert.equal((await request('/api/prices?slugs=sample-item',{})).status,405);
 assert.equal((await request('/api/visitors/today',{})).status,200);
 assert.equal((await (await request('/api/visitors/today')).json()).count,1);
 assert.equal(await (await request('/launch/')).text(),'asset');
});
test('failure attempts preserve current price and schedule exponential retry',async()=>{
 const {rpc,sqlite}=setup();await rpc('seed_price_queue');await rpc('get_price_batch');await rpc('submit_price_observations',{observations:[observation()]});
 let attempt=0;
 for(const failure of ['CAPTCHA','NO_PRICE','NETWORK_ERROR','PAGE_CHANGED']){
 sqlite.prepare('UPDATE price_update_queue SET attempts = ?, last_checked_at = NULL').run(++attempt);
 const value={observationId:crypto.randomUUID(),slug:'sample-item',failure,sourceUrl:'https://www.coupang.com/np/search?q=sample',observedAt:new Date().toISOString()};
 assert.equal((await rpc('submit_price_observations',{observations:[value]})).status,200);
 assert.equal(sqlite.prepare('SELECT displayed_price FROM coupang_price_current').get().displayed_price,1000);
 const queue=sqlite.prepare('SELECT * FROM price_update_queue').get();assert.equal(queue.status,'RETRY');assert.ok(Date.parse(queue.next_attempt_at)>Date.now());
 const history=sqlite.prepare('SELECT * FROM price_history ORDER BY id DESC').get();
 assert.equal(Date.parse(queue.next_attempt_at)-Date.parse(history.attempted_at),300000*2**(attempt-1));
 assert.equal((await rpc('review_price_observation',{historyId:history.id,action:'ACCEPT'})).status,400);
 assert.equal(sqlite.prepare('SELECT observed_price FROM price_history ORDER BY id DESC').get().observed_price,null);
 }
});

test('missing or contradictory online quantity cannot be accepted by review',async()=>{
 const {rpc,request,sqlite}=setup();
 for (const extra of [{title:'Sample 100ml',quantity:null},{title:'Sample 100ml 1개',quantity:'2개'}]) {
  const result=JSON.parse((await (await rpc('submit_price_observations',{observations:[observation(extra)]})).json()).result.content[0].text).results[0];
  assert.equal(result.status,'REJECT');
  const id=sqlite.prepare('SELECT id FROM price_history ORDER BY id DESC').get().id;
  assert.equal((await request('/api/admin/prices/review',{historyId:id,action:'ACCEPT'},true)).status,400);
 }
 assert.equal(sqlite.prepare('SELECT count(*) n FROM coupang_price_current').get().n,0);
});

test('server scales static reference by q and preserves an accepted raw bundle total',async()=>{
 const product={...catalog[0],quantity:null,comparisonQuantity:20};
 const {rpc,request,sqlite}=setup([product]);
 const batch=JSON.parse((await (await rpc('get_price_batch')).json()).result.content[0].text).items;
 assert.equal(batch.length,0);
 await rpc('seed_price_queue');
 const claimed=JSON.parse((await (await rpc('get_price_batch')).json()).result.content[0].text).items[0];
 assert.equal(claimed.referencePrice,20000);
 assert.equal(claimed.quantity,'20개');
 const value=observation({title:'Sample 100ml 20개',quantity:'20개',displayedPrice:24000,comparisonQuantity:20});
 const result=JSON.parse((await (await rpc('submit_price_observations',{observations:[value]})).json()).result.content[0].text).results[0];
 assert.equal(result.status,'ACCEPT');
 const current=(await (await request('/api/prices?slugs=sample-item')).json()).prices[0];
 assert.equal(current.displayedPrice,24000);
 assert.equal(current.comparisonQuantity,20);
 assert.equal(current.comparisonUnitPrice,1200);
 assert.equal(sqlite.prepare('SELECT comparison_quantity FROM price_history').get().comparison_quantity,20);
 assert.equal(JSON.parse(sqlite.prepare('SELECT search_card FROM price_history').get().search_card).quantity,'20개');
 assert.ok(sqlite.prepare('SELECT comparison_basis FROM coupang_price_current').get().comparison_basis);
 product.comparisonQuantity=2;
 const changed=JSON.parse((await (await rpc('submit_price_observations',{observations:[observation({title:'Sample 100ml 2개',quantity:'2개',displayedPrice:2400,comparisonQuantity:2})]})).json()).result.content[0].text).results[0];
 assert.equal(changed.status,'REVIEW');
 assert.equal(changed.reason,'COMPARISON_BASIS_CHANGED');
 const id=sqlite.prepare('SELECT id FROM price_history ORDER BY id DESC').get().id;
 assert.deepEqual((await (await request('/api/prices?slugs=sample-item')).json()).prices,[]);
 assert.equal((await request('/api/admin/prices/review',{historyId:id,action:'ACCEPT'},true)).status,200);
 assert.equal((await (await request('/api/prices?slugs=sample-item')).json()).prices[0].comparisonQuantity,2);
});

test('a legacy current row without a basis cannot be silently replaced',async()=>{
 const {rpc,sqlite}=setup();
 await rpc('submit_price_observations',{observations:[observation()]});
 sqlite.prepare('UPDATE coupang_price_current SET comparison_quantity = NULL').run();
 const response=await rpc('submit_price_observations',{observations:[observation({displayedPrice:1000})]});
 const result=JSON.parse((await response.json()).result.content[0].text).results[0];
 assert.equal(result.status,'REVIEW');
 assert.equal(result.reason,'COMPARISON_BASIS_CHANGED');
 assert.equal(sqlite.prepare('SELECT comparison_quantity FROM coupang_price_current').get().comparison_quantity,null);
});

test('conditional coupon, Wow, and card prices never become current',async()=>{
 for (const priceCondition of ['쿠폰 적용가','와우 회원가','카드 할인가']) {
  const {rpc,sqlite,request}=setup();
  const result=JSON.parse((await (await rpc('submit_price_observations',{observations:[observation({priceCondition})]})).json()).result.content[0].text).results[0];
  assert.notEqual(result.status,'ACCEPT',priceCondition);
  const id=sqlite.prepare('SELECT id FROM price_history').get().id;
  assert.equal((await request('/api/admin/prices/review',{historyId:id,action:'ACCEPT'},true)).status,400);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM coupang_price_current').get().n,0);
 }
});

test('changing PX inner pack at q1 preserves prior current',async()=>{
 const product={...catalog[0],quantity:'20병'};
 const {rpc,sqlite,request}=setup([product]);
 const first=observation({title:'Sample 100ml 20병',quantity:'20병',displayedPrice:1000});
 assert.equal(JSON.parse((await (await rpc('submit_price_observations',{observations:[first]})).json()).result.content[0].text).results[0].status,'ACCEPT');
 product.quantity='24병';
 const next=observation({title:'Sample 100ml 24병',quantity:'24병',displayedPrice:1000});
 const result=JSON.parse((await (await rpc('submit_price_observations',{observations:[next]})).json()).result.content[0].text).results[0];
 assert.equal(result.status,'REVIEW');
 assert.equal(result.reason,'COMPARISON_BASIS_CHANGED');
 const id=sqlite.prepare('SELECT id FROM price_history ORDER BY id DESC').get().id;
 assert.deepEqual((await (await request('/api/prices?slugs=sample-item')).json()).prices,[]);
 const admin=(await (await request('/api/admin/prices',undefined,true)).json());
 const prior=admin.current.find(row=>row.slug==='sample-item');
 assert.equal(prior.displayedPrice,1000);
 assert.equal(prior.normalizedQuantity,'20병');
 assert.equal(prior.comparisonQuantity,1);
 assert.notEqual(prior.comparisonBasisKey,null);
 assert.equal(admin.pending.find(row=>row.id===id).reason,'COMPARISON_BASIS_CHANGED');
 assert.equal((await request('/api/admin/prices/review',{historyId:id,action:'ACCEPT'},true)).status,200);
 const updated=(await (await request('/api/prices?slugs=sample-item')).json()).prices[0];
 assert.equal(updated.normalizedQuantity,'24병');
 assert.equal(updated.comparisonQuantity,1);
});

test('search card evidence must agree with selected detail before acceptance',async()=>{
 for (const mismatch of [null,{quantity:'2개'},{vendorItemId:'different'},{vendorItemId:undefined},{displayedPrice:900},{shippingFee:3000},{seller:'Other seller'},{priceCondition:'쿠폰가'}]) {
  const {rpc,sqlite}=setup();
  const card={title:'Sample 100ml 1개',brand:'Brand',spec:'100ml',quantity:'1개',productId:'p1',itemId:'i1',vendorItemId:'v1',displayedPrice:1000,shippingFee:0};
  const value=observation({productId:'p1',itemId:'i1',vendorItemId:'v1',shippingFee:0,searchCard:mismatch===null?undefined:{...card,...mismatch}});
  const response=await rpc('submit_price_observations',{observations:[value]});
  const result=JSON.parse((await response.json()).result.content[0].text).results[0];
  assert.notEqual(result.status,'ACCEPT',JSON.stringify(mismatch));
  assert.equal(sqlite.prepare('SELECT count(*) n FROM coupang_price_current').get().n,0);
 }
});

test('real Samdasu catalog alias accepts the same 500ml twenty-bottle offer on card and detail',async()=>{
 const product=JSON.parse(readFileSync(new URL('../content/products.json',import.meta.url),'utf8')).find(item=>item.slug==='samdasu-green-500x20');
 const {rpc,request}=setup([product]);
 const title='제주삼다수 500ml 20병';
 const value=observation({slug:product.slug,title,brand:'광동제약',spec:'500ml',quantity:'20병',comparisonQuantity:1,displayedPrice:8900,searchCard:{title,brand:'광동제약',spec:'500ml',quantity:'20병',productId:'p1',itemId:'i1',vendorItemId:'v1',displayedPrice:8900,shippingFee:0,priceCondition:'일반가'}});
 const result=JSON.parse((await (await rpc('submit_price_observations',{observations:[value]})).json()).result.content[0].text).results[0];
 assert.equal(result.status,'ACCEPT');
 const [current]=(await (await request('/api/prices?slugs='+product.slug)).json()).prices;
 assert.equal(current.displayedPrice,8900);assert.equal(current.comparisonUnitPrice,8900);
});

test('generic verified alias preserves outer-bundle normalization and rejects variant, size, or count changes',async()=>{
 const product={slug:'mix-cookie',name:'제조사 믹스 125g',brand:'제조사',spec:'125g',comparisonKind:'sameBundle',comparisonQuantity:20,comparisonAliases:['믹스쿠키'],referencePrice:800};
 const submit=async title=>{const {rpc,request,sqlite}=setup([product]);const value=observation({slug:product.slug,title,brand:'제조사',spec:'125g',quantity:'20개',comparisonQuantity:20,displayedPrice:16000,searchCard:{title,brand:'제조사',spec:'125g',quantity:'20개',productId:'p1',itemId:'i1',vendorItemId:'v1',displayedPrice:16000,shippingFee:0,priceCondition:'일반가'}});const result=JSON.parse((await (await rpc('submit_price_observations',{observations:[value]})).json()).result.content[0].text).results[0];return {result,current:(await (await request('/api/prices?slugs='+product.slug)).json()).prices,sqlite};};
 const exact=await submit('믹스쿠키 125g 20개');assert.equal(exact.result.status,'ACCEPT');assert.equal(exact.current[0].displayedPrice,16000);assert.equal(exact.current[0].comparisonUnitPrice,800);
 const original=await submit('제조사 믹스 125g 20개');assert.equal(original.result.status,'ACCEPT');assert.equal(original.current[0].comparisonUnitPrice,800);
 for(const title of ['믹스쿠키 초코 125g 20개','믹스쿠키 200g 20개','믹스쿠키 125g 24개']){const bad=await submit(title);assert.notEqual(bad.result.status,'ACCEPT',title);assert.equal(bad.current.length,0,title);}
});

test('alias card and detail names must agree despite both being allowed aliases',async()=>{
 const product={slug:'water',name:'제주삼다수 그린 500ml×20병',brand:'광동제약',spec:'500ml',comparisonKind:'sameBundle',comparisonQuantity:1,comparisonAliases:['제주삼다수','삼다수'],referencePrice:8900};
 const {rpc,request}=setup([product]);
 const value=observation({slug:'water',title:'삼다수 500ml 20병',brand:'광동제약',spec:'500ml',quantity:'20병',displayedPrice:8900,searchCard:{title:'제주삼다수 500ml 20병',brand:'광동제약',spec:'500ml',quantity:'20병',productId:'p1',itemId:'i1',vendorItemId:'v1',displayedPrice:8900,shippingFee:0,priceCondition:'일반가'}});
 const result=JSON.parse((await (await rpc('submit_price_observations',{observations:[value]})).json()).result.content[0].text).results[0];
 assert.notEqual(result.status,'ACCEPT');assert.deepEqual((await (await request('/api/prices?slugs=water')).json()).prices,[]);
});

test('server refuses a spoofed brand for an unaliased original title',async()=>{
 const product={slug:'mix',name:'믹스 125g',brand:'제조사',spec:'125g',comparisonKind:'sameBundle',comparisonQuantity:20,comparisonAliases:['믹스쿠키'],referencePrice:800};
 const {rpc,request}=setup([product]);const title='믹스 125g 20개';
 const value=observation({slug:'mix',title,brand:'제조사',spec:'125g',quantity:'20개',comparisonQuantity:20,displayedPrice:16000,searchCard:{title,brand:'제조사',spec:'125g',quantity:'20개',productId:'p1',itemId:'i1',vendorItemId:'v1',displayedPrice:16000,shippingFee:0,priceCondition:'일반가'}});
 const result=JSON.parse((await (await rpc('submit_price_observations',{observations:[value]})).json()).result.content[0].text).results[0];
 assert.notEqual(result.status,'ACCEPT');assert.deepEqual((await (await request('/api/prices?slugs=mix')).json()).prices,[]);
});

test('collector submits a normalized visible brand through the owner MCP path',async()=>{
 const product={slug:'space-brand',name:'AB 믹스 125g',brand:'A B',spec:'125g',comparisonKind:'sameBundle',comparisonQuantity:20,comparisonAliases:['믹스쿠키'],referencePrice:800};
 const title='AB 믹스 125g 20개',url='https://www.coupang.com/vp/products/123?itemId=456&vendorItemId=789';
 const pages=[{text:'검색 결과',cards:[{url,card:{title,priceText:'16,000원',shippingText:'무료배송',conditionText:''}}]},{url,text:'',offer:{title,priceText:'16,000원',text:'무료배송',seller:'Seller',conditionText:'일반가'}}];
 let index=0;const task={page:()=>({goto:async()=>{},waitForFunction:async()=>{},evaluate:async()=>pages[index++]}),finish:async()=>{}};
 const [observed]=await collectBatch(task,[{...product,quantity:'20개'}],{pauseMs:0});
 assert.equal(observed.failure,undefined);assert.equal(observed.brand,'A B');
 const {rpc,request}=setup([product]);const response=await rpc('submit_price_observations',{observations:[observed]});
 assert.equal(response.status,200);const result=JSON.parse((await response.json()).result.content[0].text).results[0];assert.equal(result.status,'ACCEPT');
 const [current]=(await (await request('/api/prices?slugs=space-brand')).json()).prices;assert.equal(current.comparisonUnitPrice,800);
});


test('changed basis cannot make invalid product, card, or conditional evidence approvable',async()=>{
 for(const patch of [{quantity:'20병',title:'Sample 100ml 20병'},{priceCondition:'쿠폰가'},{searchCard:null}]) {
  const product={...catalog[0],quantity:'20병'};
  const {rpc,request,sqlite}=setup([product]);
  await rpc('submit_price_observations',{observations:[observation({title:'Sample 100ml 20병',quantity:'20병'})]});
  product.quantity='24병';
  const value=observation({title:'Sample 100ml 24병',quantity:'24병',...patch});
  if(patch.searchCard===null) delete value.searchCard;
  await rpc('submit_price_observations',{observations:[value]});
  const id=sqlite.prepare('SELECT id FROM price_history ORDER BY id DESC').get().id;
  assert.equal((await request('/api/admin/prices/review',{historyId:id,action:'ACCEPT'},true)).status,400);
  assert.equal(sqlite.prepare('SELECT normalized_quantity FROM coupang_price_current').get().normalized_quantity,'20병');
 }
});


test('admin reads the union of 100 pending and 100 recent current prices within D1 limits',async()=>{
 const {env,request}=setup();
 for(let i=0;i<200;i++) {
  const value={...observation(),slug:`admin-${i}`,comparisonQuantity:1,matchScore:100};
  await recordObservation(env.DB,value,{status:'ACCEPT'},new Date());
  if(i<100) await recordObservation(env.DB,{...value,observationId:crypto.randomUUID()},{status:'REVIEW'},new Date());
 }
 const response=await request('/api/admin/prices',undefined,true);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.pending.length,100);
 assert.equal(data.history.length,100);
 assert.equal(data.current.length,200);
});
