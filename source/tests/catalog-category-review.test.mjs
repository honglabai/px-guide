import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {restoreProducts,restoreCards,restoreDocument,compileCatalog} from '../catalog/model.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const baseline=read('catalog/category-baseline.json'),review=read('catalog/category-review.json');
test('all 263 approved classifications preserve identity, prices, images and previous codes',async()=>{
 const mod=await import('../catalog/category-review.mjs').catch(()=>({}));assert.equal(typeof mod.applyCategoryReview,'function');
 const result=mod.applyCategoryReview(baseline,read('catalog/category-baseline-registry.json'),review.rows);assert.equal(result.changes.length,263);
 const cats=new Map(result.tables.catalog_categories.map(r=>[r[0],r])),next=new Map(result.tables.catalog_products.map(r=>[r[0],r]));
 const approved=new Set(review.rows.filter(r=>r.status!=='추가 확인').map(r=>r.id));
 for(const p of baseline.catalog_products){const n=next.get(p[0]);assert.deepEqual(n.filter((_,i)=>i!==4),p.filter((_,i)=>i!==4));if(!approved.has(p[0]))assert.deepEqual(n,p);}
 for(const r of review.rows.filter(r=>approved.has(r.id))){const leaf=cats.get(next.get(r.id)[4]),middle=cats.get(leaf[1]),major=cats.get(middle[1]);assert.deepEqual([major[4],middle[4],leaf[4]],r.proposed,r.name);}
 for(const field of ['catalog_assets','catalog_prices','catalog_discounts','catalog_documents','catalog_brands','catalog_aliases'])assert.deepEqual(result.tables[field],baseline[field]);
 const strip=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['category','subcategory','productGroup'].includes(k)));
 for(const restore of [restoreProducts,restoreCards])assert.deepEqual(restore({tables:result.tables}).map(strip),restore({tables:baseline}).map(strip));
 for(const old of baseline.catalog_codes){const current=result.tables.catalog_codes.find(r=>r[0]===old[0]);assert.equal(current[1],old[1]);}
 for(const p of result.tables.catalog_products){const current=result.tables.catalog_codes.filter(r=>r[1]===p[0]&&r[3]===1);assert.equal(current.length,1);assert.equal(current[0][0].slice(0,6),cats.get(p[4])[3]);}
 assert.equal(new Set(result.tables.catalog_codes.map(r=>r[0])).size,result.tables.catalog_codes.length);
 const twice=mod.applyCategoryReview(result.tables,result.registry,review.rows);assert.deepEqual(twice.tables,result.tables);assert.deepEqual(twice.registry,result.registry);
 const rebuilt=compileCatalog({products:restoreProducts({tables:result.tables}),cards:restoreCards({tables:result.tables}),documents:Object.fromEntries(result.tables.catalog_documents.map(([name])=>[name,restoreDocument({tables:result.tables},name)]))},result.registry);
 for(const p of result.tables.catalog_products)assert.equal(rebuilt.registry[p[1]].code,result.registry[p[1]].code,p[1]);
});
