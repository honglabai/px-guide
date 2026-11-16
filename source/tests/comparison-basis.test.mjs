import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveComparisonBasis, comparisonBasisKey, comparisonUnitPrice, validateObservedQuantity, comparisonChangeTier } from '../price/comparison-basis.mjs';

test('derives outer bundle targets without multiplying an existing PX inner pack', () => {
  assert.deepEqual(deriveComparisonBasis({name:'로투스 비스코프 125g',spec:'125g',comparisonKind:'sameBundle',comparisonQuantity:20}), {eligible:true,comparisonQuantity:20,targetQuantity:'20개',reason:null});
  assert.deepEqual(deriveComparisonBasis({name:'제주삼다수 그린 500ml×20병',spec:'500ml*20pet',comparisonKind:'sameBundle',comparisonQuantity:1}), {eligible:true,comparisonQuantity:1,targetQuantity:'20병',reason:null});
  assert.equal(deriveComparisonBasis({name:'던킨 아메리카노 400ml',comparisonKind:'sameBundle',comparisonQuantity:24}).targetQuantity,'24개');
});
test('rejects nested, unverified, and missing basis', () => {
  for (const product of [
    {name:'130입',comparisonKind:'sameBundle',comparisonQuantity:2},
    {name:'125g',comparisonKind:'unverifiedBundle',comparisonQuantity:20},
    {name:'125g',comparisonKind:'sameBundle'},
    {name:'사탕 5g*20ea',comparisonKind:'sameBundle',comparisonQuantity:5},
    {name:'비타민 30정',comparisonKind:'sameBundle',comparisonQuantity:2},
    {name:'마스크 10매',comparisonKind:'sameBundle',comparisonQuantity:3},
    {name:'커피 12포',comparisonKind:'sameBundle',comparisonQuantity:4},
  ]) assert.equal(deriveComparisonBasis(product).eligible,false);
});
test('requires visible, noncontradictory observed count even for q1', () => {
  const basis=deriveComparisonBasis({name:'125g',comparisonKind:'sameBundle',comparisonQuantity:1});
  assert.equal(validateObservedQuantity(basis,{title:'125g',quantity:null}).valid,false);
  assert.equal(validateObservedQuantity(basis,{title:'125g 1개',quantity:'2개'}).valid,false);
  assert.equal(validateObservedQuantity(basis,{title:'125g 1개',quantity:'1개'}).valid,true);
  assert.equal(comparisonUnitPrice(25950,20),1297.5);
});
test('visible count unit must match the documented PX sale unit', () => {
 const basis=deriveComparisonBasis({name:'제주삼다수 500ml×20병',comparisonKind:'sameBundle',comparisonQuantity:1});
 assert.equal(validateObservedQuantity(basis,{title:'삼다수 500ml 20병',quantity:'20병'}).valid,true);
 assert.equal(validateObservedQuantity(basis,{title:'삼다수 500ml 20개',quantity:'20개'}).valid,false);
});
test('a verified name policy change invalidates a previously accepted comparison basis',()=>{
 const product={name:'브랜드 상품 125g',spec:'125g',comparisonKind:'sameBundle',comparisonQuantity:20};
 assert.notEqual(comparisonBasisKey(product),comparisonBasisKey({...product,comparisonAliases:['별칭 상품']}));
});
test('compares raw bundle changes at exact integer percent boundaries', () => {
  assert.equal(comparisonChangeTier(1200,1000),'WITHIN_20');
  assert.equal(comparisonChangeTier(1201,1000),'RECHECK');
  assert.equal(comparisonChangeTier(1400,1000),'RECHECK');
  assert.equal(comparisonChangeTier(1401,1000),'OVER_40');
  assert.equal(comparisonChangeTier(9007199254740991,7505999378950826),'WITHIN_20');
});
