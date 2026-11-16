import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {definitions} from '../catalog/model.mjs';
import {restoreProducts} from '../catalog/model.mjs';
import {comparisonBasisKey} from '../price/comparison-basis.mjs';
const baseline=JSON.parse(fs.readFileSync('catalog/merge-baseline-20261025.json'));
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8').replaceAll('--> statement-breakpoint',''));
 for(const [table,cols]of Object.entries(definitions))for(const row of baseline[table])sql.prepare(`INSERT INTO ${table} (${cols}) VALUES (${cols.map(()=>'?')})`).run(...row);
 sql.prepare("INSERT INTO catalog_state VALUES('active','0c6c9648e146a7298a622e24')").run();
 const db={prepare(q){return{bind(...a){assert.ok(a.length<=100);assert.ok(Buffer.byteLength(q)<=100000);const s=sql.prepare(q);return{q,a,all:async()=>({results:s.all(...a)}),first:async()=>s.get(...a)||null,run:async()=>s.run(...a)};}}},async batch(stmts){sql.exec('BEGIN');try{const out=stmts.map(x=>sql.prepare(x.q).run(...x.a));sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {sql,env:{DB:db,CATALOG_MERGE_TOKEN:'merge-test-key'}};
}
async function call(f,action,token='merge-test-key'){
 const module=await import('../catalog/merge-runtime.mjs').catch(()=>({}));assert.equal(typeof module.handleReviewedMerge,'function','reviewed migration handler must exist');
 return module.handleReviewedMerge(new Request('https://example.test/api/catalog/admin/merge-reviewed',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({migrationId:'reviewed-merge-20261025',action})}),f.env);
}
test('migration is authenticated, backs up first, preserves FK references and is idempotent',async()=>{
 const f=fixture();assert.equal((await call(f,'prepare','wrong')).status,403);assert.equal((await call(f,'apply')).status,409);
 f.sql.prepare("INSERT INTO product_interest_daily(day,product_slug,favorite_adds,shopping_adds) VALUES('2026-10-25','catalog-34920',2,1),('2026-10-25','catalog-34922',3,4)").run();
 f.sql.prepare("INSERT INTO price_update_queue(product_slug,status,priority,created_at,updated_at) VALUES('catalog-34920','PENDING',1,'2026-10-25','2026-10-25'),('catalog-34922','PENDING',5,'2026-10-25','2026-10-25')").run();
 f.sql.prepare("INSERT INTO price_history(id,product_slug,entry_kind,attempted_at,status,created_at) VALUES(1,'catalog-34922','OBSERVATION','2026-10-25','REJECT','2026-10-25')").run();
 assert.equal((await call(f,'prepare')).status,200);const archives=f.sql.prepare('SELECT count(*) n FROM catalog_merge_archive').get().n;assert.ok(archives>20000);assert.equal((await call(f,'prepare')).status,200);assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_merge_archive').get().n,archives);
 const applied=await call(f,'apply');assert.equal(applied.status,200,await applied.text());assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_products').get().n,2311);
 assert.deepEqual({...f.sql.prepare("SELECT favorite_adds,shopping_adds,catalog_product_key FROM product_interest_daily WHERE product_slug='catalog-34920'").get()},{favorite_adds:5,shopping_adds:5,catalog_product_key:798});
 assert.equal(f.sql.prepare("SELECT priority FROM price_update_queue WHERE product_slug='catalog-34920'").get().priority,5);
 assert.deepEqual({...f.sql.prepare('SELECT product_slug,catalog_product_key FROM price_history WHERE id=1').get()},{product_slug:'catalog-34920',catalog_product_key:798});
 assert.equal(f.sql.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal((await call(f,'apply')).status,200);
 const verified=await call(f,'verify');assert.equal(verified.status,200,await verified.text());
 assert.equal(f.sql.prepare("SELECT count(*) n FROM catalog_discounts WHERE month='2026-10'").get().n,47);
 assert.equal(JSON.parse(f.sql.prepare("SELECT payload FROM catalog_merge_archive WHERE table_name='price_history'").get().payload).product_slug,'catalog-34922');
});
test('a failure in the transaction keeps the original DB active and all merges unapplied',async()=>{
 const f=fixture();assert.equal((await call(f,'prepare')).status,200);
 f.sql.exec("CREATE TRIGGER forced_failure BEFORE DELETE ON catalog_products WHEN OLD.id=800 BEGIN SELECT RAISE(ABORT,'forced failure'); END");
 assert.equal((await call(f,'apply')).status,503);assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_products').get().n,2337);
 assert.equal(f.sql.prepare("SELECT value FROM catalog_state WHERE key='active'").get().value,'0c6c9648e146a7298a622e24');
 assert.equal(f.sql.prepare("SELECT product_id FROM catalog_aliases WHERE identifier='catalog-34922' AND namespace='legacy_slug'").get().product_id,800);
 assert.equal(f.sql.prepare('SELECT status FROM catalog_merge_runs').get().status,'prepared');
});
test('an incompatible newer retired current cannot replace a valid canonical current',async()=>{
 const f=fixture(),old=restoreProducts({tables:baseline}).find(p=>p.slug==='catalog-30530'),target=JSON.parse(fs.readFileSync('dist/client/price-catalog.json')).find(p=>p.slug==='catalog-35166');
 assert.notEqual(comparisonBasisKey(old),comparisonBasisKey(target));
 const insert=f.sql.prepare('INSERT INTO coupang_price_current(product_slug,normalized_name,normalized_spec,normalized_quantity,displayed_price,comparison_quantity,comparison_basis,source_url,match_score,checked_at,last_history_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
 insert.run(old.slug,old.name,old.spec,'1',15000,old.comparisonQuantity,comparisonBasisKey(old),'https://www.coupang.com/vp/products/1',100,'2026-10-25T01:00:00Z',1);
 insert.run(target.slug,target.name,target.spec,'1',16000,target.comparisonQuantity,comparisonBasisKey(target),'https://www.coupang.com/vp/products/2',100,'2026-10-24T01:00:00Z',2);
 assert.equal((await call(f,'prepare')).status,200);assert.equal((await call(f,'apply')).status,200);
 const current=f.sql.prepare('SELECT displayed_price,comparison_basis FROM coupang_price_current WHERE product_slug=?').get(target.slug);assert.equal(current.displayed_price,16000);assert.equal(current.comparison_basis,comparisonBasisKey(target));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_merge_archive WHERE table_name=\'coupang_price_current\'').get().n,2);
});
test('a price lock acquired between preflight and the transaction aborts the merge',async()=>{
 const f=fixture();assert.equal((await call(f,'prepare')).status,200);const originalBatch=f.env.DB.batch;
 f.env.DB.batch=async statements=>{f.sql.prepare("INSERT INTO price_update_queue(product_slug,status,created_at,updated_at,lock_expires_at) VALUES('catalog-34922','PROCESSING','2026-10-25','2026-10-25','2099-01-01T00:00:00Z')").run();return originalBatch(statements);};
 const r=await call(f,'apply');assert.ok(r.status===409||r.status===503);assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_products').get().n,2337);assert.equal(f.sql.prepare("SELECT value FROM catalog_state WHERE key='active'").get().value,'0c6c9648e146a7298a622e24');
});
