import plan from './price-file-plan.json' with {type:'json'};
import {definitions} from './model.mjs';
const reply=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const digest=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function check(db,expected){const checks={};for(const [t,cols]of Object.entries(definitions)){const rows=(await db.prepare(`SELECT ${cols.join(',')} FROM ${t}`).bind().all()).results.map(r=>cols.map(c=>r[c]));checks[t]={count:rows.length,hash:await digest(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort()))};}return{valid:Object.entries(expected).every(([t,x])=>x.count===checks[t].count&&x.hash===checks[t].hash),checks};}
export async function handlePriceFileImport(request,env){
 if(!env.CATALOG_PRICE_FILE_TOKEN||request.headers.get('authorization')!==`Bearer ${env.CATALOG_PRICE_FILE_TOKEN}`)return reply({error:'Forbidden'},403);
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin))return reply({error:'Forbidden'},403);
 try{
  const text=await request.text();if(text.length>1024)return reply({error:'Invalid request'},400);const body=JSON.parse(text);if(body.migrationId!==plan.id||!['prepare','apply','verify'].includes(body.action))return reply({error:'Invalid migration'},400);
  const db=env.DB,active=(await db.prepare("SELECT value FROM catalog_state WHERE key='active'").bind().first())?.value,run=await db.prepare('SELECT * FROM catalog_merge_runs WHERE id=?').bind(plan.id).first();
  if(body.action==='verify'){const checked=await check(db,plan.after),fk=(await db.prepare('PRAGMA foreign_key_check').bind().all()).results,valid=checked.valid&&fk.length===0&&active===plan.toVersion;return reply({...checked,valid,version:active,foreignKeyErrors:fk.length,updatedPrices:plan.count,status:run?.status},valid?200:409);}
  if(run?.status==='applied'&&active===plan.toVersion)return reply({ok:true,alreadyApplied:true,version:active});if(active!==plan.fromVersion)return reply({error:'Source version changed'},409);if(body.action==='apply'&&run?.status!=='prepared')return reply({error:'Back up before applying'},409);
  const checked=await check(db,plan.before);if(!checked.valid)return reply({error:'Source data differs',checks:checked.checks},409);
  if(body.action==='prepare'){
   if(run?.status==='prepared')return reply({ok:true,alreadyPrepared:true});
   const statements=[db.prepare("INSERT INTO catalog_merge_runs(id,from_version,to_version,status,guard,created_at) VALUES(?,?,?,'prepared',CASE WHEN (SELECT value FROM catalog_state WHERE key='active')=? THEN 1 ELSE 0 END,?)").bind(plan.id,plan.fromVersion,plan.toVersion,plan.fromVersion,new Date().toISOString())];
   for(const t of ['catalog_prices','catalog_records']){const cols=definitions[t];statements.push(db.prepare(`INSERT INTO catalog_merge_archive(batch_id,table_name,row_key,payload) SELECT ?,?,CAST(rowid AS TEXT),json_object(${cols.flatMap(c=>[`'${c}'`,`"${c}"`]).join(',')}) FROM ${t} WHERE product_id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND kind=?`).bind(plan.id,t,JSON.stringify(plan.changed),t==='catalog_prices'?'officialPrice':'card'));}await db.batch(statements);return reply({ok:true,prepared:true,backedUpTables:2});
  }
  if(await db.prepare("SELECT 1 FROM coupang_price_current WHERE product_slug IN (SELECT json_extract(value,'$.slug') FROM json_each(?)) LIMIT 1").bind(JSON.stringify(plan.changed)).first())return reply({error:'Verified current prices require a separate review'},409);
  await db.batch([db.prepare("UPDATE catalog_merge_runs SET guard=CASE WHEN status='prepared' AND (SELECT value FROM catalog_state WHERE key='active')=? AND NOT EXISTS(SELECT 1 FROM coupang_price_current WHERE product_slug IN (SELECT json_extract(value,'$.slug') FROM json_each(?))) THEN 1 ELSE 0 END WHERE id=?").bind(plan.fromVersion,JSON.stringify(plan.changed),plan.id),...plan.patch.map(p=>db.prepare(p.sql).bind(...p.args)),db.prepare("UPDATE catalog_state SET value=? WHERE key='active'").bind(plan.toVersion),db.prepare("UPDATE catalog_merge_runs SET status='applied',applied_at=? WHERE id=?").bind(new Date().toISOString(),plan.id)]);return reply({ok:true,applied:true,version:plan.toVersion,updatedPrices:plan.count});
 }catch(e){console.error('Reviewed price import failed',e.message);return reply({error:'Migration not completed; transaction was rolled back'},503);}
}
