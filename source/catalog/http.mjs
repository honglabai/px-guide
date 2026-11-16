import {handlePriceFileImport} from './price-file-runtime.mjs';
import priceFilePlan from './price-file-plan.json' with {type:'json'};
import manifest from './import-manifest.json' with {type:'json'};
import {definitions} from './model.mjs';
import {loadCards} from './repository.mjs';
import {handleReviewedMerge} from './merge-runtime.mjs';
import mergePlan from './merge-plan.json' with {type:'json'};
import categoryPlan from './category-plan.json' with {type:'json'};
const response=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
async function hash(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function verifyCatalog(db){const checks={};for(const [table,columns]of Object.entries(definitions)){const result=await db.prepare(`SELECT ${columns.join(',')} FROM ${table}`).bind().all();const rows=result.results.map(r=>columns.map(c=>r[c]));checks[table]={count:rows.length,hash:await hash(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort()))};}return {valid:Object.entries(manifest.fingerprints).every(([t,v])=>v.count===checks[t].count&&v.hash===checks[t].hash),checks};}
export async function handleCatalog(request,env){const url=new URL(request.url);let path;try{path=decodeURIComponent(url.pathname);}catch{return null;}
 if(path.includes('catalog-import'))return response({error:'Forbidden'},403);
 if(!path.startsWith('/api/catalog/'))return null;
 if(path==='/api/catalog/admin/import-price-file')return handlePriceFileImport(request,env);
 if(path==='/api/catalog/admin/merge-reviewed')return handleReviewedMerge(request,env);
 // The one-off reviewed classification migration is complete; keep its route closed.
 if(path==='/api/catalog/admin/reclassify-reviewed')return response({error:'Forbidden'},403);
 try{
  if(path.startsWith('/api/catalog/admin/')){
   const token=request.headers.get('authorization');if(!env.CATALOG_MIGRATION_TOKEN||token!==`Bearer ${env.CATALOG_MIGRATION_TOKEN}`)return response({error:'Forbidden'},403);
   if(request.method!=='POST')return response({error:'Method not allowed'},405);
   const body=await request.json();if(body.version!==manifest.version)return response({error:'Version mismatch'},409);
   if(path==='/api/catalog/admin/seed'){
    if(!Number.isInteger(body.part)||body.part<0||body.part>=manifest.parts.length)return response({error:'Invalid part'},400);
    const done=await env.DB.prepare('SELECT value FROM catalog_state WHERE key=?').bind('part:'+manifest.version+':'+body.part).first();if(done?.value===manifest.parts[body.part])return response({ok:true,alreadyImported:true});
    const active=await env.DB.prepare("SELECT value FROM catalog_state WHERE key='active'").bind().first();if(active)return response({error:'Active catalog is immutable; stage a new migration'},409);
    const asset=await env.ASSETS.fetch(new Request(new URL(`/_catalog-import/part-${body.part}.json`,url)));if(!asset.ok)throw Error('Seed asset unavailable');const text=await asset.text();if(await hash(text)!==manifest.parts[body.part])throw Error('Seed checksum failed');const chunks=JSON.parse(text),statements=[];
    for(const chunk of chunks){const columns=definitions[chunk.table];if(!columns||!Array.isArray(chunk.rows)||chunk.rows.some(r=>r.length!==columns.length))throw Error('Invalid seed chunk');const sql=`INSERT OR REPLACE INTO ${chunk.table} (${columns.join(',')}) VALUES ${chunk.rows.map(()=>`(${columns.map(()=>'?').join(',')})`).join(',')}`;statements.push(env.DB.prepare(sql).bind(...chunk.rows.flat()));}
    statements.push(env.DB.prepare('INSERT OR REPLACE INTO catalog_state(key,value) VALUES(?,?)').bind('part:'+manifest.version+':'+body.part,manifest.parts[body.part]));await env.DB.batch(statements);return response({ok:true,part:body.part});
   }
   if(path==='/api/catalog/admin/verify'||path==='/api/catalog/admin/activate'){
    const verified=await verifyCatalog(env.DB);if(!verified.valid)return response(verified,409);
    if(path.endsWith('/activate')){
     const statements=['coupang_price_current','price_history','price_update_queue','product_interest_daily'].map(table=>env.DB.prepare(`UPDATE ${table} SET catalog_product_key=(SELECT id FROM catalog_products WHERE slug=${table}.product_slug) WHERE catalog_product_key IS NULL`).bind());
     statements.push(env.DB.prepare("INSERT OR REPLACE INTO catalog_state(key,value) VALUES('active',?)").bind(manifest.version));await env.DB.batch(statements);
    }return response({...verified,version:manifest.version});
   }
   return response({error:'Not found'},404);
  }
  if(request.method!=='GET')return response({error:'Method not allowed'},405);
  if(path!=='/api/catalog/products')return response({error:'Not found'},404);
  const requestedVersion=url.searchParams.get('v');
  if(requestedVersion===priceFilePlan.toVersion){
   const active=(await env.DB.prepare("SELECT value FROM catalog_state WHERE key='active'").bind().first())?.value;
   if(active===priceFilePlan.fromVersion){
    const ids=(url.searchParams.get('ids')||'').split(','),namespace=url.searchParams.get('namespace')||'legacy_slug';if(ids.length>100||!ids.every(s=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)&&s.length<=160)||!['legacy_slug','product_code'].includes(namespace))return response({error:'Invalid identifiers'},400);
    const asset=await env.ASSETS.fetch(new Request(new URL('/_catalog-import/price-file-target-cards.json',url)));if(!asset.ok)return response({error:'Catalog snapshot unavailable'},503);const snapshot=await asset.json();if(snapshot.version!==requestedVersion)return response({error:'Catalog snapshot version mismatch'},503);const slugs=new Set(ids.map(id=>namespace==='product_code'?snapshot.codes[id]:snapshot.aliases?.[id]||id));return Response.json({version:requestedVersion,products:snapshot.products.filter(p=>slugs.has(p.slug))},{headers:{'Cache-Control':'public, max-age=31536000, immutable'}});
   }
  }
  // Keep immutable responses aligned with both old and newly published indexes.
  if(requestedVersion===categoryPlan.fromVersion||requestedVersion===categoryPlan.toVersion){
   {
    const ids=(url.searchParams.get('ids')||'').split(','),namespace=url.searchParams.get('namespace')||'legacy_slug';if(ids.length>100||!ids.every(s=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)&&s.length<=160)||!['legacy_slug','product_code'].includes(namespace))return response({error:'Invalid identifiers'},400);
    const file=requestedVersion===categoryPlan.fromVersion?'category-legacy-cards.json':'category-target-cards.json',asset=await env.ASSETS.fetch(new Request(new URL('/_catalog-import/'+file,url)));if(!asset.ok)return response({error:'Catalog snapshot unavailable'},503);const snapshot=await asset.json();if(snapshot.version!==requestedVersion)return response({error:'Catalog snapshot version mismatch'},503);const slugs=new Set(ids.map(id=>namespace==='product_code'?snapshot.codes[id]:snapshot.aliases?.[id]||id));return Response.json({version:requestedVersion,products:snapshot.products.filter(p=>slugs.has(p.slug))},{headers:{'Cache-Control':'public, max-age=31536000, immutable'}});
   }
  }
  if(requestedVersion===mergePlan.fromVersion){
   const ids=(url.searchParams.get('ids')||'').split(','),namespace=url.searchParams.get('namespace')||'legacy_slug';
   if(ids.length>100||!ids.every(s=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)&&s.length<=160)||!['legacy_slug','product_code'].includes(namespace))return response({error:'Invalid identifiers'},400);
   const asset=await env.ASSETS.fetch(new Request(new URL('/_catalog-import/legacy-cards.json',url)));if(!asset.ok)return response({error:'Legacy catalog unavailable'},503);const legacy=await asset.json(),slugs=new Set(ids.map(id=>namespace==='product_code'?legacy.codes[id]:id));
   return Response.json({version:requestedVersion,products:legacy.products.filter(p=>slugs.has(p.slug))},{headers:{'Cache-Control':'public, max-age=31536000, immutable'}});
  }
  if(requestedVersion!==manifest.version)return response({error:'Version mismatch'},409);
  const active=await env.DB.prepare("SELECT value FROM catalog_state WHERE key='active'").bind().first();
  if(active?.value!==manifest.version){
   const ids=(url.searchParams.get('ids')||'').split(','),namespace=url.searchParams.get('namespace')||'legacy_slug';
   if(ids.length>100||!ids.every(s=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)&&s.length<=160)||!['legacy_slug','product_code'].includes(namespace))return response({error:'Invalid identifiers'},400);
   const asset=await env.ASSETS.fetch(new Request(new URL('/_catalog-import/monthly-target-cards.json',url)));if(!asset.ok)return response({error:'Catalog snapshot unavailable'},503);
   const snapshot=await asset.json();if(snapshot.version!==manifest.version)return response({error:'Catalog snapshot version mismatch'},503);
   const slugs=new Set(ids.map(id=>namespace==='product_code'?snapshot.codes[id]:snapshot.aliases[id]||id));
   return Response.json({version:manifest.version,products:snapshot.products.filter(p=>slugs.has(p.slug))},{headers:{'Cache-Control':'public, max-age=31536000, immutable'}});
  }
  const ids=(url.searchParams.get('ids')||'').split(',');if(ids.length>100||!ids.every(s=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)&&s.length<=160))return response({error:'Invalid identifiers'},400);
  const namespace=url.searchParams.get('namespace')||'legacy_slug';if(!['legacy_slug','product_code'].includes(namespace))return response({error:'Invalid namespace'},400);
  return Response.json({version:manifest.version,products:await loadCards(env.DB,ids,namespace)},{headers:{'Cache-Control':'public, max-age=31536000, immutable'}});
 }catch(e){console.error('Catalog operation unavailable',e.message);return response({error:'Catalog unavailable'},503);}
}
