import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import aliases from '../catalog/product-aliases.json' with {type:'json'};
test('all former product and monthly detail URLs redirect to a canonical page',async()=>{
 for(const [old,canonical]of Object.entries(aliases))for(const path of [`/products/${old}/`,`/monthly/2026-10/items/${old}/`]){
  const r=await worker.fetch(new Request('https://example.test'+path+'?from=saved'),{ASSETS:{fetch:async()=>new Response('not found',{status:404})}});assert.equal(r.status,301,path);assert.equal(r.headers.get('location'),`https://example.test/products/${canonical}/?from=saved`);
 }
});
