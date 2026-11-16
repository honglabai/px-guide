export function validateSharedItems(items) {
 if(!Array.isArray(items)||!items.length||items.length>2500)throw Error('invalid');
 const seen=new Set();
 return items.map(row=>{
  if(!row||typeof row.slug!=='string'||row.slug.length>120||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)||['constructor','prototype'].includes(row.slug)||seen.has(row.slug)||!Number.isInteger(row.qty)||row.qty<1||row.qty>99)throw Error('invalid');
  seen.add(row.slug);return {slug:row.slug,qty:row.qty};
 });
}
export function mergeSharedItems(existing,items,resolve=s=>s){
 const result=structuredClone(existing);
 for(const row of items){const slug=resolve(row.slug);const old=result[slug];result[slug]=old?{qty:Math.max(old.qty,row.qty),checked:old.checked}:{qty:row.qty,checked:false};}
 return result;
}
export const formatWon=n=>Number.isFinite(n)?`${Math.round(n).toLocaleString('ko-KR')}원`:'가격 미등록';
export function shoppingText(items){
 const sum=items.reduce((n,r)=>n+(Number.isFinite(r.pxPrice)?r.pxPrice*r.qty:0),0);
 return ['PX 구매목록',...items.map(r=>`☐ ${r.name} × ${r.qty}개 · ${formatWon(Number.isFinite(r.pxPrice)?r.pxPrice*r.qty:null)}`),`총 ${items.length}종 · ${items.reduce((n,r)=>n+r.qty,0)}개 · 전체 합계 ${formatWon(sum)}`,items.some(r=>!Number.isFinite(r.pxPrice))?'가격 미등록 상품은 합계에서 제외됩니다.':'','PX 가이드 https://pxguide.zeromorow.chatgpt.site/'].filter(Boolean).join('\n');
}
