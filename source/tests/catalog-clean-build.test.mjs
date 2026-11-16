import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {materialize,buildAssets} from '../scripts/catalog-build.mjs';
import {restoreCards} from '../catalog/model.mjs';
test('generated compatibility documents materialize in a clean checkout',()=>{const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'px-catalog-clean-'));try{fs.mkdirSync(path.join(dir,'catalog'));fs.copyFileSync('catalog/database.json',path.join(dir,'catalog/database.json'));fs.copyFileSync('catalog/registry.json',path.join(dir,'catalog/registry.json'));process.chdir(dir);materialize();assert.equal(JSON.parse(fs.readFileSync('content/products.json')).length,2306);assert.equal(JSON.parse(fs.readFileSync('content/monthly-archive/2026-10.json')).items.length,47);}finally{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});}});
test('publishing rejects a generated catalog that silently drops trailing products',()=>{const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'px-catalog-count-'));try{fs.mkdirSync(path.join(dir,'catalog'));fs.mkdirSync(path.join(dir,'dist/client'),{recursive:true});fs.copyFileSync('catalog/database.json',path.join(dir,'catalog/database.json'));fs.copyFileSync('catalog/registry.json',path.join(dir,'catalog/registry.json'));fs.copyFileSync('product-data-client.js',path.join(dir,'product-data-client.js'));const tables=JSON.parse(fs.readFileSync('catalog/database.json'));fs.writeFileSync(path.join(dir,'dist/client/favorites-data.json'),JSON.stringify(restoreCards({tables}).slice(0,-1)));process.chdir(dir);assert.throws(()=>buildAssets(),/card count/);}finally{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});}});
