import {randomUUID} from 'node:crypto';
import {matchCandidate,comparisonNameCore} from './rules.mjs';
import {validateObservedQuantity} from './comparison-basis.mjs';
export const failures=['BLOCKED','CAPTCHA','LOGIN_REQUIRED','NO_PRICE','NETWORK_ERROR','PAGE_CHANGED','NO_EXACT_MATCH','AMBIGUOUS_MATCH','IDENTITY_CHANGED','RECHECK_DISAGREED'];
function blocked(text){if(/captcha|자동입력|로봇이 아님|보안 문자/i.test(text))return 'CAPTCHA';if(/access denied|접근이 차단|비정상적인 접근|접속이 제한/i.test(text))return 'BLOCKED';if(/로그인이 필요|로그인 후 이용|sign in to continue/i.test(text))return 'LOGIN_REQUIRED';}
function ids(url){try{const u=new URL(url);if(u.protocol!=='https:'||!(u.hostname==='coupang.com'||u.hostname.endsWith('.coupang.com')))return null;const productId=u.pathname.match(/^\/vp\/products\/(\d+)/)?.[1];return productId?{productId,itemId:u.searchParams.get('itemId')??undefined,vendorItemId:u.searchParams.get('vendorItemId')??undefined}:null;}catch{return null;}}
function conditional(text){return /쿠폰|와우|wow|회원|멤버십|멤버쉽|membership|member|카드|card|청구할인|정기배송|정기구독|subscription/i.test(String(text).normalize('NFKC').replace(/\s+/g,''));}
function observedParts(title){
 const spec=String(title).match(/\d+(?:\.\d+)?\s*(?:ml|kg|g|l|㎖|ℓ)/i)?.[0] ?? '';
 const quantity=[...String(title).matchAll(/\d+\s*(?:개|입|팩|병|캔|봉|묶음|정|매|포|pack|pet|ea)(?![a-z])/gi)].map(m=>m[0]);
 return {spec,quantity:quantity.length===1?quantity[0]:'',option:''};
}
function shippingFee(text){const paid=String(text).match(/배송비\s*([\d,]+)\s*원/);return paid?Number(paid[1].replaceAll(',','')):/무료배송/.test(text)?0:null;}
function ordinaryPrices(priceText){return String(priceText).split('\n').filter(s=>! /배송|적립|할인|쿠폰|와우|카드|월|총액|당/.test(s)).flatMap(s=>[...s.matchAll(/([\d,]+)\s*원/g)].map(m=>Number(m[1].replaceAll(',',''))));}
function withVisibleOption(product,record){const option=String(product.option??'').trim();return option&&record.title?.includes(option)?{...record,option}:record;}
export function parseDetail({text='',url,offer}){
 const stop=blocked(text);if(stop)return {blocked:stop};
 if(!offer?.title || !offer.priceText || !offer.seller?.trim() || conditional(`${offer.text ?? ''} ${offer.conditionText ?? ''}`))return {failure:'PAGE_CHANGED'};
 text=offer.text ?? '';
 const identity=ids(url);if(!identity)return {failure:'PAGE_CHANGED'};
 if(!identity.itemId || !identity.vendorItemId)return {failure:'PAGE_CHANGED'};
 const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
 const title=offer.title;
 if(!title)return {failure:'PAGE_CHANGED'};
 if(conditional(text))return {failure:'PAGE_CHANGED'};
 const prices=ordinaryPrices(offer.priceText);
 if(!prices.length || !prices.every(p=>Number.isSafeInteger(p)&&p>0))return {failure:'NO_PRICE'};
 if(new Set(prices).size!==1)return {failure:'PAGE_CHANGED'};
 const shipping=shippingFee(text);if(shipping===null)return {failure:'PAGE_CHANGED'};
 const parts=observedParts(title);if(!parts.spec||!parts.quantity)return {failure:'PAGE_CHANGED'};
 return {...identity,title,...parts,seller:offer.seller.trim(),priceCondition:'일반가',displayedPrice:prices[0],sourceUrl:canonicalUrl(url),shippingFee:shipping};
}
function canonicalUrl(value){const url=new URL(value);const identity=ids(value);url.search='';url.hash='';if(identity?.itemId)url.searchParams.set('itemId',identity.itemId);if(identity?.vendorItemId)url.searchParams.set('vendorItemId',identity.vendorItemId);return url.href;}
export function parseSearchCard(input){
 if(input.card === null)return null;
 const card=input.card;
 if(!card || conditional(card.conditionText))return null;
 const identity=ids(input.url);if(!identity?.itemId||!identity.vendorItemId)return null;
 const title=card.title?.trim();if(!title)return null;
 const parts=observedParts(title);if(!parts.spec||!parts.quantity)return null;
 const prices=[...(card.priceText??'').matchAll(/([\d,]+)\s*원/g)].map(m=>Number(m[1].replaceAll(',','')));
 const shipping=shippingFee(card.shippingText);if(prices.length!==1||!Number.isSafeInteger(prices[0])||prices[0]<=0||shipping===null)return null;
 return {...identity,title,...parts,displayedPrice:prices[0],shippingFee:shipping,sourceUrl:canonicalUrl(input.url),...(card.seller?{seller:card.seller}:{}),priceCondition:'일반가'};
}
function searchCardReason(input){
 if(!input?.card)return 'CARD_MARKUP_UNVERIFIED';
 const card=input.card;
 if(conditional(card.conditionText))return 'CONDITIONAL_PRICE';
 const identity=ids(input.url);
 if(!identity?.itemId||!identity.vendorItemId)return 'IDS_UNVERIFIED';
 if(!card.title?.trim())return 'TITLE_UNVERIFIED';
 const parts=observedParts(card.title);
 if(!parts.spec)return 'SPEC_UNVERIFIED';
 if(!parts.quantity)return 'QUANTITY_UNVERIFIED';
 const prices=[...(card.priceText??'').matchAll(/([\d,]+)\s*원/g)].map(m=>Number(m[1].replaceAll(',','')));
 if(prices.length>1)return 'AMBIGUOUS_PRICE';
 if(prices.length!==1||!Number.isSafeInteger(prices[0])||prices[0]<=0)return 'PRICE_UNVERIFIED';
 if(shippingFee(card.shippingText)===null)return 'SHIPPING_UNVERIFIED';
 return null;
}
function detailReason(input,parsed){
 if(parsed.blocked)return parsed.blocked;
 if(!input.offer)return input.offerIssue??'OFFER_UNVERIFIED';
 const offer=input.offer;
 if(!offer.title?.trim())return 'TITLE_UNVERIFIED';
 if(!offer.seller?.trim())return 'SELLER_UNVERIFIED';
 if(conditional(`${offer.text??''} ${offer.conditionText??''}`))return 'CONDITIONAL_PRICE';
 if(!offer.priceText)return 'PRICE_UNVERIFIED';
 if(!ids(input.url)?.itemId||!ids(input.url)?.vendorItemId)return 'IDS_UNVERIFIED';
 const prices=ordinaryPrices(offer.priceText);
 if(!prices.length||!prices.every(p=>Number.isSafeInteger(p)&&p>0))return 'PRICE_UNVERIFIED';
 if(new Set(prices).size!==1)return 'AMBIGUOUS_PRICE';
 if(shippingFee(offer.text)===null)return 'SHIPPING_UNVERIFIED';
 const parts=observedParts(offer.title);
 if(!parts.spec)return 'SPEC_UNVERIFIED';
 if(!parts.quantity)return 'QUANTITY_UNVERIFIED';
 return parsed.failure??null;
}
const searchReasonCodes=['CARD_MARKUP_UNVERIFIED','CONDITIONAL_PRICE','IDS_UNVERIFIED','TITLE_UNVERIFIED','SPEC_UNVERIFIED','QUANTITY_UNVERIFIED','AMBIGUOUS_PRICE','PRICE_UNVERIFIED','SHIPPING_UNVERIFIED','INELIGIBLE_BASIS','QUANTITY_MISMATCH','HARD_MISMATCH','LOW_MATCH_SCORE','OTHER_REJECTION'];
const matchReasonCodes=['BRAND_UNVERIFIED_OR_DIFFERENT','NAME_UNVERIFIED_OR_DIFFERENT','SPEC_MISMATCH','SPEC_UNVERIFIED','QUANTITY_MISMATCH','QUANTITY_UNVERIFIED','OPTION_UNVERIFIED_OR_DIFFERENT'];
function fixedSearchReason(reason){return searchReasonCodes.includes(reason)?reason:'OTHER_REJECTION';}
const same=(a,b)=>['sourceUrl','productId','itemId','vendorItemId'].every(k=>a[k]===b[k]);
export async function collectBatch(taskSpace,batch,{pauseMs=1500,diagnostic=()=>{}}={}){
 if(!Array.isArray(batch)||batch.length>20)throw new Error('Expected at most 20 claimed products');
 const page=taskSpace.page('p1');const output=[];let stopped=false;let clock=0;
 const stamp=()=>new Date(clock=Math.max(Date.now(),clock+1)).toISOString();
 async function read(url){
  await new Promise(r=>setTimeout(r,pauseMs));
  // A timeout stops this run; never navigate again while a remote call may still be active.
  let timer,aborted=false;
  diagnostic(`Navigating ${new URL(url).pathname==='/np/search'?'search':'detail'}`);
  try{return await Promise.race([(async()=>{
   await page.goto(url);
   if(aborted)throw new Error('Navigation deadline already exceeded');
   await page.waitForFunction(pageContentReady, {url,kind:new URL(url).pathname === '/np/search' ? 'search':'detail'}, {timeout:10000});
   if(aborted)throw new Error('Content deadline already exceeded');
   diagnostic('Content ready; extracting selected offer');
   return page.evaluate(extractVisiblePage);
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>{aborted=true;reject(new Error('Navigation/content deadline exceeded; inspect existing TaskSpace'));},20000);})]);}
  finally{clearTimeout(timer);}
 }
 for(const product of batch){
  const query=typeof product.comparisonSearchQuery==='string'&&product.comparisonSearchQuery.trim()?product.comparisonSearchQuery.trim():[product.name,product.brand,product.spec,product.quantity,product.option].filter(Boolean).join(' ');
  const searchUrl=`https://www.coupang.com/np/search?q=${encodeURIComponent(query)}`;
  let sourceUrl=searchUrl;const base={observationId:randomUUID(),slug:product.slug};
  const fail=reason=>({...base,failure:reason,sourceUrl,observedAt:stamp()});
  try{
   const basis={eligible:Number.isSafeInteger(product.comparisonQuantity)&&product.comparisonQuantity>0,targetQuantity:product.quantity};
   const sourceCounts=[product.name,product.spec,product.option].flatMap(value=>[...String(value??'').matchAll(/\d+\s*(?:개|입|팩|병|캔|봉|묶음|정|매|포|pack|pet|ea)(?![a-z])/gi)]);
   if(!basis.eligible || !/^\d+\s*(?:개|입|팩|병|캔|봉|묶음|정|매|포|pack|pet|ea)$/i.test(product.quantity??'') || product.comparisonQuantity>1&&sourceCounts.length){output.push(fail('NO_EXACT_MATCH'));continue;}
   const search=await read(searchUrl);const stop=blocked(search.text);if(stop){output.push(fail(stop));stopped=true;break;}
   const grouped=new Map(),reasonCounts=new Map();let sampled=0,omitted=0,ready=0,bestRejected=null;
   const cardDiagnostic=(reason,score,reasons=[])=>{
    const code=fixedSearchReason(reason);
    reasonCounts.set(code,(reasonCounts.get(code)??0)+1);
    const safeReasons=reasons.filter(value=>matchReasonCodes.includes(value));
    if(Number.isFinite(score)&&(!bestRejected||score>bestRejected.score))bestRejected={score,code,reasons:safeReasons};
    if(sampled<3){diagnostic(`search-card item=${output.length+1} reason=${code}${Number.isFinite(score)?` score=${score} matchReasons=${safeReasons.join(',')||'NONE'}`:''}`);sampled++;}else omitted++;
   };
   for(const card of search.cards){
    if(!ids(card.url)){cardDiagnostic('IDS_UNVERIFIED');continue;}
    const key=canonicalUrl(card.url);if(!grouped.has(key))grouped.set(key,[]);
    const parsed=parseSearchCard(card),candidate=parsed?withVisibleOption(product,parsed):null;
    if(!candidate)cardDiagnostic(searchCardReason(card));
    else {
     const quantity=validateObservedQuantity(basis,candidate);
     const match=matchCandidate(product,{name:candidate.title,brand:candidate.title.includes(product.brand)?product.brand:''});
     if(!quantity.valid||match.hardMismatch||match.score<95)cardDiagnostic(quantity.reason??(match.hardMismatch?'HARD_MISMATCH':'LOW_MATCH_SCORE'),match.score,match.reasons);
     else ready++;
    }
    grouped.get(key).push(candidate);
   }
   const candidates=[];let conflict=false;
   for(const group of grouped.values()){
    const candidate=group.find(c=>{if(!c||!validateObservedQuantity(basis,c).valid)return false;const m=matchCandidate(product,{name:c.title,brand:c.title.includes(product.brand)?product.brand:''});return !m.hardMismatch&&m.score>=95;});
    if(!candidate)continue;
    if(group.some(c=>!c||['title','displayedPrice','shippingFee','priceCondition','seller'].some(key=>c[key]!==candidate[key])))conflict=true;
    candidates.push(candidate);
   }
   const counts=searchReasonCodes.filter(code=>reasonCounts.has(code)).map(code=>`${code}:${reasonCounts.get(code)}`).join(',')||'NONE';
   const best=bestRejected?`score:${bestRejected.score},reason:${bestRejected.code},matchReasons:${bestRejected.reasons.join(',')||'NONE'}`:'NONE';
   diagnostic(`search-summary item=${output.length+1} cards=${search.cards.length} groups=${grouped.size} ready=${ready} candidates=${candidates.length} reasons=${counts} bestRejected=${best} omitted=${omitted}`);
   if(conflict){output.push(fail('AMBIGUOUS_MATCH'));continue;}
   if(candidates.length!==1){output.push(fail(candidates.length?'AMBIGUOUS_MATCH':'NO_EXACT_MATCH'));continue;}
   const candidate=candidates[0];sourceUrl=candidate.sourceUrl;
   const hint=ids(product.existingCoupangUrl);
   if(hint && ['productId','itemId','vendorItemId'].some(k=>hint[k] !== undefined && hint[k] !== candidate[k])){output.push(fail('IDENTITY_CHANGED'));continue;}
   const detailPage=await read(sourceUrl);
   const detail=withVisibleOption(product,parseDetail(detailPage));
   if(detail.failure||detail.blocked)diagnostic(`detail item=${output.length+1} reason=${detailReason(detailPage,detail)}`);
   if(detail.blocked){output.push(fail(detail.blocked));stopped=true;break;}
   if(detail.failure){output.push(fail(detail.failure));continue;}
   if(!same(candidate,detail)){diagnostic(`detail item=${output.length+1} reason=IDENTITY_CHANGED`);output.push(fail('IDENTITY_CHANGED'));continue;}
   if(candidate.displayedPrice!==detail.displayedPrice||candidate.shippingFee!==detail.shippingFee||candidate.seller&&candidate.seller!==detail.seller||Array.isArray(product.comparisonAliases)&&product.comparisonAliases.length&&comparisonNameCore(candidate.title)!==comparisonNameCore(detail.title)){diagnostic(`detail item=${output.length+1} reason=CARD_DETAIL_DISAGREED`);output.push(fail('AMBIGUOUS_MATCH'));continue;}
   const detailQuantity=validateObservedQuantity(basis,detail);
   if(!detailQuantity.valid){diagnostic(`detail item=${output.length+1} reason=${detailQuantity.reason}`);output.push(fail('NO_EXACT_MATCH'));continue;}
   const visibleBrand=detail.title.includes(product.brand)?product.brand:'';
   const match=matchCandidate(product,{name:detail.title,brand:visibleBrand});
   if(match.hardMismatch||match.score<95){diagnostic(`detail item=${output.length+1} reason=${match.hardMismatch?'HARD_MISMATCH':'LOW_MATCH_SCORE'} score=${match.score} matchReasons=${match.reasons.join(',')||'NONE'}`);output.push(fail('NO_EXACT_MATCH'));continue;}
   const brand=match.matchedAlias??match.matchedBrand??visibleBrand;
   const {sourceUrl:cardUrl,...cardEvidence}=candidate;
   const observation={...base,...detail,brand,comparisonQuantity:product.comparisonQuantity,searchCard:{...cardEvidence,brand},observedAt:stamp()};
   const baseline=product.previousPrice ?? product.referencePrice;
   const delta=baseline>0?Math.abs(detail.displayedPrice-baseline)/baseline:0;
   if(delta>0.2&&delta<=0.4){const second=withVisibleOption(product,parseDetail(await read(sourceUrl)));if(second.blocked){output.push(fail(second.blocked));stopped=true;break;}if(second.failure||!same(detail,second)||second.title!==detail.title||second.displayedPrice!==detail.displayedPrice||second.seller!==detail.seller||second.shippingFee!==detail.shippingFee||second.priceCondition!==detail.priceCondition){output.push(fail('RECHECK_DISAGREED'));continue;}observation.recheck={displayedPrice:second.displayedPrice,sourceUrl:second.sourceUrl,productId:second.productId,itemId:second.itemId,vendorItemId:second.vendorItemId,observedAt:stamp()};}
   output.push(observation);
  }catch(error){if(/control|inactive|unassigned/i.test(String(error)))throw error;output.push(fail('NETWORK_ERROR'));stopped=true;break;}
 }
 if(!stopped)await taskSpace.finish({keep:[]});return output;
}

// Standard semantic DOM only: no unverified Coupang class-name assumptions.
// Missing/ambiguous semantic markup deliberately returns offer:null.
export function extractVisiblePage(){
 const visible=node=>node && node.getClientRects().length>0 && getComputedStyle(node).visibility!=='hidden';
 const nodes=(root,selector)=>[...root.querySelectorAll(selector)].filter(visible);
 const text=document.body?.innerText ?? '';
 const cleanPrice=root=>{
  let text=root.innerText;
  for(const crossed of nodes(root,'del, s, strike, .twc-line-through, .fw-line-through'))text=text.replace(crossed.innerText,'');
  return text.replace(/\([^)]*(?:당|per)[^)]*\)/gi,'').split('\n').filter(line=>! /배송/.test(line)).join('\n');
 };
 const cards=nodes(document,'a[href*="/vp/products/"]').slice(0,60).map(a=>{
  const names=nodes(a,'[class*="ProductUnit_productNameV2__"]'),prices=nodes(a,'[class*="PriceArea_priceArea__"]');
  const fees=nodes(a,'[data-badge-type="feePrice"]');
  const card=names.length===1&&prices.length===1&&fees.length<=1?{title:names[0].innerText.trim(),priceText:cleanPrice(prices[0]),shippingText:fees[0]?.innerText ?? (/무료배송/.test(a.innerText)?'무료배송':''),conditionText:a.innerText}:null;
  return {text:a.innerText,url:a.href,card};
 });
 const products=nodes(document,'[itemscope][itemtype$="/Product"]');
 let offer=null;
 if(products.length===1){
  const product=products[0];
  const offers=nodes(product,'[itemprop="offers"][itemscope]');
  const names=nodes(product,'[itemprop="name"]').filter(n=>!n.closest('[itemprop="offers"]'));
  if(offers.length===1 && names.length===1){
   const selected=offers[0];
   const prices=nodes(selected,'[itemprop="price"]');
   const sellers=nodes(selected,'[itemprop="seller"]');
   const alternatives=nodes(selected,'[aria-selected="false"], [aria-checked="false"], option, [itemprop="offers"]');
   if(prices.length===1 && sellers.length===1 && sellers[0].innerText.trim().length>0 && alternatives.length===0){
    offer={title:names[0].innerText.trim(),priceText:prices[0].innerText.trim(),text:selected.innerText,conditionText:product.innerText,seller:sellers[0]?.innerText.trim()};
   }
  }
 }
 // Observed Coupang selected-offer layout (TaskSpace 2, 2026-10-21).
 const titles=nodes(document,'h1.product-title'),containers=nodes(document,'.price-container'),sellerRegions=nodes(document,'.seller-info');
 let offerIssue=offer?null:titles.length!==1?'TITLE_UNVERIFIED':containers.length!==1?'PRICE_REGION_UNVERIFIED':sellerRegions.length!==1?'SELLER_UNVERIFIED':'OFFER_UNVERIFIED';
 if(!offer && titles.length===1 && containers.length===1 && sellerRegions.length===1){
  const priceContainer=containers[0],normal=nodes(priceContainer,'.price-layout-container.price-layout-normal');
  const shipping=nodes(priceContainer,'.price-shipping-fee-info-container');
  const sellerLinks=nodes(sellerRegions[0],'a[href*="shop.coupang.com/vid/"]');
  if(normal.length!==1)offerIssue=normal.length?'PRICE_REGION_AMBIGUOUS':'PRICE_REGION_UNVERIFIED';
  else if(shipping.length>1)offerIssue='SHIPPING_REGION_AMBIGUOUS';
  else if(sellerLinks.length!==1)offerIssue=sellerLinks.length?'SELLER_LINK_AMBIGUOUS':'SELLER_LINK_MISSING';
  if(normal.length===1 && shipping.length<=1 && sellerLinks.length===1){
   const sellerUrl=new URL(sellerLinks[0].href),currentUrl=new URL(location.href);
   const seller=sellerLinks[0].innerText.replace('판매자 상품 보러가기','').trim();
   if(!seller||seller.includes('\n'))offerIssue='SELLER_NAME_UNVERIFIED';
   else if(!sellerUrl.searchParams.get('viid')?.trim()||!currentUrl.searchParams.get('vendorItemId')?.trim())offerIssue='SELLER_ID_UNVERIFIED';
   else if(sellerUrl.hostname!=='shop.coupang.com'||!sellerUrl.pathname.startsWith('/vid/')||sellerUrl.searchParams.get('viid')!==currentUrl.searchParams.get('vendorItemId'))offerIssue='SELLER_ID_MISMATCH';
   if(seller && !seller.includes('\n') && sellerUrl.hostname==='shop.coupang.com' && sellerUrl.pathname.startsWith('/vid/') && !!sellerUrl.searchParams.get('viid')?.trim() && !!currentUrl.searchParams.get('vendorItemId')?.trim() && sellerUrl.searchParams.get('viid')===currentUrl.searchParams.get('vendorItemId')){
    offer={title:titles[0].innerText.trim(),priceText:cleanPrice(normal[0]),text:[normal[0].innerText,shipping[0]?.innerText].filter(Boolean).join('\n'),conditionText:priceContainer.innerText,seller};
   }
  }
 }
 if(offer)offerIssue=null;
 return {url:location.href,text,cards,offer,offerIssue};
}

// Self-contained because Ego Lite serializes this predicate into the page.
export function pageContentReady({url,kind}){
 const body=document.body?.innerText?.trim() ?? '';
 if(/captcha|access denied|접근이 차단|로그인이 필요|보안 문자/i.test(body))return true;
 if(document.readyState !== 'complete' || !body)return false;
 const expected=new URL(url),actual=new URL(location.href);
 if(actual.origin!==expected.origin || actual.pathname!==expected.pathname)return false;
 const visible=node=>node && node.getClientRects().length>0 && getComputedStyle(node).visibility!=='hidden';
 const nodes=(root,selector)=>[...root.querySelectorAll(selector)].filter(visible);
 if(kind==='search'){
  if(actual.searchParams.get('q')!==expected.searchParams.get('q'))return false;
  const queries=nodes(document,'input[name="q"]');
  if(queries.length!==1 || queries[0].value.trim()!==expected.searchParams.get('q')?.trim())return false;
  return nodes(document,'a[href*="/vp/products/"]').some(a=>a.innerText.trim().length>0) || nodes(document,'[role="status"]').some(n=>/검색.*(?:없|0개)/.test(n.innerText));
 }
 if(kind!=='detail')return false;
 if(['itemId','vendorItemId'].some(key=>expected.searchParams.has(key)&&actual.searchParams.get(key)!==expected.searchParams.get(key)))return false;
 const titles=nodes(document,'h1.product-title'),prices=nodes(document,'.price-container');
 if(titles.length===1 && titles[0].innerText.trim() && prices.length===1 && nodes(prices[0],'.price-layout-container.price-layout-normal').some(n=>/\d[\d,]*\s*원/.test(n.innerText))){
  const condition=prices[0].innerText.normalize('NFKC').replace(/\s+/g,'');
  if(/쿠폰|와우|wow|회원|멤버십|멤버쉽|membership|member|카드|card|청구할인|정기배송|정기구독|subscription|판매자정보없음|판매자없음/i.test(condition))return true;
  const sellers=nodes(document,'.seller-info');
  return sellers.length===1 && nodes(sellers[0],'a[href*="shop.coupang.com/vid/"]').some(link=>link.innerText.replace('판매자 상품 보러가기','').trim());
 }
 const products=nodes(document,'[itemscope][itemtype$="/Product"]');
 return products.some(product=>nodes(product,'[itemprop="name"]').some(n=>n.innerText.trim()) && nodes(product,'[itemprop="offers"][itemscope]').some(offer=>nodes(offer,'[itemprop="price"]').some(n=>n.innerText.trim()) && nodes(offer,'[itemprop="seller"]').some(n=>n.innerText.trim())));
}
