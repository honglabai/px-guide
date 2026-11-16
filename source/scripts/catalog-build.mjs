import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {compileCatalog,restoreProducts,restoreCards,restoreDocument,definitions} from '../catalog/model.mjs';
import {refreshCardRows} from '../catalog/merge-data.mjs';
import {resolveSlug,mergeSavedLists} from '../catalog/list-merge.mjs';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export function migrate(){const documents=Object.fromEntries(['monthly.json',...fs.readdirSync('content/monthly-archive').filter(f=>/^\d{4}-\d{2}\.json$/.test(f)).sort().map(f=>'monthly-archive/'+f)].map(f=>[f,json('content/'+f)]));const c=compileCatalog({products:json('content/products.json'),cards:json('dist/client/favorites-data.json'),documents},fs.existsSync('catalog/registry.json')?json('catalog/registry.json'):undefined);fs.writeFileSync('catalog/database.json',JSON.stringify(c.tables));fs.writeFileSync('catalog/registry.json',JSON.stringify(c.registry));return c;}
export function load(){return {format:1,registry:json('catalog/registry.json'),tables:json('catalog/database.json')};}
export function materialize(){const c=load();fs.mkdirSync('content/monthly-archive',{recursive:true});fs.writeFileSync('content/products.json',JSON.stringify(restoreProducts(c),null,2));for(const name of c.tables.catalog_documents.map(r=>r[0]))fs.writeFileSync('content/'+name,JSON.stringify(restoreDocument(c,name),null,2));}
export function buildAssets(){const c=load();const actual=json('dist/client/favorites-data.json');if(process.argv.includes('--refresh-merged-cards')){if(c.tables.catalog_products.length!==2311||actual.length!==2309)throw Error('Unexpected reviewed merge counts');refreshCardRows(c.tables,actual);fs.writeFileSync('catalog/database.json',JSON.stringify(c.tables));}const cards=restoreCards(c);if(actual.length!==cards.length)throw Error('Catalog card count differs');if(JSON.stringify(actual)!==JSON.stringify(cards)){
 // Compare values rather than property order; reconstruction deliberately normalizes keys.
 for(let i=0;i<actual.length;i++)if(JSON.stringify(Object.entries(actual[i]).sort())!==JSON.stringify(Object.entries(cards[i]).sort()))throw Error('Catalog view differs; rerun catalog migration before publication: '+actual[i].slug);
}
 const hash=s=>createHash('sha256').update(s).digest('hex'),version=hash(JSON.stringify(c.tables)).slice(0,24);
 const groups={};for(const p of cards){const g=p.productGroup;groups[g]=(groups[g]||0)+1;}
 const index={version,groups,products:cards.map(p=>Object.fromEntries(['slug','name','category','subcategory','productGroup','pxPrice','officialPrice','catalogVisible'].map(k=>[k,p[k]])))};
 fs.mkdirSync('dist/client/catalog',{recursive:true});fs.writeFileSync(`dist/client/catalog/index-${version}.json`,JSON.stringify(index));fs.writeFileSync('dist/client/catalog/manifest.json',JSON.stringify({version,index:`/catalog/index-${version}.json`}));
 const statements=[];for(const [table,cols]of Object.entries(definitions)){const rows=c.tables[table],size=Math.floor(90/cols.length);for(let i=0;i<rows.length;i+=size)statements.push({table,rows:rows.slice(i,i+size)});}
 fs.mkdirSync('dist/client/_catalog-import',{recursive:true});
 const slugById=new Map(c.tables.catalog_products.map(p=>[p[0],p[1]]));
 const codes=Object.fromEntries(c.tables.catalog_codes.map(([code,id])=>[code,slugById.get(id)]));
 const snapshotAliases=Object.fromEntries(c.tables.catalog_aliases.filter(([kind])=>kind==='legacy_slug').map(([,old,id])=>[old,slugById.get(id)]));
 fs.writeFileSync('dist/client/_catalog-import/monthly-target-cards.json',JSON.stringify({version,products:cards,codes,aliases:snapshotAliases}));if(fs.existsSync('catalog/merge-legacy-cards.json'))fs.copyFileSync('catalog/merge-legacy-cards.json','dist/client/_catalog-import/legacy-cards.json');for(const name of ["category-legacy-cards.json","category-target-cards.json","price-file-target-cards.json"])if(fs.existsSync("catalog/"+name))fs.copyFileSync("catalog/"+name,"dist/client/_catalog-import/"+name);const parts=[];for(let i=0;i<statements.length;i+=25){const body=JSON.stringify(statements.slice(i,i+25)),n=parts.length;fs.writeFileSync(`dist/client/_catalog-import/part-${n}.json`,body);parts.push(hash(body));}
 const fingerprints={};for(const [t,rows]of Object.entries(c.tables))fingerprints[t]={count:rows.length,hash:hash(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort()))};
 const manifest={version,parts,fingerprints};fs.writeFileSync('catalog/import-manifest.json',JSON.stringify(manifest));
 fs.writeFileSync('dist/client/product-data-client.js',fs.readFileSync('product-data-client.js'));
 const aliases=fs.existsSync('catalog/product-aliases.json')?json('catalog/product-aliases.json'):{};
 fs.writeFileSync('dist/client/product-aliases.js',`(()=>{const aliases=${JSON.stringify(aliases)};${resolveSlug.toString()}\n${mergeSavedLists.toString()}\nwindow.pxResolveProductSlug=s=>resolveSlug(s,aliases);window.pxMergeSavedLists=(a,b,c)=>mergeSavedLists(a,b,c,aliases);const keys=['px-guide-favorites-v1','px-guide-cart-v1','px-guide-shopping-v1'];function migrate(){let old;try{old=keys.map(k=>localStorage.getItem(k));const parsed=old.map((v,i)=>JSON.parse(v||(i===0?'[]':'{}')));const next=mergeSavedLists(...parsed,aliases),values=[next.saved,next.cart,next.shopping].map(JSON.stringify);window.pxMergedListRetainedSeparate=next.retainedSeparate;if(!values.some((v,i)=>old[i]!==null&&v!==old[i]))return;const backup='px-guide-merge-backup-20261025';if(!localStorage.getItem(backup))localStorage.setItem(backup,JSON.stringify(old));keys.forEach((k,i)=>{if(old[i]!==null||values[i]!== (i===0?'[]':'{}'))localStorage.setItem(k,values[i]);});}catch{if(old)try{keys.forEach((k,i)=>old[i]===null?localStorage.removeItem(k):localStorage.setItem(k,old[i]));}catch{}}}migrate();window.addEventListener('storage',e=>{if(e.key===null||keys.includes(e.key))migrate();});})();`);
 return manifest;
}
if(process.argv[1]?.endsWith('catalog-build.mjs')){if(process.argv.includes('--migrate'))migrate();else if(process.argv.includes('--materialize'))materialize();}
