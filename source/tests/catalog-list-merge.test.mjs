import test from 'node:test';
import assert from 'node:assert/strict';
const helpers=()=>import('../catalog/list-merge.mjs').catch(()=>({}));
test('merged saved lists combine quantities without losing completion states',async()=>{
 const m=await helpers();assert.equal(typeof m.mergeSavedLists,'function');
 const result=m.mergeSavedLists(['old','keep'],{old:{qty:2,checked:false},keep:{qty:3,checked:false}},{old:{qty:2,checked:true},keep:{qty:3,checked:false}},{old:'keep'});
 assert.deepEqual(result.saved,['keep']);assert.deepEqual(result.cart,{keep:{qty:5,checked:false}});
 assert.deepEqual(result.shopping,{old:{qty:2,checked:true},keep:{qty:3,checked:false}});assert.equal(result.retainedSeparate,true);
 assert.deepEqual(m.mergeSavedLists(result.saved,result.cart,result.shopping,{old:'keep'}),result);
});
test('overflow stays as separate lines; ordinary same-state rows coalesce; unrelated rows are unchanged',async()=>{
 const m=await helpers();assert.equal(typeof m.mergeSavedLists,'function');
 const result=m.mergeSavedLists(['old','keep','other'],{old:{qty:99,checked:false},keep:{qty:5,checked:false}},{old:{qty:2,checked:true},keep:{qty:3,checked:true}},{old:'keep'});
 assert.deepEqual(result.saved,['old','keep','other']);assert.equal(result.cart.old.qty+result.cart.keep.qty,104);assert.deepEqual(result.shopping,{keep:{qty:5,checked:true}});
 assert.equal(m.resolveSlug('pxpick-old',{old:'keep'}),'keep');
});
