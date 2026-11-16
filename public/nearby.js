import {filterStores,storeCities,nearestStores,distanceLabel} from './px-finder.mjs';
export function setupFinder(root,{geolocation=globalThis.navigator?.geolocation,now=()=>new Date()}={}) {
 if(!root)return;
 const search=root.querySelector('#px-store-query'),region=root.querySelector('#px-store-region'),city=root.querySelector('#px-store-city'),count=root.querySelector('#px-store-count'),empty=root.querySelector('#px-store-empty'),list=root.querySelector('#px-store-list'),locate=root.querySelector('#px-store-locate'),status=root.querySelector('#px-store-location-status');
 const coordinate=value=>value===undefined||value===''?null:Number(value);
 const stores=[...root.querySelectorAll('[data-px-store]')].map(element=>({element,region:element.dataset.region,city:element.dataset.city,store_name:element.dataset.name,address:element.dataset.address,phone:element.dataset.phone,latitude:coordinate(element.dataset.latitude),longitude:coordinate(element.dataset.longitude)}));
 let position=null,updated='';
 function cities(){
  const option=(value,label)=>{const node=root.ownerDocument.createElement('option');node.value=value;node.textContent=label;return node;};
  city.replaceChildren(option('','전체 도시'),...storeCities(stores,region.value).map(value=>option(value,value)));city.value='';
 }
 function render(){
  const matches=new Set(filterStores(stores,{query:search.value,region:region.value,city:city.value}).map(s=>s.element));
  const ordered=position?nearestStores(stores,position):stores;
  for(const store of ordered){
   store.element.hidden=!matches.has(store.element);
   const distance=store.element.querySelector('[data-store-distance]');
   distance.hidden=!position;distance.textContent=position?distanceLabel(store.distance):'';
  }
  list.append(...ordered.map(s=>s.element));
  count.textContent=`검색 결과 ${matches.size}곳 / 전체 ${stores.length}곳${position?' · 가까운 순':''}`;empty.hidden=matches.size>0;
 }
 function refresh(force=false){
  if(locate.disabled)return;
  if(!geolocation){status.textContent='이 브라우저에서는 위치를 사용할 수 없습니다. 지역·도시로 검색해 주세요.';return;}
  locate.disabled=true;locate.textContent='위치 확인 중';status.textContent='현재 위치를 확인하고 있습니다. 위치 사용을 허용해 주세요.';
  const finish=()=>{locate.disabled=false;locate.textContent='현위치 갱신';};
  const failure=error=>{finish();const reason=error?.code===1?'위치 권한이 꺼져 있습니다. 브라우저 설정에서 허용한 뒤 다시 눌러 주세요.':error?.code===3?'위치 확인 시간이 초과되었습니다. 다시 눌러 주세요.':'현재 위치를 확인하지 못했습니다. 다시 시도하거나 지역으로 검색해 주세요.';status.textContent=reason+(position?` (${updated} 위치 기준 유지)`:'');};
  try{geolocation.getCurrentPosition(result=>{
   const point={latitude:result.coords.latitude,longitude:result.coords.longitude};
   if(!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180){failure();return;}
   position=point;updated=now().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});finish();render();status.textContent=`${updated} 현위치 기준 · 직선거리순`;
  },failure,{enableHighAccuracy:true,timeout:12000,maximumAge:force?0:60000});}catch{failure();}
 }
 search.addEventListener('input',render);
 region.addEventListener('change',()=>{cities();render();});city.addEventListener('change',render);
 root.querySelector('#px-store-reset').addEventListener('click',()=>{search.value='';region.value='';cities();render();search.focus();});
 locate.addEventListener('click',()=>refresh(true));
 cities();render();refresh();
}
if(typeof document!=='undefined')setupFinder(document.querySelector('[data-px-finder]'));
