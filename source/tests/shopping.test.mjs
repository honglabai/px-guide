import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reviewMonth } from '../monthly-verification.mjs';

test('retain all 47 October records without inventing verified dates',()=>{
 const m=reviewMonth(JSON.parse(fs.readFileSync('content/monthly.json')));
 assert.equal(m.items.length,47);
 assert.equal(m.items.filter(i=>i.verification?.status==='verified').length,0);
});
test('separate shopping route and header shortcut are published',()=>{
 const html=fs.existsSync('dist/client/shopping/index.html')?fs.readFileSync('dist/client/shopping/index.html','utf8'):'';
 assert.match(html,/id="shopping-list"/);
 assert.match(html,/data-shopping-count/);
});
test('every imported reference record has price and composition status',()=>{
 const products=JSON.parse(fs.readFileSync('content/products.json'));
 const imported=products.filter(p=>p.catalogId);
 assert.equal(new Set(imported.map(p=>p.catalogId)).size,2228);
 const tables=JSON.parse(fs.readFileSync('catalog/database.json'));assert.equal(tables.catalog_aliases.filter(r=>r[0]==='source_catalog').length,2240);
 assert.ok(imported.every(p=>p.pxPrice>0&&p.officialPrice>0&&p.priceCheckedAt==='2026-09-29'));
 assert.ok(imported.some(p=>p.comparisonKind==='unverifiedBundle'));
});
