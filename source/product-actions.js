import {productActionLinks} from './product-action-links.mjs';
import {esc,money,comparisonPrice} from './product-ui.mjs';
let catalogPromise, opener;
const load=slug=>window.pxCatalogData?window.pxCatalogData.products([slug]):catalogPromise||=fetch('/favorites-data.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).catch(e=>{catalogPromise=null;throw e;});
const dialog=document.createElement('dialog');dialog.className='product-action-dialog';dialog.setAttribute('aria-labelledby','product-action-title');document.body.append(dialog);
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
dialog.addEventListener('close',()=>{const target=opener?.isConnected?opener:opener?.dataset.productAction?document.querySelector(`[data-product-action="${CSS.escape(opener.dataset.productAction)}"]`):null;target?.focus({preventScroll:true});});
document.addEventListener('click',async e=>{
 const link=e.target.closest('[data-product-action]');if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
 e.preventDefault();opener=link;
 dialog.innerHTML='<button type="button" class="dialog-back" data-app-back>‹ 뒤로</button><p role="status">상품 정보를 불러오는 중…</p>';if(window.pxNavigation)window.pxNavigation.openDialog(dialog);else dialog.showModal();
 try{
 const data=await load(link.dataset.productAction);if(!dialog.open)return;const p=data.find(p=>p.slug===link.dataset.productAction);if(!p){location.href=link.href;return;}
 await window.pxLoadPrices?.([p.slug]);
 const current=window.pxCurrentPrices?.get(p.slug);
 const online=comparisonPrice({...p,currentPrice:current?.comparisonUnitPrice});
 const links=productActionLinks(p,navigator.userAgent);
 const imageButton=(kind,href,label,extra='')=>`<a class="product-action-image ${extra}" href="${esc(href)}" aria-label="${esc(label)}"${kind==='coupang-search'?' rel="external noopener noreferrer"':''}><img src="/images/product-actions/${kind}-v1-480.webp" srcset="/images/product-actions/${kind}-v1-480.webp 480w, /images/product-actions/${kind}-v1-960.webp 960w" sizes="(max-width:600px) calc(100vw - 60px), 502px" width="2048" height="683" alt="${esc(label)}" decoding="async"></a>`;
 dialog.innerHTML=`<button type="button" class="dialog-back" data-app-back>‹ 뒤로</button><button class="product-action-close" aria-label="닫기">×</button><h2 id="product-action-title">${esc(p.name)}</h2><p class="product-action-prices">${p.category==='면세주류'?'면세가':'PX가'} ${money(p.pxPrice)} · 쿠팡가 ${online>0?money(online):'—'}</p><div class="product-action-links">${imageButton('coupang-search',links.coupang,'쿠팡에서 가격 검색','product-action-coupang')}${imageButton('subcategory-compare',links.compare,'동일 상품군 비교')}${imageButton('product-detail',links.detail,'상품 상세페이지 가기')}</div>`;
 dialog.querySelector('.product-action-close').onclick=()=>dialog.close();
 dialog.querySelector('.product-action-close').focus();
 }catch{dialog.innerHTML=`<button type="button" class="dialog-back" data-app-back>‹ 뒤로</button><button class="product-action-close" aria-label="닫기">×</button><p>상품 정보를 불러오지 못했습니다.</p><a href="${esc(link.href)}">상품 상세페이지 가기</a>`;dialog.querySelector('.product-action-close').onclick=()=>dialog.close();}
});
