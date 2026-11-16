import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('an already loaded price index does not repeatedly render itself',async()=>{let events=0;const window={pxCatalogData:{}},document={querySelectorAll:()=>[],dispatchEvent:()=>{events++;if(events<10)window.pxLoadPrices(['one']);}};vm.runInNewContext(fs.readFileSync('price/public-runtime.js','utf8').replace(/^import[^\n]+\n/,''),{window,document,location:{pathname:'/products/'},Event,fetchPriceIndex:async()=>new Map(),fetchCurrentPrices:async()=>new Map(),applyVisiblePrices:()=>{}});await new Promise(r=>setImmediate(r));assert.ok(events<=2,`render loop: ${events}`);});
