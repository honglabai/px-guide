import {comparisonPrice} from '../product-ui.mjs';
const valid = row => row && typeof row.slug === 'string' && Number.isSafeInteger(row.displayedPrice) && row.displayedPrice > 0 && Number.isSafeInteger(row.comparisonQuantity) && row.comparisonQuantity > 0 && row.comparisonUnitPrice === row.displayedPrice / row.comparisonQuantity && Number.isFinite(Date.parse(row.checkedAt));
const won = n => `${Math.round(n).toLocaleString('ko-KR')}원`;
export const checkedLabel = (checkedAt, now = new Date()) => {
  const date = new Date(checkedAt);
  const short = `${String(date.getUTCMonth()+1).padStart(2,'0')}.${String(date.getUTCDate()).padStart(2,'0')}`;
  return `${checkedAt && now - date > 30*86400000 ? '재확인 필요 · ' : ''}쿠팡 확인 ${short}`;
};
export const recordLabel = date => `${date || '날짜 미상'} 기록가`;
export async function fetchCurrentPrices(slugs, fetcher = fetch) {
  const prices = new Map(), unique = [...new Set(slugs.filter(s => /^[a-z0-9][a-z0-9-]*$/.test(s)))];
  for(let i=0;i<unique.length;i+=100){
    const batch=unique.slice(i,i+100);
    try {const response=await fetcher(`/api/prices?slugs=${encodeURIComponent(batch.join(','))}`);if(!response.ok)continue;
      const data=await response.json();for(const row of data.prices||[])if(batch.includes(row.slug)&&valid(row))prices.set(row.slug,row);
    }catch{} // Keep the stored comparison price when the price service is unavailable.
  }
  return prices;
}
export function mergeCurrentPrices(products,current,now=new Date()) {
  return products.map(p=>{const row=current.get(p.slug);return valid(row)?{...p,currentPrice:row.comparisonUnitPrice,comparisonPrice:row.comparisonUnitPrice,currentBundlePrice:row.displayedPrice,currentComparisonQuantity:row.comparisonQuantity,currentCheckedAt:row.checkedAt,currentStatus:checkedLabel(row.checkedAt,now),currentSourceUrl:row.sourceUrl,shippingFee:row.shippingFee}:{...p,currentPrice:null,comparisonPrice:comparisonPrice(p),currentCheckedAt:null,currentStatus:null};});
}
export function applyVisiblePrices(root,current,now=new Date()) {
  for(const element of root.querySelectorAll('[data-price-slug]')){
    const row=current.get(element.dataset.priceSlug), px=Number(element.dataset.pricePx);
    const value=element.querySelector('[data-price-value]'), result=element.querySelector('[data-price-result]'), status=element.querySelector('[data-price-status]');
    if(!valid(row))continue;
    if(value)value.textContent=value.tagName==='STRONG'?won(row.comparisonUnitPrice):`쿠팡가 ${won(row.comparisonUnitPrice)}`;
    if(status){status.textContent='';status.hidden=true;}
    const evidence=element.querySelector('[data-price-evidence]');
    if(evidence){evidence.textContent='';evidence.hidden=true;}
    const badge=element.querySelector('.product-rate');
    if(badge&&Number.isFinite(px)){const gap=row.comparisonUnitPrice-px;badge.textContent=`${Math.round(Math.abs(gap)/row.comparisonUnitPrice*100)}% ${gap<0?'높음':'할인'}`;badge.classList?.toggle('higher',gap<0);}
    if(result){const gap=row.comparisonUnitPrice-px;const label=Number.isFinite(px)&&px>0?`${gap>0?Math.round(gap/row.comparisonUnitPrice*100)+'% 저렴 · ':gap<0?'PX가 높음 · ':''}${won(Math.abs(gap))} 차이`:'';if(result.querySelector?.('b')){const first=result.firstChild;if(first?.nodeType===3)first.textContent=label;else{const text=(result.ownerDocument||root).createTextNode(label);result.insertBefore(text,first);}}else result.textContent=label;}
  }
}

export async function fetchPriceIndex(fetcher=fetch){const r=await fetcher('/api/prices/index');if(!r.ok)throw Error('Price index unavailable');const data=await r.json();if(!Array.isArray(data.prices))throw Error('Invalid price index');return new Map(data.prices.filter(valid).map(r=>[r.slug,r]));}
