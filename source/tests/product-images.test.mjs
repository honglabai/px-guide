import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../worker/index.js';
import {productCard} from '../product-ui.mjs';
const products=JSON.parse(fs.readFileSync('dist/client/favorites-data.json'));
test('product cards use existing responsive assets with decoding and reserved dimensions',()=>{
 for(const p of products.filter(p=>p.imageThumbUrl)) {
  assert.ok(fs.existsSync('dist/client'+p.imageThumbUrl),p.slug);
  assert.ok(fs.existsSync('dist/client'+p.imageUrl),p.slug);
  assert.ok(fs.statSync('dist/client'+p.imageUrl).size>12,p.slug);
  assert.ok(p.imageThumbWidth>0&&p.imageThumbHeight>0,p.slug);
  const card=productCard(p);
  assert.ok(card.includes('src="'+p.imageThumbUrl+'"'),p.slug);
  if(p.imageSrcSet)assert.match(card,/srcset=".+?" sizes=".+?"/);
  assert.match(card,/decoding="async"/);
 }
 for(const slug of ['mychew-pink-lychee','oreo-white','catalog-36722','catalog-2692','kozel-dark-500']) {
  const p=products.find(p=>p.slug===slug);
  assert.ok(Math.max(p.imageWidth,p.imageHeight)>=320,slug);
  assert.match(fs.readFileSync('dist/client/products/'+slug+'/index.html','utf8'),/images\/products-optimized\//);
 }
});
test('immutable image responses cache successfully while missing images do not',async()=>{
 for(const status of [200,404]) {
  const result=await worker.fetch(new Request('https://example.com/images/products-optimized/asset.webp'),{ASSETS:{fetch:async()=>new Response('image',{status})}});
  assert.equal(result.status,status);
  assert.equal(result.headers.get('Cache-Control'),status===200?'public, max-age=31536000, immutable':null);
 }
});
