import {fetchCurrentPrices,applyVisiblePrices,fetchPriceIndex} from './public-prices.js';
const prices=new Map(),loaded=new Set();
window.pxCurrentPrices=prices;
window.pxPriceStatus=slug=>prices.has(slug)?'쿠팡가':null;
let indexPromise;
window.pxLoadPriceIndex=async(slugs=[])=>{if(indexPromise&&slugs.every(s=>loaded.has(s)))return prices;try{indexPromise??=fetchPriceIndex();const found=await indexPromise;for(const [slug,row]of found)prices.set(slug,row);slugs.forEach(s=>loaded.add(s));applyVisiblePrices(document,prices);document.dispatchEvent(new Event('px-prices-loaded'));return prices;}catch{indexPromise=null;return window.pxLoadPrices(slugs,true);}};
window.pxLoadPrices=async(slugs,forceBatch=false)=>{
 if(!forceBatch&&window.pxCatalogData&&typeof location!=='undefined'&&location.pathname==='/products/')return window.pxLoadPriceIndex(slugs);
 const missing=[...new Set(slugs)].filter(slug=>slug&&!loaded.has(slug));
 missing.forEach(slug=>loaded.add(slug));
 if(!missing.length)return prices;
 const found=await fetchCurrentPrices(missing);
 for(const [slug,row] of found)prices.set(slug,row);
 applyVisiblePrices(document,prices);
 document.dispatchEvent(new Event('px-prices-loaded'));
 return prices;
};
window.pxLoadPrices([...document.querySelectorAll('[data-price-slug]')].map(el=>el.dataset.priceSlug));
