import {filterStores,storeCities,nearestStores,distanceLabel} from './px-finder.mjs';
export function setupFinder(root,{geolocation=globalThis.navigator?.geolocation,now=()=>new Date(),retryLater=callback=>setTimeout(callback,1500)}={}) {
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
 function refresh(){
  if(locate.disabled)return;
  if(!geolocation){status.textContent='이 환경에서는 위치를 사용할 수 없습니다. 지역·도시로 검색해 주세요.';return;}
  locate.disabled=true;locate.textContent='위치 확인 중';status.textContent='현재 위치를 확인하고 있습니다. 권한 창이 뜨면 허용해 주세요.';
  const finish=()=>{locate.disabled=false;locate.textContent=position?'현위치 갱신':'내 위치로 찾기';};
  const fallback=' 계속 안 되면 Chrome 주소창에 pxguide.honglabai.com/nearby/ 를 직접 입력해 보세요.';
  const failure=code=>{
   finish();const reason=code===1?'위치 권한이 차단되었습니다. 안드로이드 설정에서 PX가이드 또는 Chrome의 위치를 앱 사용 중 허용한 뒤 다시 눌러 주세요.':code===3?'위치 확인 시간이 초과되었습니다. 기기의 위치가 켜져 있는지 확인하고 다시 눌러 주세요.':'기기가 현재 위치를 제공하지 못했습니다. 위치 서비스를 켜고 다시 눌러 주세요.';
   status.textContent=reason+(position?` (${updated} 위치 기준 유지)`:'')+fallback;
  };
  function request(retry=false){
   const onError=error=>{
    const code=error?.code;
    if(!retry&&(code===2||code===3)){
     status.textContent='위치를 한 번 더 확인하고 있습니다.';
     retryLater(()=>request(true));return;
    }
    failure(code);
   };
   try{geolocation.getCurrentPosition(result=>{
    const point={latitude:result.coords.latitude,longitude:result.coords.longitude};
    if(!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180){onError({code:2});return;}
    position=point;updated=now().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});finish();render();status.textContent=`${updated} 현위치 기준 · 직선거리순`;
   },onError,{enableHighAccuracy:!retry,timeout:retry?20000:12000,maximumAge:retry?60000:0});}catch{failure();}
  }
  request();
 }
 search.addEventListener('input',render);
 region.addEventListener('change',()=>{cities();render();});city.addEventListener('change',render);
 root.querySelector('#px-store-reset').addEventListener('click',()=>{search.value='';region.value='';cities();render();search.focus();});
 locate.addEventListener('click',refresh);
 if (/Android/i.test(globalThis.navigator?.userAgent||'')) {
  const androidButton=root.ownerDocument.createElement('a');
  androidButton.href='intent://nearby#Intent;scheme=pxguide;package=com.honglabai.pxguide;end';
  androidButton.textContent='Android 위치 찾기';
  androidButton.title='PX가이드 내부 테스트 1.0.2 이상에서 지원';
  androidButton.style.cssText='display:inline-block;margin:6px 0;padding:9px 14px;background:#214d30;color:#fff;border-radius:8px;font-weight:700;text-decoration:none';
  status.before(androidButton);
 }
 locate.textContent='내 위치로 찾기';
 status.textContent='내 위치로 찾기를 누르면 매장을 가까운 순으로 정렬합니다.';
 cities();render();
}
if(typeof document!=='undefined')setupFinder(document.querySelector('[data-px-finder]'));
