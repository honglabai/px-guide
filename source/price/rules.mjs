import { comparisonChangeTier } from './comparison-basis.mjs';
const normalize = (value) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/[·.,_\-]/g, '');
const normalizeName = (value) => normalize(String(value ?? '')
  .replace(/\d+(?:\.\d+)?\s*(?:kg|g|ml|l|㎖|ℓ)/gi, '')
  .replace(/(?:[x×*]\s*)?\d+\s*(?:개|입|팩|병|캔|봉|묶음|정|매|포|pack|pet|ea)/gi, ''));
export const comparisonNameCore = normalizeName;

function perItemUnit(units, counts) {
  if (units.length <= 1) return { unit: units[0] ?? null, conflict: false };
  if (units.length !== 2 || counts.length !== 1 || counts[0] <= 1) return { unit: null, conflict: true };
  const values = units.map((unit) => {
    const [kind, amount] = unit.split(':');
    return { kind, amount: Number(amount) };
  }).sort((a, b) => a.amount - b.amount);
  const computedTotal = values[0].amount * counts[0];
  const roundingTolerance = Number.EPSILON * Math.max(computedTotal, values[1].amount) * 4;
  if (values[0].kind !== values[1].kind || Math.abs(computedTotal - values[1].amount) > roundingTolerance) {
    return { unit: null, conflict: true };
  }
  return { unit: `${values[0].kind}:${values[0].amount}`, conflict: false };
}

function dimensions(item) {
  const fields = ['name', 'spec', 'quantity', 'option'].map((field) => String(item?.[field] ?? '').normalize('NFKC').toLowerCase());
  const units = fields.flatMap((field) => [...field.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|㎖|ℓ)(?![a-z])/g)].map((match) => {
    const unit = match[2] === '㎖' ? 'ml' : match[2] === 'ℓ' ? 'l' : match[2];
    return `${unit === 'kg' || unit === 'g' ? 'mass' : 'volume'}:${Number(match[1]) * (unit === 'kg' || unit === 'l' ? 1000 : 1)}`;
  }));
  const counts = fields.flatMap((field) => [...field.matchAll(/(?:[x×*]\s*)?(\d+)\s*(?:개|입|팩|병|캔|봉|묶음|정|매|포|pack|pet|ea)/g)].map((match) => Number(match[1])));
  const distinctUnits = [...new Set(units)];
  const distinctCounts = [...new Set(counts)];
  const resolvedUnit = perItemUnit(distinctUnits, distinctCounts);
  return {
    unit: resolvedUnit.unit,
    count: distinctCounts[0] ?? null,
    unitConflict: resolvedUnit.conflict,
    countConflict: distinctCounts.length > 1,
  };
}

export function matchCandidate(product, candidate) {
  const reasons = [];
  let score = 0;
  let hardMismatch = false;
  const candidateName = normalizeName(candidate?.name);
  const productBrand=normalize(product?.brand);
  const matchedBrand=productBrand&&normalize(candidate?.name).includes(productBrand)?product.brand:undefined;
  const aliases=Array.isArray(product?.comparisonAliases)?product.comparisonAliases.filter(value=>typeof value==='string'&&value.trim()):[];
  const matchedAlias=aliases.find(alias=>candidateName&&candidateName===normalizeName(alias));
  if(aliases.length){
    // Only an explicitly verified alias supplies both identity points from its title.
    // The original name still needs independent visible brand evidence.
    if(matchedAlias)score+=50;
    else{
      const productName=normalizeName(product?.name);
      if(productName&&candidateName&&(candidateName===productName||candidateName===productBrand+productName))score+=35;
      else reasons.push('NAME_UNVERIFIED_OR_DIFFERENT');
      if(matchedBrand)score+=15;
      else reasons.push('BRAND_UNVERIFIED_OR_DIFFERENT');
    }
  }else{
    const candidateBrand = normalize(candidate?.brand);
    if (productBrand && candidateBrand && productBrand === candidateBrand) score += 15;
    else reasons.push('BRAND_UNVERIFIED_OR_DIFFERENT');
    const productName = normalizeName(product?.name);
    if (productName && candidateName && candidateName.includes(productName)) score += 35;
    else reasons.push('NAME_UNVERIFIED_OR_DIFFERENT');
  }

  const expected = dimensions(product);
  const observed = dimensions(candidate);
  if (expected.unitConflict || observed.unitConflict) {
    hardMismatch = true; reasons.push('SPEC_MISMATCH');
  } else if (expected.unit && observed.unit) {
    if (expected.unit === observed.unit) score += 20;
    else { hardMismatch = true; reasons.push('SPEC_MISMATCH'); }
  } else reasons.push('SPEC_UNVERIFIED');

  if (expected.countConflict || observed.countConflict) {
    hardMismatch = true; reasons.push('QUANTITY_MISMATCH');
  } else if (expected.count !== null && observed.count !== null) {
    if (expected.count === observed.count) score += 20;
    else { hardMismatch = true; reasons.push('QUANTITY_MISMATCH'); }
  } else reasons.push('QUANTITY_UNVERIFIED');

  const productOption = normalize(product?.option);
  const candidateOption = normalize(candidate?.option);
  if (productOption === candidateOption) score += 10;
  else reasons.push('OPTION_UNVERIFIED_OR_DIFFERENT');
  return { score, hardMismatch, reasons, ...(matchedAlias?{matchedAlias}:{}), ...(matchedBrand?{matchedBrand}:{}) };
}

export function decidePrice({ match, observedPrice, previousPrice, reverified }) {
  if (!Number.isSafeInteger(observedPrice) || observedPrice <= 0) return { status: 'REJECT', reason: 'INVALID_PRICE' };
  if (!match || !Number.isFinite(match.score) || match.hardMismatch) return { status: 'REJECT', reason: 'HARD_MISMATCH' };
  if (match.score < 85) return { status: 'REJECT', reason: 'LOW_MATCH_SCORE' };
  if (match.score < 95) return { status: 'REVIEW', reason: 'MATCH_SCORE_REVIEW' };
  if (previousPrice == null) return { status: 'ACCEPT', reason: 'FIRST_VERIFIED_PRICE' };
  if (!Number.isSafeInteger(previousPrice) || previousPrice <= 0) return { status: 'REJECT', reason: 'INVALID_PREVIOUS_PRICE' };
  const tier=comparisonChangeTier(observedPrice,previousPrice);
  if (tier === 'WITHIN_20') return { status: 'ACCEPT', reason: 'CHANGE_WITHIN_20_PERCENT' };
  if (tier === 'OVER_40') return { status: 'REVIEW', reason: 'CHANGE_OVER_40_PERCENT' };
  if (reverified) return { status: 'ACCEPT', reason: 'REVERIFIED_CHANGE' };
  return { status: 'REVERIFY', reason: 'CHANGE_REQUIRES_REVERIFICATION' };
}
