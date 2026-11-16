import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('retired slug lookups hydrate canonical products while preserving legacy list line keys',async()=>{
 const calls=[],window={pxResolveProductSlug:s=>s==='old'?'one':s};
 vm.runInNewContext(fs.readFileSync('product-data-client.js','utf8'),{window,location:{search:''},URLSearchParams,fetch:async path=>{calls.push(path);return{ok:true,json:async()=>path==='/catalog/manifest.json'?{version:'v1'}:{version:'v1',products:[{slug:'one',name:'상품',pxPrice:100,href:'/products/one/'}]}};}});
 const rows=await window.pxCatalogData.products(['old','one']);assert.deepEqual(Array.from(rows,p=>p.slug),['old','one']);assert.equal(rows[0].canonicalSlug,'one');assert.equal(rows[0].href,'/products/one/');assert.ok(calls.at(-1).endsWith('ids=one'));
});
test('shared loader deduplicates batch requests and includes complete shared lists',async()=>{
 const calls=[],window={},rows=[{slug:'one',name:'상품1'},{slug:'two',name:'상품2'}];
 vm.runInNewContext(fs.readFileSync('product-data-client.js','utf8'),{window,location:{search:'?list='+Buffer.from(JSON.stringify([['two',2]])).toString('base64')},atob:s=>Buffer.from(s,'base64').toString(),URLSearchParams,fetch:async path=>{calls.push(path);if(path==='/catalog/manifest.json')return {ok:true,json:async()=>({version:'v1',index:'/index-v1.json'})};if(path==='/index-v1.json')return {ok:true,json:async()=>({version:'v1',groups:{식품:2},products:rows})};return {ok:true,json:async()=>({version:'v1',products:rows.filter(r=>new URL(path,'https://example.test').searchParams.get('ids').split(',').includes(r.slug))})};}});
 const a=window.pxCatalogData;await Promise.all([a.products(['one']),a.products(['one'])]);assert.equal(calls.filter(p=>p.startsWith('/api/catalog/')).length,1);assert.equal((await a.list(['one'])).length,2);assert.ok(!calls.includes('/index-v1.json'),'lists should not load the full index');assert.equal(await a.groupCount('식품'),2);assert.equal((await a.products([])).length,0);assert.ok(!calls.includes('/favorites-data.json'));
});
test('catalog falls back to original data on version mismatch without altering prices',async()=>{const window={},rows=[{slug:'one',name:'상품1',pxPrice:450,officialPrice:960}];vm.runInNewContext(fs.readFileSync('product-data-client.js','utf8'),{window,location:{search:''},URLSearchParams,fetch:async p=>p==='/favorites-data.json'?{ok:true,json:async()=>rows}:{ok:false}});assert.deepEqual(JSON.parse(JSON.stringify(await window.pxCatalogData.products(['one']))),rows);});
