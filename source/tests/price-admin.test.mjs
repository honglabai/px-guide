import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import worker from '../worker/index.js';
import { comparisonBasisKey } from '../price/comparison-basis.mjs';

const catalog = [{slug:'sample-item',name:'Sample',comparisonKind:'sameBundle',comparisonQuantity:1,referencePrice:1000}];
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0000_supreme_ozymandias.sql','0001_moaning_true_believers.sql','0002_gorgeous_the_executioner.sql','0003_verified_bundle_basis.sql','0004_verified_offer_evidence.sql']) sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
  const env = {PRICE_ADMIN_EMAIL:'owner@example.test',DB:{prepare(sql){return {bind(...args){const stmt=sqlite.prepare(sql);return {run:async()=>stmt.run(...args),first:async()=>stmt.get(...args)??null,all:async()=>({results:stmt.all(...args)})};}};}},ASSETS:{fetch:async request=>new URL(request.url).pathname==='/price-catalog.json'?Response.json(catalog):new Response('<h1>owner review</h1>',{headers:{'content-type':'text/html'}})}};
  const request=(path,{body,owner=false,headers={}}={})=>worker.fetch(new Request(`https://example.test${path}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(owner?{'oai-authenticated-user-email':'owner@example.test'}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  return {sqlite,env,request};
}
function observation(sqlite,{price=1500,status='REVIEW'}={}) {
  sqlite.prepare("INSERT INTO price_history (product_slug, observation_id, entry_kind, attempted_at, observed_at, source_url, observed_title, observed_quantity, observed_price, comparison_quantity, comparison_basis, search_card, shipping_fee, seller, price_condition, match_score, status, reason, created_at) VALUES ('sample-item', ?, 'OBSERVATION', ?, ?, 'https://www.coupang.com/vp/products/123', 'Sample 1개', '1개', ?, 1, ?, '{}', 2500, 'Seller', '일반가', 100, ?, 'PRICE_JUMP', ?)").run(crypto.randomUUID(),new Date().toISOString(),new Date().toISOString(),price,comparisonBasisKey(catalog[0]),status,new Date().toISOString());
  return sqlite.prepare('SELECT max(id) AS id FROM price_history').get().id;
}
test('admin shell and review API deny non-owner before static assets',async()=>{
  const {request,env}=setup();
  for (const path of ['/admin/coupang-prices/','/admin/coupang-prices/index.html','/api/admin/prices']) assert.equal((await request(path)).status,403);
  assert.equal((await request('/api/admin/prices/review',{body:{historyId:1,action:'ACCEPT'}})).status,403);
  const shell=await request('/admin/coupang-prices/',{owner:true});assert.equal(shell.status,200);assert.match(await shell.text(),/owner review/);assert.equal(shell.headers.get('cache-control'),'no-store');
  env.PRICE_ADMIN_EMAIL='';assert.equal((await request('/admin/coupang-prices/',{owner:true})).status,403);
});
test('owner review records an immutable decision; acceptance changes current and rejection does not',async()=>{
  const {sqlite,request}=setup();
  const accepted=observation(sqlite);
  const admin=await (await request('/api/admin/prices',{owner:true})).json();
  assert.equal(admin.history.find(row=>row.id===accepted).seller,'Seller');
  assert(Array.isArray(admin.pending));assert.equal(admin.pending.find(row=>row.id===accepted).reason,'PRICE_JUMP');
  assert.equal((await request('/api/admin/prices/review',{owner:true,body:{historyId:accepted,action:'ACCEPT'}})).status,200);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM price_history WHERE entry_kind='REVIEW_DECISION'").get().n,1);
  assert.equal(sqlite.prepare("SELECT displayed_price AS price FROM coupang_price_current WHERE product_slug='sample-item'").get().price,1500);
  const rejected=observation(sqlite,{price:2500});
  assert.equal((await request('/api/admin/prices/review',{owner:true,body:{historyId:rejected,action:'REJECT'}})).status,200);
  assert.equal(sqlite.prepare("SELECT displayed_price AS price FROM coupang_price_current WHERE product_slug='sample-item'").get().price,1500);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM price_history WHERE entry_kind='REVIEW_DECISION'").get().n,2);
  assert.equal((await request('/api/admin/prices/review',{owner:true,body:{historyId:rejected,action:'ACCEPT'}})).status,400);
});
test('interest writes only daily aggregate counts and rejects invalid product events',async()=>{
  const {sqlite,request}=setup();
  for (const body of [{slug:'../bad',kind:'favorite'},{slug:'unknown',kind:'favorite'},{slug:'sample-item',kind:'remove'},{slug:'sample-item',kind:'favorite',email:'visitor@example.test'}]) assert.equal((await request('/api/interest',{body})).status,400);
  assert.equal((await request('/api/interest',{body:{slug:'sample-item',kind:'favorite'}})).status,200);
  assert.equal((await request('/api/interest',{body:{slug:'sample-item',kind:'shopping'}})).status,200);
  const rows=sqlite.prepare('SELECT * FROM product_interest_daily').all();
  assert.equal(rows.length,1);assert.equal(rows[0].product_slug,'sample-item');assert.equal(rows[0].favorite_adds,1);assert.equal(rows[0].shopping_adds,1);
  assert.deepEqual(Object.keys(rows[0]).sort(),['day','favorite_adds','product_slug','shopping_adds']);
});
test('owner can page past 100 unresolved observations with an accurate total',async()=>{
  const {sqlite,request}=setup();
  for(let i=0;i<101;i++)observation(sqlite);
  const first=await (await request('/api/admin/prices',{owner:true})).json();
  assert.equal(first.pendingTotal,101);assert.equal(first.pending.length,100);assert.equal(first.pendingOffset,0);
  const second=await (await request('/api/admin/prices?pendingOffset=100',{owner:true})).json();
  assert.equal(second.pendingTotal,101);assert.equal(second.pending.length,1);assert.equal(second.pending[0].id,1);
  assert.equal((await request('/api/admin/prices?pendingOffset=-1',{owner:true})).status,400);
});
test('owner UI labels queue, blocked, review, reverify and results, then refreshes after decision',async()=>{
  class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.disabled=false;}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=[...nodes];}
    addEventListener(type,fn){this.listeners[type]=fn;}
    querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tagName===tag?[child]:[]),...child.querySelectorAll(tag)]);}
  }
  const nodes=new Map(['#price-review-list','#price-review-status','#price-review-prev','#price-review-next','#price-review-page'].map(id=>[id,new Element()]));
  const document={querySelector:selector=>nodes.get(selector),createElement:tag=>new Element(tag)};
  const review={id:1,product_slug:'sample-item',entry_kind:'OBSERVATION',status:'REVIEW',reason:'COMPARISON_BASIS_CHANGED',source_url:'https://www.coupang.com/vp/products/123',observed_price:1500,observed_quantity:'24병',comparison_quantity:1};
  const reverify={...review,id:2,status:'REVERIFY',reason:'CHECK_AGAIN'};
  const result={...review,id:3,status:'ACCEPT',reason:'MATCHED'};
  const queue=[{product_slug:'queued-item',status:'PENDING',priority:9,attempts:0},{product_slug:'blocked-item',status:'BLOCKED',priority:3,attempts:2,last_error:'source unavailable'}];
  let decided=false;const requests=[];
  const fetch=async(url,options)=>{requests.push([url,options]);if(options?.method==='POST'){decided=true;return {ok:true};}const pendingOffset=Number(new URL(url,'https://example.test').searchParams.get('pendingOffset')||0);return {ok:true,json:async()=>({queue,history:[result,...(decided?[{...review,id:4,entry_kind:'REVIEW_DECISION',original_history_id:1,status:'ACCEPT'}]:[])],pending:pendingOffset?[{...review,id:101}]:decided?[reverify]:[review,reverify],pendingTotal:decided?100:101,pendingOffset,pendingLimit:100,current:[{slug:'sample-item',displayedPrice:1000,comparisonQuantity:1,normalizedQuantity:'20병',comparisonBasisKey:'old-basis',sourceUrl:'https://www.coupang.com/vp/products/111'}]})};};
  vm.runInNewContext(readFileSync(new URL('../price/admin-ui.js',import.meta.url),'utf8'),{document,fetch,URL,confirm:()=>true});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));await flush();
  const words=()=>{const walk=node=>node.textContent+' '+node.children.map(walk).join(' ');return walk(nodes.get('#price-review-list'));};
  assert.match(words(),/수집 대기/);assert.match(words(),/차단/);assert.match(words(),/수동 검토/);assert.match(words(),/재확인/);assert.match(words(),/승인 완료/);
  assert.match(words(),/기존 판매 단위\s+20병/);assert.match(words(),/기존 묶음 총액\s+1,000원/);assert.match(words(),/기존 비교 기준\s+old-basis/);
  assert.equal(nodes.get('#price-review-status').textContent,'총 101건 검토 대기');
  await nodes.get('#price-review-next').listeners.click();await flush();
  assert(requests.some(([url])=>url==='/api/admin/prices?pendingOffset=100'));assert.equal(nodes.get('#price-review-page').textContent,'101–101 / 101');
  await nodes.get('#price-review-prev').listeners.click();await flush();
  const buttons=nodes.get('#price-review-list').querySelectorAll('button');
  const accept=buttons.find(button=>button.textContent==='승인');assert(accept);await accept.listeners.click();await flush();
  assert.equal(requests.filter(([,options])=>options?.method==='POST').length,1);
  assert.match(words(),/재확인/);assert.match(words(),/승인 완료/);
  const pendingGroup=nodes.get('#price-review-list').children[1];assert.equal(pendingGroup.children.length,2);assert.match(pendingGroup.children[1].children[0].textContent,/재확인/);
});
test('browser sends at most one event per slug and kind per local day',async()=>{
  const storage=new Map(),calls=[],events={};
  const button={dataset:{favorite:'sample-item',favoriteName:'Sample'},setAttribute(){},querySelector(){return null;}};
  const document={querySelector:()=>null,querySelectorAll:selector=>selector==='[data-favorite]'?[button]:[],addEventListener:(type,fn)=>events[type]=fn};
  const now=()=>new Date('2026-10-15T08:00:00+09:00');
  const context={document,window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return {ok:true};},structuredClone,Date:class extends Date{constructor(...args){super(...(args.length?args:[now()]));}},confirm:()=>true};
  vm.runInNewContext(readFileSync(new URL('../favorites.js',import.meta.url),'utf8'),context);
  const click=()=>events.click({target:{closest:()=>button}});
  click();click();click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/interest');assert.deepEqual(calls[0][1],{slug:'sample-item',kind:'favorite'});
});
test('built privacy page discloses aggregate signals while lists remain local',()=>{
  const html=readFileSync(new URL('../dist/client/privacy/index.html',import.meta.url),'utf8');
  assert.match(html,/상품별.*집계/);assert.match(html,/목록.*서버.*전송하지/);assert.match(html,/IP 주소.*저장하지/);
});
