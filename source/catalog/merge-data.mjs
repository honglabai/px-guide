import {decode} from './model.mjs';

// Append to the existing dictionary; never edit shared strings in place.
export function encodeValue(tables,value){
 const ids=new Map(tables.catalog_texts.map(([id,text])=>[text,id]));let next=Math.max(0,...tables.catalog_texts.map(r=>r[0]))+1;
 const intern=text=>{if(!ids.has(text)){ids.set(text,next);tables.catalog_texts.push([next++,text]);}return ids.get(text);};
 const encode=v=>typeof v==='string'?['s',intern(v)]:Array.isArray(v)?['a',...v.map(encode)]:v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[intern(k),encode(x)])):v;
 return JSON.stringify(encode(value));
}
export function mergeReviewed(original,selection){
 const tables=structuredClone(original),products=new Map(tables.catalog_products.map(r=>[r[0],r])),redirects={},ids=new Map();
 for(const {keepId,retireId} of selection){const keep=products.get(keepId),old=products.get(retireId);if(!keep||!old||keepId===retireId||ids.has(retireId)||keep[5]!==old[5])throw Error('Invalid reviewed merge');ids.set(retireId,keepId);redirects[old[1]]=keep[1];}
 if(selection.some(x=>ids.has(x.keepId)))throw Error('Merge chains are not supported');
 tables.catalog_products=tables.catalog_products.filter(r=>!ids.has(r[0]));
 tables.catalog_codes=tables.catalog_codes.map(r=>ids.has(r[1])?[r[0],ids.get(r[1]),r[2],0]:r);
 tables.catalog_aliases=tables.catalog_aliases.map(r=>[r[0],r[1],ids.get(r[2])||r[2]]);
 for(const [old,id] of ids)tables.catalog_aliases.push(['internal_id',String(old),id]);
 for(const table of ['catalog_records','catalog_assets','catalog_prices'])tables[table]=tables[table].filter(r=>!ids.has(r[0]));
 tables.catalog_discounts=tables.catalog_discounts.map(r=>[r[0],ids.get(r[1])||r[1],r[2],r[3]]);
 if(new Set(tables.catalog_discounts.map(r=>r[0]+':'+r[1])).size!==tables.catalog_discounts.length)throw Error('Monthly record collision');
 const texts=new Map(tables.catalog_texts);
 tables.catalog_documents=tables.catalog_documents.map(([name,payload])=>{const doc=decode(JSON.parse(payload),texts);for(const item of doc.items||[])item.productSlug=redirects[item.productSlug]||item.productSlug;return [name,encodeValue(tables,doc)];});
 return {tables,redirects};
}
export function refreshCardRows(tables,cards){
 const ids=new Map(tables.catalog_products.map(r=>[r[1],r[0]]));
 tables.catalog_records=tables.catalog_records.filter(r=>r[1]!=='card');tables.catalog_assets=tables.catalog_assets.filter(r=>r[1]!=='card');
 for(const card of cards){const id=ids.get(card.slug);if(!id)throw Error('Unknown card slug');const rest={...card},asset={};delete rest.slug;delete rest.name;delete rest.brand;
  for(const k of Object.keys(rest))if(k.startsWith('image')){asset[k]=rest[k];delete rest[k];}
  tables.catalog_records.push([id,'card',encodeValue(tables,rest)]);if(Object.keys(asset).length)tables.catalog_assets.push([id,'card',encodeValue(tables,asset)]);
 }
}
