const countPattern = /(?:[×x*]\s*)?(\d+)\s*(개|입|팩|병|캔|봉|묶음|정|매|포|pack|pet|ea)(?![a-z])/gi;
const label = unit => unit.toLowerCase() === 'pet' ? '병' : unit.toLowerCase() === 'pack' ? '팩' : unit;
const counts = value => [...String(value ?? '').normalize('NFKC').matchAll(countPattern)].map(match => ({count:Number(match[1]),unit:label(match[2])}));
const uniqueCounts = fields => [...new Set(fields.flatMap(counts).map(value => value.count))];

export function comparisonBasisKey(product) {
  const basis=deriveComparisonBasis(product);
  if (!basis.eligible) return null;
  const fields=[product.name,product.spec,product.quantity,product.option].map(value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' '));
  const aliases=Array.isArray(product.comparisonAliases)?product.comparisonAliases.map(value=>String(value).normalize('NFKC').trim().toLowerCase()):[];
  return JSON.stringify([...fields,basis.targetQuantity,basis.comparisonQuantity,...(aliases.length?[aliases]:[])]);
}

export function ordinaryPriceCondition(value) {
  return typeof value === 'string' && /일반|normal/i.test(value) && !/쿠폰|와우|wow|카드|회원|로그인|조건|할인/i.test(value);
}

export function deriveComparisonBasis(product) {
  const q = product?.comparisonQuantity;
  if (product?.comparisonKind !== 'sameBundle') return {eligible:false,comparisonQuantity:null,targetQuantity:null,reason:'UNVERIFIED_BUNDLE'};
  if (!Number.isSafeInteger(q) || q <= 0) return {eligible:false,comparisonQuantity:null,targetQuantity:null,reason:'INVALID_COMPARISON_QUANTITY'};
  const fields = [product.name,product.spec,product.quantity,product.option];
  const found = fields.flatMap(counts);
  const distinct = uniqueCounts(fields);
  if (distinct.length > 1 || found.some(value=>!Number.isSafeInteger(value.count)||value.count<=0)) return {eligible:false,comparisonQuantity:null,targetQuantity:null,reason:'CONFLICTING_INNER_QUANTITY'};
  if (distinct.length && q > 1) return {eligible:false,comparisonQuantity:null,targetQuantity:null,reason:'NESTED_BUNDLE'};
  const targetQuantity = distinct.length ? `${distinct[0]}${found[0].unit}` : `${q}개`;
  return {eligible:true,comparisonQuantity:q,targetQuantity,reason:null};
}

export function validateObservedQuantity(basis, observation) {
  if (!basis?.eligible) return {valid:false,reason:'INELIGIBLE_BASIS'};
  const expected = Number.parseInt(basis.targetQuantity,10);
  const titleCounts = uniqueCounts([observation?.title]);
  const allCounts = uniqueCounts([observation?.title,observation?.quantity,observation?.option]);
  if (!titleCounts.length || !allCounts.length) return {valid:false,reason:'QUANTITY_UNVERIFIED'};
  if (allCounts.length !== 1 || allCounts[0] !== expected) return {valid:false,reason:'QUANTITY_MISMATCH'};
  const expectedUnit=counts(basis.targetQuantity)[0]?.unit;
  const observedUnits=[...new Set([observation?.title,observation?.quantity,observation?.option].flatMap(value=>counts(value).map(item=>item.unit)))];
  if(!expectedUnit||observedUnits.length!==1||observedUnits[0]!==expectedUnit)return {valid:false,reason:'QUANTITY_MISMATCH'};
  return {valid:true,reason:null};
}

export function comparisonUnitPrice(displayedPrice,q) {
  return Number.isSafeInteger(displayedPrice) && displayedPrice>0 && Number.isSafeInteger(q) && q>0 ? displayedPrice/q : null;
}

export function comparisonChangeTier(displayedPrice,baseline) {
  if (!Number.isSafeInteger(displayedPrice) || displayedPrice<=0 || !Number.isSafeInteger(baseline) || baseline<=0) return null;
  const change=BigInt(Math.abs(displayedPrice-baseline))*100n;
  const previous=BigInt(baseline);
  if (change<=previous*20n) return 'WITHIN_20';
  return change>previous*40n ? 'OVER_40' : 'RECHECK';
}
