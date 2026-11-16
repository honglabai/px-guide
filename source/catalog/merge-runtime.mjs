import plan from './merge-plan.json' with {type:'json'};
import {definitions} from './model.mjs';
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function check(db,expected){const checks={};for(const [table,cols]of Object.entries(definitions)){const rows=(await db.prepare(`SELECT ${cols.join(',')} FROM ${table}`).bind().all()).results.map(row=>cols.map(c=>row[c]));checks[table]={count:rows.length,hash:await digest(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort()))};}return{valid:Object.entries(expected).every(([t,x])=>x.count===checks[t].count&&x.hash===checks[t].hash),checks};}
const mapping=JSON.stringify(plan.pairs),oldSlugs="SELECT json_extract(value,'$.oldSlug') FROM json_each(?)";
function archiveObject(columns){const chunks=[];for(let i=0;i<columns.length;i+=16)chunks.push(`json_object(${columns.slice(i,i+16).flatMap(c=>[`'${c}'`,`"${c}"`]).join(',')})`);return chunks.reduce((a,b)=>`json_patch(${a},${b})`);}
function operationalStatements(db){
 const result=[],push=(sql,args)=>result.push(db.prepare(sql).bind(...args));
 for(const table of ['coupang_price_current','price_update_queue']){
  const cols=plan.backupColumns[table];
  const select=cols.map(c=>c==='product_slug'?"json_extract(m.value,'$.newSlug')":c==='catalog_product_key'?"json_extract(m.value,'$.keepId')":`s."${c}"`);
  const updates=table==='coupang_price_current'?cols.filter(c=>c!=='product_slug').map(c=>`"${c}"=excluded."${c}"`).join(','):
   `priority=MAX(${table}.priority,excluded.priority),attempts=MAX(${table}.attempts,excluded.attempts),created_at=MIN(${table}.created_at,excluded.created_at),updated_at=MAX(${table}.updated_at,excluded.updated_at)`;
  const eligible=table==='coupang_price_current'?"json_extract(m.value,'$.targetBasis') IS NOT NULL AND s.comparison_basis=json_extract(m.value,'$.targetBasis') AND s.comparison_quantity=json_extract(m.value,'$.targetQuantity') AND s.displayed_price>0":'1';
  push(`INSERT INTO ${table} (${cols.map(c=>`"${c}"`)}) SELECT ${select} FROM ${table} s JOIN json_each(?) m ON s.product_slug=json_extract(m.value,'$.oldSlug') WHERE ${eligible} ON CONFLICT(product_slug) DO UPDATE SET ${updates}${table==='coupang_price_current'?` WHERE excluded.checked_at>${table}.checked_at OR ${table}.comparison_basis IS NOT excluded.comparison_basis OR ${table}.comparison_quantity IS NOT excluded.comparison_quantity`:''}`,[mapping]);
  push(`DELETE FROM ${table} WHERE product_slug IN (${oldSlugs})`,[mapping]);
 }
 push(`INSERT INTO product_interest_daily(day,product_slug,favorite_adds,shopping_adds,catalog_product_key) SELECT s.day,json_extract(m.value,'$.newSlug'),s.favorite_adds,s.shopping_adds,json_extract(m.value,'$.keepId') FROM product_interest_daily s JOIN json_each(?) m ON s.product_slug=json_extract(m.value,'$.oldSlug') WHERE 1 ON CONFLICT(day,product_slug) DO UPDATE SET favorite_adds=product_interest_daily.favorite_adds+excluded.favorite_adds,shopping_adds=product_interest_daily.shopping_adds+excluded.shopping_adds`,[mapping]);
 push(`DELETE FROM product_interest_daily WHERE product_slug IN (${oldSlugs})`,[mapping]);
 push(`UPDATE price_history SET product_slug=(SELECT json_extract(value,'$.newSlug') FROM json_each(?) WHERE json_extract(value,'$.oldSlug')=price_history.product_slug),catalog_product_key=(SELECT json_extract(value,'$.keepId') FROM json_each(?) WHERE json_extract(value,'$.oldSlug')=price_history.product_slug) WHERE product_slug IN (${oldSlugs})`,[mapping,mapping,mapping]);
 return result;
}
export async function handleReviewedMerge(request,env){
 if(!env.CATALOG_MERGE_TOKEN||request.headers.get('authorization')!==`Bearer ${env.CATALOG_MERGE_TOKEN}`)return reply({error:'Forbidden'},403);
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin))return reply({error:'Forbidden'},403);
 try{
  const text=await request.text();if(text.length>1024)return reply({error:'Invalid request'},400);const body=JSON.parse(text);
  if(body.migrationId!==plan.id||!['prepare','apply','verify'].includes(body.action))return reply({error:'Invalid migration'},400);
  const db=env.DB,active=(await db.prepare("SELECT value FROM catalog_state WHERE key='active'").bind().first())?.value;
  const run=await db.prepare('SELECT * FROM catalog_merge_runs WHERE id=?').bind(plan.id).first();
  if(body.action==='verify'){
   const checked=await check(db,plan.after),fk=(await db.prepare('PRAGMA foreign_key_check').bind().all()).results;
   return reply({...checked,valid:checked.valid&&fk.length===0&&active===plan.toVersion,version:active,foreignKeyErrors:fk.length,merges:plan.pairs.length,status:run?.status},checked.valid&&fk.length===0&&active===plan.toVersion?200:409);
  }
  if(run?.status==='applied'&&active===plan.toVersion)return reply({ok:true,alreadyApplied:true,version:active});
  if(active!==plan.fromVersion)return reply({error:'Source version changed'},409);
  if(body.action==='prepare'&&run?.status==='prepared')return reply({ok:true,alreadyPrepared:true});
  if(body.action==='apply'&&run?.status!=='prepared')return reply({error:'Back up before applying'},409);
  const checked=await check(db,plan.before);if(!checked.valid)return reply({error:'Source data differs',checks:checked.checks},409);
  const timestamp=new Date().toISOString();
  if(body.action==='prepare'){
   const statements=[db.prepare("INSERT INTO catalog_merge_runs(id,from_version,to_version,status,guard,created_at) VALUES(?,?,?,'prepared',CASE WHEN (SELECT value FROM catalog_state WHERE key='active')=? THEN 1 ELSE 0 END,?)").bind(plan.id,plan.fromVersion,plan.toVersion,plan.fromVersion,timestamp)];
   for(const [table,cols]of Object.entries(plan.backupColumns))statements.push(db.prepare(`INSERT INTO catalog_merge_archive(batch_id,table_name,row_key,payload) SELECT ?,?,CAST(rowid AS TEXT),${archiveObject(cols)} FROM ${table}`).bind(plan.id,table));
   await db.batch(statements);return reply({ok:true,prepared:true,backedUpTables:Object.keys(plan.backupColumns).length});
  }
  const locked=await db.prepare("SELECT product_slug FROM price_update_queue WHERE (product_slug IN (SELECT json_extract(value,'$.oldSlug') FROM json_each(?)) OR product_slug IN (SELECT json_extract(value,'$.newSlug') FROM json_each(?))) AND lock_expires_at>? LIMIT 1").bind(mapping,mapping,timestamp).first();
  if(locked)return reply({error:'Price worker is processing a reviewed product; retry after its lock expires'},409);
  const statements=[db.prepare("UPDATE catalog_merge_runs SET guard=CASE WHEN status='prepared' AND (SELECT value FROM catalog_state WHERE key='active')=? AND NOT EXISTS(SELECT 1 FROM price_update_queue WHERE (product_slug IN (SELECT json_extract(value,'$.oldSlug') FROM json_each(?)) OR product_slug IN (SELECT json_extract(value,'$.newSlug') FROM json_each(?))) AND lock_expires_at>?) THEN 1 ELSE 0 END WHERE id=?").bind(plan.fromVersion,mapping,mapping,timestamp,plan.id),...operationalStatements(db),...plan.patch.map(p=>db.prepare(p.sql).bind(...p.args)),db.prepare("UPDATE catalog_state SET value=? WHERE key='active'").bind(plan.toVersion),db.prepare("UPDATE catalog_merge_runs SET status='applied',applied_at=? WHERE id=?").bind(timestamp,plan.id)];
  await db.batch(statements);return reply({ok:true,applied:true,version:plan.toVersion,merged:plan.pairs.length});
 }catch(e){console.error('Reviewed catalog migration failed',e.message);return reply({error:'Migration not completed; transaction was rolled back'},503);}
}
