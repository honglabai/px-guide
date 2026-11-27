import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {filterStores,storeCities,storeMapLinks,distanceKm,nearestStores,distanceLabel} from '../px-finder.mjs';
import {setupFinder} from '../nearby.js';
const {stores}=JSON.parse(fs.readFileSync('content/px-stores.json','utf8'));
test('123 actual store records have address and region filters without invented phone numbers',()=>{
 assert.equal(stores.length,123);assert.equal(new Set(stores.map(s=>s.address)).size,123);
 assert(stores.every(s=>s.store_name&&s.region&&s.city&&s.address));
 assert.equal(stores.find(s=>s.store_name==='화랑').phone,'');
 assert.equal(stores.find(s=>s.store_name==='마룡리').city,'양평군');
 assert(storeCities(stores,'서울').every(city=>stores.some(s=>s.region==='서울'&&s.city===city)));
});
test('search combines region, city, name, address, aliases and phone digits',()=>{
 assert.equal(filterStores(stores,{query:'서울 영외PX 사당'})[0].store_name,'사당');
 assert.equal(filterStores(stores,{query:'경기도 권율 고양시'})[0].store_name,'권율');
 assert.equal(filterStores(stores,{query:'강원특별자치도 0334414039'})[0].store_name,'사창');
 const matches=filterStores(stores,{region:'경기',city:'고양시 덕양구'});assert(matches.length>0);assert(matches.every(s=>s.region==='경기'&&s.city==='고양시 덕양구'));
 assert.equal(filterStores(stores,{region:'서울',query:'권율'}).length,0);
 assert.equal(filterStores(stores,{query:'존재하지않는마트xyz'}).length,0);
 assert.equal(filterStores(stores,{query:'영외PX'}).length,123);
});
test('each map link contains the specific name and address and uses the current tab',()=>{
 const html=fs.readFileSync('dist/client/nearby/index.html','utf8');
 assert.equal((html.match(/data-px-store /g)||[]).length,123);
 for(const store of stores){
  const links=storeMapLinks(store);const naver=decodeURIComponent(links.naver),kakao=new URL(links.kakao).searchParams.get('q');
  for(const query of [naver,kakao]){assert(query.includes(store.address));assert(query.includes(store.store_name));}
 }
 const links=[...html.matchAll(/<a href="(https:\/\/map\.(?:naver|kakao)\.[^"]+)"([^>]*)>/g)];assert.equal(links.length,246);assert(links.every(m=>!m[2].includes('target=')));
 assert(html.includes('tel:0316401126'));assert(html.includes('tel:07042510803'));assert(!html.includes('tel:031640112607042510803'));
});
function fixture(options){
 const make=()=>({value:'',events:{},addEventListener(k,fn){this.events[k]=fn;},replaceChildren(...children){this.children=children;},focus(){this.focused=true;}});
 const ids=Object.fromEntries(['query','region','city','count','empty','reset','list','locate','location-status'].map(k=>[k,make()]));
 const cards=stores.map((s,index)=>({distanceNode:{hidden:true,textContent:''},querySelector(){return this.distanceNode;},dataset:{region:s.region,city:s.city,name:s.store_name,address:s.address,phone:s.phone,latitude:String(37+index*.01),longitude:'127'},hidden:false}));
 ids.list.append=(...children)=>{ids.list.children=children;};
 const root={querySelector:selector=>ids[selector.replace('#px-store-','')],querySelectorAll:()=>cards,ownerDocument:{createElement:make}};setupFinder(root,options);return {ids,cards};
}
test('real finder handlers filter instantly, rebuild cities, show empty state and reset',()=>{
 const {ids,cards}=fixture();const shown=()=>cards.filter(c=>!c.hidden);
 assert.equal(shown().length,123);assert.match(ids.count.textContent,/123곳/);
 ids.query.value='서울 사당';ids.query.events.input();assert.equal(shown().length,1);assert.equal(shown()[0].dataset.name,'사당');
 ids.query.value='';ids.region.value='경기';ids.region.events.change();assert(shown().every(c=>c.dataset.region==='경기'));assert(ids.city.children.some(o=>o.value==='고양시 덕양구'));assert(!ids.city.children.some(o=>o.value==='춘천시'));
 ids.city.value='고양시 덕양구';ids.city.events.change();assert(shown().length>0);assert(shown().every(c=>c.dataset.city==='고양시 덕양구'));
 ids.query.value='없는매장xyz';ids.query.events.input();assert.equal(shown().length,0);assert.equal(ids.empty.hidden,false);
 ids.reset.events.click();assert.equal(shown().length,123);assert.equal(ids.empty.hidden,true);assert.equal(ids.query.focused,true);assert.equal(ids.city.value,'');
});


test('distance ordering uses coordinates, leaves unknown positions last, and formats straight-line distance',()=>{
 assert.equal(distanceKm({latitude:37,longitude:127},{latitude:37,longitude:127}),0);
 const seoul={latitude:37.5665,longitude:126.978},busan={latitude:35.1796,longitude:129.0756};
 assert(Math.abs(distanceKm(seoul,busan)-325)<5);
 assert.equal(distanceKm(seoul,{latitude:null,longitude:null}),null);
 assert.deepEqual(nearestStores([{id:'far',...busan},{id:'unknown'},{id:'near',...seoul}],seoul).map(s=>s.id),['near','far','unknown']);
 assert.equal(distanceLabel(.125),'125m');assert.equal(distanceLabel(3.25),'3.3km');assert.equal(distanceLabel(null),'거리 미확인');
});
test('user-requested location and a fresh refresh reorder the cards while filters continue to apply',()=>{
 const calls=[],geolocation={getCurrentPosition(success,error,options){calls.push({success,error,options});}};
 const {ids,cards}=fixture({geolocation,retryLater:fn=>fn(),now:()=>new Date('2026-10-23T00:00:00Z')});
 assert.equal(calls.length,0);assert.equal(ids.locate.textContent,'내 위치로 찾기');ids.locate.events.click();
 assert.equal(calls.length,1);assert.equal(ids.locate.disabled,true);
 calls[0].success({coords:{latitude:37,longitude:127}});
 assert.equal(ids.list.children[0],cards[0]);assert.equal(ids.locate.disabled,false);assert.equal(cards[0].distanceNode.textContent,'0m');assert.match(ids.count.textContent,/가까운 순/);
 ids.locate.events.click();assert.equal(calls[1].options.maximumAge,0);assert.equal(calls[1].options.enableHighAccuracy,true);
 calls[1].success({coords:{latitude:37.02,longitude:127}});assert.equal(ids.list.children[0],cards[2]);
 ids.query.value=cards[0].dataset.name;ids.query.events.input();assert(!cards[0].hidden);
 ids.reset.events.click();assert.equal(ids.list.children[0],cards[2]);
 ids.locate.events.click();calls[2].error({code:3});assert.equal(ids.locate.disabled,true);assert.equal(calls[3].options.enableHighAccuracy,false);assert.equal(calls[3].options.timeout,20000);calls[3].error({code:3});assert.equal(calls.length,4);assert.equal(ids.locate.disabled,false);assert.match(ids['location-status'].textContent,/위치 기준 유지/);assert.equal(ids.list.children[0],cards[2]);
});
test('denied location and unsupported geolocation preserve search and never invent distance',()=>{
 let reject;const {ids,cards}=fixture({geolocation:{getCurrentPosition(success,error){reject=error;}}});
 assert.equal(reject,undefined);ids.locate.events.click();reject({code:1});assert.match(ids['location-status'].textContent,/권한/);assert(cards.every(c=>c.distanceNode.hidden));
 ids.query.value='서울 사당';ids.query.events.input();assert.equal(cards.filter(c=>!c.hidden).length,1);
 const noGeo=fixture({geolocation:null});noGeo.ids.locate.events.click();assert.match(noGeo.ids['location-status'].textContent,/지역·도시로 검색/);
});
test('compact store cards keep both opening hours together and the location refresh beside search',()=>{
 const html=fs.readFileSync('dist/client/nearby/index.html','utf8');
 assert.equal((html.match(/class="px-store-hours"/g)||[]).length,123);
 assert.match(html,/<div class="px-finder-query">[\s\S]*?id="px-store-query"[\s\S]*?id="px-store-locate"[\s\S]*?<\/div>/);
 assert(!html.includes('<h2>영외마트 위치 검색</h2>'));
 assert(!html.includes('지역·도시·매장명·주소로 검색하고 지도에서 위치를 확인하세요.'));
});
test('stored coordinates are backed by a location source and stay inside Korea',()=>{
 const located=stores.filter(s=>Number.isFinite(s.latitude)&&Number.isFinite(s.longitude));assert.equal(located.length,122);
 assert(located.every(s=>s.coordinateSource&&s.latitude>=33&&s.latitude<=39&&s.longitude>=124&&s.longitude<=131));
 const dream=stores.find(s=>s.store_name==='드림'),happy=stores.find(s=>s.store_name==='행복드림');assert.notEqual(dream.latitude,happy.latitude);
 assert.equal(stores.find(s=>s.store_name==='항무').latitude,undefined);
});

test('a transient unavailable result retries once and uses the first valid position',()=>{
 const calls=[], later=[];const {ids,cards}=fixture({geolocation:{getCurrentPosition(ok,error,options){calls.push({ok,error,options});}},retryLater:fn=>later.push(fn)});
 ids.locate.events.click();calls[0].error({code:2});ids.locate.events.click();assert.equal(calls.length,1);assert.equal(later.length,1);later[0]();
 assert.equal(calls[1].options.maximumAge,60000);calls[1].ok({coords:{latitude:37.04,longitude:127}});assert.equal(ids.list.children[0],cards[4]);assert.equal(ids.locate.disabled,false);
});
