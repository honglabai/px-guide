import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('catalog compiler preserves every original source, card, monthly document and numeric identity',async()=>{
 const {compileCatalog,restoreDocument,restoreProducts,restoreCards,definitions}=await import('../catalog/model.mjs');
 const products=JSON.parse(fs.readFileSync('content/products.json'));
 const cards=JSON.parse(fs.readFileSync('dist/client/favorites-data.json'));
 const documents=Object.fromEntries(['monthly.json','monthly-archive/2026-09.json','monthly-archive/2026-10.json'].map(f=>[f,JSON.parse(fs.readFileSync('content/'+f))]));
 const c=compileCatalog({products,cards,documents});
 assert.deepEqual(restoreProducts(c),products);assert.deepEqual(restoreCards(c),cards);
 for(const [k,v]of Object.entries(documents))assert.deepEqual(restoreDocument(c,k),v);
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('catalog/schema.sql','utf8'));
 for(const [table,def]of Object.entries(definitions))for(const r of c.tables[table])db.prepare(`INSERT INTO ${table} (${def.join(',')}) VALUES (${def.map(()=>'?').join(',')})`).run(...r);
 assert.equal(db.prepare('SELECT count(*) n FROM catalog_products').get().n,2311);
 assert.equal(db.prepare('SELECT count(*) n FROM catalog_codes WHERE is_current=1').get().n,2311);
 assert.equal(db.prepare('SELECT count(*) n FROM catalog_products p JOIN catalog_codes c ON p.id=c.product_id JOIN catalog_categories k ON k.id=p.category_id WHERE c.is_current=1 AND substr(c.code,1,6)!=k.code').get().n,0);
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.throws(()=>db.prepare('UPDATE catalog_codes SET code=? WHERE product_id=1').run('10101000001'));
 assert.ok(c.tables.catalog_codes.every(r=>/^\d{12}$/.test(r[0])&&r[0][0]==='0'));
 const again=compileCatalog({products:[...products].reverse(),cards,documents},c.registry);
 assert.deepEqual(again.registry,c.registry);
 const rebuilt=compileCatalog({products,cards,documents},c.registry);assert.deepEqual(rebuilt,c);
});
