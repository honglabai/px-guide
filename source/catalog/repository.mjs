import {decode} from './model.mjs';
function references(v,ids){if(Array.isArray(v)){if(v[0]==='s')ids.add(v[1]);else v.slice(1).forEach(v=>references(v,ids));}else if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){ids.add(Number(k));references(x,ids);}}
export async function loadCards(db,identifiers,namespace='legacy_slug'){
 if(!['legacy_slug','product_code'].includes(namespace))throw Error('Invalid namespace');
 const unique=[...new Set(identifiers)];if(unique.length>100)throw Error('Too many identifiers');if(!unique.length)return [];
 const marks=unique.map(()=>'?').join(',');
 const join=namespace==='product_code'?'JOIN catalog_codes i ON i.product_id=p.id':'JOIN catalog_aliases i ON i.product_id=p.id AND i.namespace=\'legacy_slug\'';
 const key=namespace==='product_code'?'i.code':'i.identifier';
 const rows=(await db.prepare(`SELECT DISTINCT p.id,p.slug,p.name,b.name AS brand,r.payload,a.payload AS asset FROM catalog_products p ${join} JOIN catalog_brands b ON b.id=p.brand_id JOIN catalog_records r ON r.product_id=p.id AND r.kind='card' LEFT JOIN catalog_assets a ON a.product_id=p.id AND a.kind='card' WHERE ${key} IN (${marks}) ORDER BY p.sort_order`).bind(...unique).all()).results;
 const ids=new Set(),parsed=rows.map(r=>{const data=JSON.parse(r.payload),asset=JSON.parse(r.asset||'{}');references(data,ids);references(asset,ids);return {r,data,asset};});
 const texts=new Map(),all=[...ids];for(let i=0;i<all.length;i+=90){const batch=all.slice(i,i+90);const data=await db.prepare(`SELECT id,value FROM catalog_texts WHERE id IN (${batch.map(()=>'?').join(',')})`).bind(...batch).all();for(const r of data.results)texts.set(r.id,r.value);}
 if(all.some(id=>!texts.has(id)))throw Error('Incomplete catalog dictionary');
 return parsed.map(({r,data,asset})=>({slug:r.slug,name:r.name,brand:r.brand,...decode(data,texts),...decode(asset,texts)}));
}
export async function resolveIdentifier(db,namespace,value){if(namespace==='product_code')return (await db.prepare('SELECT product_id FROM catalog_codes WHERE code=?').bind(value).first())?.product_id??null;return (await db.prepare('SELECT product_id FROM catalog_aliases WHERE namespace=? AND identifier=?').bind(namespace,value).first())?.product_id??null;}
