(()=>{const aliases={"catalog-34922":"catalog-34920","catalog-36334":"catalog-36332","catalog-35170":"catalog-35162","catalog-35176":"catalog-35164","catalog-30530":"catalog-35166","catalog-35178":"catalog-35168","catalog-36466":"catalog-36464","catalog-25850":"catalog-25950","catalog-25952":"catalog-25852","catalog-25864":"catalog-25964","catalog-25848":"catalog-25948","catalog-28438":"seoul-milk-2300","potato-crisp-sweet-corn":"catalog-35378","indomie-migoreng-5":"catalog-35662","olision-organic-olive-oil-500":"catalog-36834","daesang-arophene-fit":"catalog-34060","daesang-arophene-reboot":"catalog-34200","joint-sallido-42":"catalog-27890","mykids-multivitamin-gummy":"catalog-34058","mykids-calcium-d-gummy":"catalog-33984","mediheal-w-h-p-black-mask-ex":"catalog-29918","eco-cooling-polo-110":"catalog-37808","eco-cooling-polo-100":"catalog-36276","eco-cooling-polo-95":"catalog-37812","innisfree-perfect9-intensive-set":"catalog-36044","myhot-military-warmer-180":"catalog-35040"};function resolveSlug(slug,aliases={}){const value=slug.startsWith('pxpick-')?slug.slice(7):slug;return Object.hasOwn(aliases,value)?aliases[value]:value;}
function mergeSavedLists(saved,cart,shopping,aliases={}){
 const safe=s=>typeof s==='string'&&s!=='__proto__'&&s!=='constructor';
 const quantity=n=>Math.max(1,Math.min(99,Number.isFinite(Number(n))?Math.round(Number(n)):1));
 const clean=s=>s.startsWith('pxpick-')?s.slice(7):s;
 const favorites=[...new Set((Array.isArray(saved)?saved:[]).filter(safe).map(clean))];
 const rows=value=>Object.fromEntries(Object.entries(value&&typeof value==='object'&&!Array.isArray(value)?value:{}).filter(([s])=>safe(s)).map(([s,r])=>[clean(s),{qty:quantity(r?.qty),checked:r?.checked===true}]));
 const oldCart=rows(cart),oldShopping=rows(shopping);let retainedSeparate=false;
 function coalesce(entries){const grouped=new Map(),out={};
  for(const [slug,row]of entries){const key=resolveSlug(slug,aliases);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push([slug,row]);}
  for(const [key,group]of grouped){const total=group.reduce((n,[,r])=>n+r.qty,0),mixed=group.some(([,r])=>r.checked!==group[0][1].checked);
   if(total>99||mixed){retainedSeparate=true;for(const [slug,row]of group)out[slug]=row;}else out[key]={qty:total,checked:group[0][1].checked};
  }return out;
 }
 const favoriteRows=coalesce(favorites.map(s=>[s,oldCart[s]||{qty:1,checked:false}]));
 const nextSaved=Object.keys(favoriteRows),nextCart={};
 for(const s of nextSaved){const r=favoriteRows[s];if(r.qty!==1||r.checked||Object.hasOwn(oldCart,s)||favorites.some(old=>resolveSlug(old,aliases)===s&&Object.hasOwn(oldCart,old)))nextCart[s]=r;}
 for(const [slug,row]of Object.entries(oldCart))if(!favorites.includes(slug)&&!Object.hasOwn(nextCart,slug))nextCart[slug]=row;
 return{saved:nextSaved,cart:nextCart,shopping:coalesce(Object.entries(oldShopping)),retainedSeparate};
}
window.pxResolveProductSlug=s=>resolveSlug(s,aliases);window.pxMergeSavedLists=(a,b,c)=>mergeSavedLists(a,b,c,aliases);const keys=['px-guide-favorites-v1','px-guide-cart-v1','px-guide-shopping-v1'];function migrate(){let old;try{old=keys.map(k=>localStorage.getItem(k));const parsed=old.map((v,i)=>JSON.parse(v||(i===0?'[]':'{}')));const next=mergeSavedLists(...parsed,aliases),values=[next.saved,next.cart,next.shopping].map(JSON.stringify);window.pxMergedListRetainedSeparate=next.retainedSeparate;if(!values.some((v,i)=>old[i]!==null&&v!==old[i]))return;const backup='px-guide-merge-backup-20261025';if(!localStorage.getItem(backup))localStorage.setItem(backup,JSON.stringify(old));keys.forEach((k,i)=>{if(old[i]!==null||values[i]!== (i===0?'[]':'{}'))localStorage.setItem(k,values[i]);});}catch{if(old)try{keys.forEach((k,i)=>old[i]===null?localStorage.removeItem(k):localStorage.setItem(k,old[i]));}catch{}}}migrate();window.addEventListener('storage',e=>{if(e.key===null||keys.includes(e.key))migrate();});})();