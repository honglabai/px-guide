import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const key='px-guide-favorites-v1',cart='px-guide-cart-v1',shop='px-guide-shopping-v1';
const source=fs.readFileSync('dist/client/product-aliases.js','utf8');
function run(storage,failOnce=false){let failed=false;const window={addEventListener(){}};vm.runInNewContext(source,{window,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(failOnce&&k===cart&&!failed){failed=true;throw Error('quota');}storage.set(k,v);},removeItem:k=>storage.delete(k)}});return window;}
test('default quantity survives merging favorites when no cart key existed',()=>{
 const storage=new Map([[key,JSON.stringify(['catalog-34922','catalog-34920'])]]);run(storage);assert.deepEqual(JSON.parse(storage.get(key)),['catalog-34920']);assert.equal(JSON.parse(storage.get(cart)||'{}')['catalog-34920']?.qty,2);
 const first=storage.get(cart);run(storage);assert.equal(storage.get(cart),first);
});
test('failed persistent migration restores old keys and preserves original backup',()=>{
 const old=JSON.stringify(['catalog-34922','catalog-34920']),storage=new Map([[key,old]]);run(storage,true);assert.equal(storage.get(key),old);assert.equal(storage.has(cart),false);assert.equal(storage.has(shop),false);assert.equal(JSON.parse(storage.get('px-guide-merge-backup-20261025'))[0],old);
});
