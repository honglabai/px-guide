export function resolveSlug(slug,aliases={}){const value=slug.startsWith('pxpick-')?slug.slice(7):slug;return Object.hasOwn(aliases,value)?aliases[value]:value;}
export function mergeSavedLists(saved,cart,shopping,aliases={}){
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
