import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {applyCategoryReview} from '../catalog/category-review.mjs';
import {definitions,restoreCards} from '../catalog/model.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));const before=read('catalog/category-baseline.json'),review=read('catalog/category-review.json');const {tables:after,registry,changes}=applyCategoryReview(before,read('catalog/category-baseline-registry.json'),review.rows);if(changes.length!==263)throw Error('Unexpected selection count');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');const fingerprints=t=>Object.fromEntries(Object.entries(t).map(([name,rows])=>[name,{count:rows.length,hash:hash(rows.map(r=>JSON.stringify(r)).sort())}]));
const primary={catalog_categories:[0],catalog_products:[0],catalog_codes:[0],catalog_sequences:[0],catalog_texts:[0],catalog_records:[0,1]},patch=[],q=c=>'"'+c+'"';
for(const table of ['catalog_categories','catalog_texts','catalog_products','catalog_codes','catalog_records','catalog_sequences']){
 const cols=definitions[table],pk=primary[table],key=r=>JSON.stringify(pk.map(i=>r[i])),old=new Map(before[table].map(r=>[key(r),r]));const changed=after[table].filter(r=>JSON.stringify(old.get(key(r)))!==JSON.stringify(r));
 const sql=`INSERT INTO ${table} (${cols.map(q).join(',')}) SELECT ${cols.map((_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?) WHERE 1 ON CONFLICT (${pk.map(i=>q(cols[i])).join(',')}) DO UPDATE SET ${cols.map((c,i)=>pk.includes(i)?null:`${q(c)}=excluded.${q(c)}`).filter(Boolean).join(',')}`;
 let chunk=[],size=0;for(const r of changed){const bytes=Buffer.byteLength(JSON.stringify(r));if(chunk.length&&size+bytes>70000){patch.push({sql,args:[JSON.stringify(chunk)]});chunk=[];size=0;}chunk.push(r);size+=bytes;}if(chunk.length)patch.push({sql,args:[JSON.stringify(chunk)]});
}
const plan={id:'category-review-20261024',fromVersion:hash(before).slice(0,24),toVersion:hash(after).slice(0,24),before:fingerprints(before),after:fingerprints(after),count:changes.length,patch};
for(const [name,value]of Object.entries({'database.json':after,'registry.json':registry,'category-plan.json':plan,'category-changes.json':changes}))fs.writeFileSync('catalog/'+name,JSON.stringify(value));
for(const [name,tables,version]of [['category-legacy-cards.json',before,plan.fromVersion],['category-target-cards.json',after,plan.toVersion]]){const slugs=new Map(tables.catalog_products.map(p=>[p[0],p[1]]));fs.writeFileSync('catalog/'+name,JSON.stringify({version,products:restoreCards({tables}),codes:Object.fromEntries(tables.catalog_codes.map(r=>[r[0],slugs.get(r[1])])),aliases:Object.fromEntries(tables.catalog_aliases.filter(r=>r[0]==='legacy_slug').map(r=>[r[1],slugs.get(r[2])]))}));}
console.log({from:plan.fromVersion,to:plan.toVersion,count:changes.length,statements:patch.length});
