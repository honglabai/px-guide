import {leaves} from './classification.mjs';
// Offline administrative operation. Publish a separately staged, verified catalog after use.
export function reclassify(original,slug,leaf,requestKey){
 if(!leaves.some(l=>l.code===leaf)||typeof requestKey!=='string'||!requestKey||requestKey.length>120)throw Error('Invalid reclassification');
 const registry=structuredClone(original),p=registry[slug];if(!p)throw Error('Unknown product');p.requests??={};
 if(Object.hasOwn(p.requests,requestKey)){const prior=p.requests[requestKey];if(prior.leaf!==leaf)throw Error('Request key reused for a different category');return {registry,code:prior.code};}
 if(p.code.slice(0,6)!==leaf){const used=Object.values(registry).flatMap(r=>[r.code,...(r.history||[])]).filter(c=>c.startsWith(leaf)).map(c=>Number(c.slice(6)));const n=Math.max(0,...used)+1;if(n>999999)throw Error('Category sequence exhausted');p.history=[...(p.history||[]),p.code];p.code=leaf+String(n).padStart(6,'0');p.categoryOverride=leaf;}
 p.requests[requestKey]={leaf,code:p.code};return {registry,code:p.code};
}
