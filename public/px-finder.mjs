export function normalizeStoreSearch(value='') {
 return String(value).normalize('NFC').toLocaleLowerCase('ko-KR')
  .replace(/서울특별시/g,'서울').replace(/부산광역시/g,'부산').replace(/대구광역시/g,'대구').replace(/인천광역시/g,'인천').replace(/광주광역시/g,'광주').replace(/세종특별자치시/g,'세종')
  .replace(/경기도/g,'경기').replace(/강원특별자치도|강원도/g,'강원').replace(/충청남도/g,'충남').replace(/충청북도/g,'충북').replace(/전북특별자치도|전라북도/g,'전북').replace(/전라남도/g,'전남').replace(/경상북도/g,'경북').replace(/경상남도/g,'경남')
  .replace(/국군복지단|영외\s*(?:px|마트)|군마트|마트|px/gi,'').replace(/-/g,'').replace(/[^가-힣ㄱ-ㅎa-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
export function filterStores(stores,{query='',region='',city=''}={}) {
 const words=normalizeStoreSearch(query).split(' ').filter(Boolean);
 return stores.filter(s=>(!region||s.region===region)&&(!city||s.city===city)&&words.every(word=>normalizeStoreSearch([s.region,s.city,s.store_name,s.address,s.phone].join(' ')).includes(word)));
}
export const storeCities=(stores,region='')=>[...new Set(stores.filter(s=>!region||s.region===region).map(s=>s.city).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
export function storeMapLinks(store) {
 const query=encodeURIComponent(`${store.address} 국군복지단 ${store.store_name}마트`);
 return {naver:'https://map.naver.com/p/search/'+query,kakao:'https://map.kakao.com/?q='+query};
}
export function distanceKm(from,to) {
 const valid=p=>p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;
 if(!valid(from)||!valid(to))return null;
 const rad=d=>d*Math.PI/180;
 const a=Math.sin(rad(to.latitude-from.latitude)/2)**2+Math.cos(rad(from.latitude))*Math.cos(rad(to.latitude))*Math.sin(rad(to.longitude-from.longitude)/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)));
}
export function nearestStores(stores,position) {
 return stores.map((store,index)=>({...store,index,distance:distanceKm(position,store)})).sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity)||a.index-b.index);
}
export const distanceLabel=km=>km===null?'거리 미확인':km<1?`${Math.round(km*1000)}m`:km<10?`${km.toFixed(1)}km`:`${Math.round(km)}km`;
