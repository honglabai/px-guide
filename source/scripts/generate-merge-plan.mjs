import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {definitions,restoreCards} from '../catalog/model.mjs';
import {comparisonBasisKey,deriveComparisonBasis} from '../price/comparison-basis.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const before=read('catalog/merge-baseline-20261025.json'),after=read('catalog/database.json'),selected=read('catalog/merge-selection-20261025.json');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fingerprints=t=>Object.fromEntries(Object.entries(t).map(([name,rows])=>[name,{count:rows.length,hash:hash(rows.map(r=>JSON.stringify(r)).sort())}]));
const primary={catalog_categories:[0],catalog_brands:[0],catalog_products:[0],catalog_codes:[0],catalog_aliases:[0,1],catalog_sequences:[0],catalog_texts:[0],catalog_records:[0,1],catalog_assets:[0,1],catalog_prices:[0,1],catalog_documents:[0],catalog_discounts:[0,1]};
const patch=[];const q=c=>'"'+c+'"';
for(const table of ['catalog_texts','catalog_products','catalog_codes','catalog_aliases','catalog_records','catalog_assets','catalog_prices','catalog_discounts','catalog_documents','catalog_sequences','catalog_brands','catalog_categories']){
 const cols=definitions[table],pk=primary[table],key=r=>JSON.stringify(pk.map(i=>r[i])),old=new Map(before[table].map(r=>[key(r),r]));
 const changed=after[table].filter(r=>JSON.stringify(old.get(key(r)))!==JSON.stringify(r));
 if(changed.length){const sql=`INSERT INTO ${table} (${cols.map(q).join(',')}) SELECT ${cols.map((_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?) WHERE 1 ON CONFLICT (${pk.map(i=>q(cols[i])).join(',')}) DO UPDATE SET ${cols.map((c,i)=>pk.includes(i)?null:`${q(c)}=excluded.${q(c)}`).filter(Boolean).join(',')}`;patch.push({sql,args:[JSON.stringify(changed)]});}
}
// Remove child rows before parent products. Historical codes and aliases were remapped above.
for(const table of ['catalog_records','catalog_assets','catalog_prices','catalog_discounts','catalog_aliases','catalog_codes','catalog_products']){
 const pk=primary[table],cols=definitions[table],key=r=>JSON.stringify(pk.map(i=>r[i])),remaining=new Set(after[table].map(key));const gone=before[table].filter(r=>!remaining.has(key(r))).map(r=>pk.map(i=>r[i]));
 if(gone.length)patch.push({sql:`DELETE FROM ${table} WHERE (${pk.map(i=>q(cols[i])).join(',')}) IN (SELECT ${pk.map((_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?))`,args:[JSON.stringify(gone)]});
}
const local=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())local.exec(fs.readFileSync('drizzle/'+file,'utf8').replaceAll('--> statement-breakpoint',''));
const extra=['catalog_state','coupang_price_current','price_history','price_update_queue','product_interest_daily'];
const backupColumns={...definitions,...Object.fromEntries(extra.map(t=>[t,local.prepare(`PRAGMA table_info(${t})`).all().map(r=>r.name)]))};
const targetPrices=new Map(read('dist/client/price-catalog.json').map(p=>[p.slug,p]));
const pairs=selected.map(p=>{const oldSlug=before.catalog_products.find(r=>r[0]===p.retireId)[1],newSlug=before.catalog_products.find(r=>r[0]===p.keepId)[1],target=targetPrices.get(newSlug);return {...p,oldSlug,newSlug,targetBasis:comparisonBasisKey(target),targetQuantity:deriveComparisonBasis(target).comparisonQuantity};});
const plan={id:'reviewed-merge-20261025',fromVersion:createHash('sha256').update(JSON.stringify(before)).digest('hex').slice(0,24),toVersion:createHash('sha256').update(JSON.stringify(after)).digest('hex').slice(0,24),before:fingerprints(before),after:fingerprints(after),pairs,patch,backupColumns};
fs.writeFileSync('catalog/merge-plan.json',JSON.stringify(plan));
const legacy={version:plan.fromVersion,products:restoreCards({tables:before}),codes:Object.fromEntries(before.catalog_codes.map(r=>[r[0],before.catalog_products.find(p=>p[0]===r[1])[1]]))};
fs.writeFileSync('catalog/merge-legacy-cards.json',JSON.stringify(legacy));
console.log({from:plan.fromVersion,to:plan.toVersion,patchStatements:patch.length,patchBytes:JSON.stringify(patch).length});
