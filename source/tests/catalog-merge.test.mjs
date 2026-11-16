import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {restoreCards,restoreProducts,restoreDocument} from '../catalog/model.mjs';
const base=JSON.parse(fs.readFileSync('catalog/merge-baseline-20261025.json'));
// This suite verifies the historical merge; later category migrations have their own tests.
const after=JSON.parse(fs.readFileSync('catalog/category-baseline.json'));
const selected=JSON.parse(fs.readFileSync('catalog/merge-selection-20261025.json'));
test('only the 26 reviewed groups are merged; uncertain and tax variants remain separate',()=>{
 assert.equal(after.catalog_products.length,2311);assert.equal(restoreProducts({tables:after}).length,2306);assert.equal(restoreCards({tables:after}).length,2309);
 const retired=new Set(selected.map(x=>x.retireId));assert.deepEqual(after.catalog_products.map(r=>r[0]),base.catalog_products.filter(r=>!retired.has(r[0])).map(r=>r[0]));
 for(const id of [251,2248,259,261,267,554,556,635,652,777,1495,797,892])assert.ok(after.catalog_products.some(r=>r[0]===id));
 assert.deepEqual(after.catalog_products.filter(r=>r[5]==='duty_free'),base.catalog_products.filter(r=>r[5]==='duty_free'));
});
test('old slugs and codes resolve to their canonical product; no IDs are reissued',()=>{
 for(const {keepId,retireId} of selected){const old=base.catalog_products.find(r=>r[0]===retireId),code=base.catalog_codes.find(r=>r[1]===retireId&&r[3]===1);
  assert.equal(after.catalog_aliases.find(r=>r[0]==='legacy_slug'&&r[1]===old[1])?.[2],keepId);
  assert.deepEqual(after.catalog_codes.find(r=>r[0]===code[0]),[code[0],keepId,code[2],0]);
  assert.equal(after.catalog_codes.filter(r=>r[1]===keepId&&r[3]===1).length,1);
 }
});
test('all monthly labels, prices, dates, images and 47/10 records survive remapping',()=>{
 const slugs=new Map(selected.map(x=>[base.catalog_products.find(r=>r[0]===x.retireId)[1],base.catalog_products.find(r=>r[0]===x.keepId)[1]]));
 for(const [name] of base.catalog_documents){const a=restoreDocument({tables:after},name),b=restoreDocument({tables:base},name);assert.equal(a.items.length,b.items.length);
  assert.deepEqual(a,{...b,items:b.items.map(i=>({...i,productSlug:slugs.get(i.productSlug)||i.productSlug}))});
 }
 assert.equal(restoreDocument({tables:after},'monthly.json').items.length,47);
 assert.equal(after.catalog_discounts.filter(r=>r[0]==='2026-09').length,10);
});
test('unrelated cards and source prices are unchanged; linked monthly goods use current sale price',()=>{
 const old=restoreCards({tables:base}),cards=restoreCards({tables:after});const touched=new Set(selected.flatMap(x=>[x.keepId,x.retireId]).map(id=>base.catalog_products.find(r=>r[0]===id)[1]));
 for(const c of old)if(!touched.has(c.slug))assert.deepEqual(cards.find(x=>x.slug===c.slug),c,c.slug);
 const products=restoreProducts({tables:after}),oldProducts=new Map(restoreProducts({tables:base}).map(p=>[p.slug,p]));for(const p of products)assert.deepEqual(p,oldProducts.get(p.slug));
 for(const {keepId,retireId} of selected){const d=base.catalog_discounts.find(r=>r[0]==='2026-10'&&r[1]===retireId);if(!d)continue;
  const slug=base.catalog_products.find(r=>r[0]===keepId)[1],card=cards.find(x=>x.slug===slug);assert.equal(card.shoppingPrice,d[3]);assert.equal(card.pxPrice,d[3]);
 }
});
