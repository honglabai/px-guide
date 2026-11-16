import {majors,leaves,classify} from './classification.mjs';
export const definitions={
 catalog_categories:['id','parent_id','level','code','name'],catalog_brands:['id','name'],catalog_products:['id','slug','name','brand_id','category_id','tax_type','sort_order','visible'],catalog_codes:['code','product_id','category_id','is_current'],catalog_aliases:['namespace','identifier','product_id'],catalog_sequences:['category_id','last_sequence'],catalog_texts:['id','value'],catalog_records:['product_id','kind','payload'],catalog_assets:['product_id','kind','payload'],catalog_prices:['product_id','kind','amount'],catalog_documents:['name','payload'],catalog_discounts:['month','product_id','regular_price','sale_price']
};
export function decode(value,texts){if(Array.isArray(value)){if(value[0]==='s')return texts.get(value[1]);if(value[0]!=='a')throw Error('Invalid encoded array');return value.slice(1).map(v=>decode(v,texts));}if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[texts.get(Number(k)),decode(v,texts)]));return value;}
export function compileCatalog({products,cards,documents},prior){
 const tables=Object.fromEntries(Object.keys(definitions).map(k=>[k,[]])),registry=prior?structuredClone(prior):{},texts=new Map(),brands=new Map();
 function intern(v){if(!texts.has(v))texts.set(v,texts.size+1);return texts.get(v);}
 function encode(v){if(typeof v==='string')return ['s',intern(v)];if(Array.isArray(v))return ['a',...v.map(encode)];if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,v])=>[intern(k),encode(v)]));return v;}
 const cat=new Map();function node(code,name,parent){if(!cat.has(code)){const id=cat.size+1;cat.set(code,id);tables.catalog_categories.push([id,parent,code.length/2,code,name]);}return cat.get(code);}
 for(const [code,name] of Object.entries(majors))node(code,name,null);
 for(const l of [...leaves].sort((a,b)=>a.code.localeCompare(b.code))){const parent=node(l.code.slice(0,4),l.middle,cat.get(l.code.slice(0,2)));node(l.code,l.name,parent);}
 const sourceMap=new Map(products.map(p=>[p.slug,p])),cardMap=new Map(cards.map(p=>[p.slug,p])),all=[...cards];
 for(const d of Object.values(documents))for(const p of d.items||[])if(!all.some(x=>x.slug===p.productSlug))all.push({slug:p.productSlug,name:p.name,brand:'',category:p.category,subcategory:p.category==='화장품'?'패드·팩':p.name.includes('시리얼')?'빵·시리얼':'라면·면류',catalogVisible:false});
 let nextId=Math.max(0,...Object.values(registry).map(r=>r.id))+1;const seq=new Map();for(const r of Object.values(registry))for(const c of [r.code,...(r.history||[])])seq.set(c.slice(0,6),Math.max(seq.get(c.slice(0,6))||0,Number(c.slice(6))));
 const priceFields=['pxPrice','officialPrice','vatExemptPrice','pxPromotionPrice','boxPrice','referencePrice'];
 for(const [order,p]of all.entries()){
  const code=registry[p.slug]?.categoryOverride||classify(p),category=cat.get(code);if(!category)throw Error('Missing category '+code);
  if(!registry[p.slug]){const n=(seq.get(code)||0)+1;if(n>999999)throw Error('Category sequence exhausted');seq.set(code,n);registry[p.slug]={id:nextId++,code:code+String(n).padStart(6,'0')};}
  const r=registry[p.slug];if(r.code.slice(0,6)!==code)throw Error('Reclassification requires explicit alias-preserving migration: '+p.slug);
  if(!brands.has(p.brand||''))brands.set(p.brand||'',brands.size+1);
  tables.catalog_products.push([r.id,p.slug,p.name,brands.get(p.brand||''),category,p.category==='면세주류'?'duty_free':'regular',order,p.catalogVisible===false?0:1]);
  tables.catalog_codes.push([r.code,r.id,category,1]);for(const old of r.history||[])tables.catalog_codes.push([old,r.id,cat.get(old.slice(0,6)),0]);tables.catalog_aliases.push(['legacy_slug',p.slug,r.id]);
  const source=sourceMap.get(p.slug);if(source?.catalogId)tables.catalog_aliases.push(['source_catalog',String(source.catalogId),r.id]);
  for(const [kind,record]of [['source',source],['card',cardMap.get(p.slug)]]){if(!record)continue;const rest={...record};delete rest.slug;delete rest.name;delete rest.brand;const asset={};for(const key of Object.keys(rest))if(key.startsWith('image')){asset[key]=rest[key];delete rest[key];}
   if(kind==='source')for(const key of priceFields)if(Number.isFinite(rest[key])){tables.catalog_prices.push([r.id,key,rest[key]]);delete rest[key];}
   tables.catalog_records.push([r.id,kind,JSON.stringify(encode(rest))]);if(Object.keys(asset).length)tables.catalog_assets.push([r.id,kind,JSON.stringify(encode(asset))]);
  }
 }
 for(const [name,doc]of Object.entries(documents)){tables.catalog_documents.push([name,JSON.stringify(encode(doc))]);const seen=new Set();for(const p of doc.items||[]){const key=doc.month+':'+p.productSlug;if(seen.has(key))throw Error('duplicate monthly');seen.add(key);if(!tables.catalog_discounts.some(r=>r[0]===doc.month&&r[1]===registry[p.productSlug].id))tables.catalog_discounts.push([doc.month,registry[p.productSlug].id,p.regularPrice,p.salePrice]);}}
 for(const [oldSlug,r] of Object.entries(registry)){if(!r.mergedInto)continue;const target=registry[r.mergedInto];if(!target||!tables.catalog_products.some(p=>p[0]===target.id))throw Error('Missing merged product target');tables.catalog_aliases.push(['legacy_slug',oldSlug,target.id],['internal_id',String(r.id),target.id]);if(oldSlug.startsWith('catalog-'))tables.catalog_aliases.push(['source_catalog',oldSlug.slice(8),target.id]);for(const code of [r.code,...(r.history||[])])tables.catalog_codes.push([code,target.id,cat.get(code.slice(0,6)),0]);}
 tables.catalog_sequences=[...seq].map(([code,n])=>[cat.get(code),n]);tables.catalog_brands=[...brands].map(([name,id])=>[id,name]);tables.catalog_texts=[...texts].map(([value,id])=>[id,value]);
 return {format:1,registry,tables};
}
export function restoreDocument(c,name){const row=c.tables.catalog_documents.find(r=>r[0]===name);if(!row)throw Error('Missing document '+name);return decode(JSON.parse(row[1]),new Map(c.tables.catalog_texts));}
export function restoreRows(c,kind){const texts=new Map(c.tables.catalog_texts),brands=new Map(c.tables.catalog_brands),products=new Map(c.tables.catalog_products.map(r=>[r[0],r]));return c.tables.catalog_records.filter(r=>r[1]===kind).map(([id,,payload])=>{const p=products.get(id);const value={slug:p[1],name:p[2],brand:brands.get(p[3]),...decode(JSON.parse(payload),texts)};if(kind==='source')for(const [pid,key,amount]of c.tables.catalog_prices)if(pid===id)value[key]=amount;const a=c.tables.catalog_assets.find(r=>r[0]===id&&r[1]===kind);if(a)Object.assign(value,decode(JSON.parse(a[2]),texts));return value;});}
export const restoreProducts=c=>restoreRows(c,'source');
export const restoreCards=c=>restoreRows(c,'card');
