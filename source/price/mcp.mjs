import { seedPriceQueue, claimPriceBatch, recordObservation } from './store.mjs';
import { matchCandidate, decidePrice, comparisonNameCore } from './rules.mjs';
import { deriveComparisonBasis, validateObservedQuantity, comparisonBasisKey, ordinaryPriceCondition } from './comparison-basis.mjs';
import { json, InputError, object, validSlug, validCoupangUrl, isOwner, safeOrigin, readJson, loadCatalog, performReview } from './http.mjs';
const integer = (minimum, maximum) => ({type:'integer',minimum,maximum});
const text = {type:'string',maxLength:2000};
const schema = (properties, required=[]) => ({type:'object',properties,required,additionalProperties:false});
const recheckSchema = schema({displayedPrice:integer(1,Number.MAX_SAFE_INTEGER),sourceUrl:{type:'string',format:'uri',maxLength:2048},observedAt:{type:'string',format:'date-time'},productId:text,itemId:text,vendorItemId:text},['displayedPrice','sourceUrl','observedAt']);
const searchCardSchema = schema({title:text,brand:text,spec:text,quantity:text,option:text,productId:text,itemId:text,vendorItemId:text,displayedPrice:integer(1,Number.MAX_SAFE_INTEGER),shippingFee:integer(0,Number.MAX_SAFE_INTEGER),seller:text,priceCondition:text},['title','brand','displayedPrice']);
const failureCodes=['BLOCKED','CAPTCHA','LOGIN_REQUIRED','NO_PRICE','NETWORK_ERROR','PAGE_CHANGED','NO_EXACT_MATCH','AMBIGUOUS_MATCH','IDENTITY_CHANGED','RECHECK_DISAGREED'];
const observationSchema = schema({
 observationId:{type:'string',minLength:1,maxLength:128},slug:{type:'string',pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$',maxLength:160},title:text,brand:text,spec:text,quantity:text,option:text,comparisonQuantity:integer(1,Number.MAX_SAFE_INTEGER),
 displayedPrice:integer(1,Number.MAX_SAFE_INTEGER),sourceUrl:{type:'string',format:'uri',maxLength:2048},observedAt:{type:'string',format:'date-time'},
 productId:text,itemId:text,vendorItemId:text,shippingFee:integer(0,Number.MAX_SAFE_INTEGER),seller:text,priceCondition:text,searchCard:searchCardSchema,recheck:recheckSchema,
},['observationId','slug','title','brand','displayedPrice','sourceUrl','observedAt']);
export const tools = [
 {name:'seed_price_queue',description:'Seed catalog products into the update queue without creating prices.',inputSchema:schema({offset:integer(0,100000),limit:integer(1,100)})},
 {name:'get_price_batch',description:'Reserve up to 20 due products for observation.',inputSchema:schema({limit:integer(1,20)})},
 {name:'submit_price_observations',description:'Submit observed Coupang prices; the server computes match and acceptance.',inputSchema:schema({observations:{type:'array',minItems:1,maxItems:20,items:{oneOf:[observationSchema,schema({observationId:text,slug:text,failure:{type:'string',enum:failureCodes},sourceUrl:{type:'string',format:'uri'},observedAt:{type:'string',format:'date-time'}},['observationId','slug','failure','sourceUrl','observedAt'])]}}},['observations'])},
 {name:'review_price_observation',description:'Append an owner review decision.',inputSchema:schema({historyId:integer(1,Number.MAX_SAFE_INTEGER),action:{type:'string',enum:['ACCEPT','REJECT','RETRY']}},['historyId','action'])},
];
function bounded(value, fallback, min, max) {
 const n = value === undefined ? fallback : value;
 if (!Number.isSafeInteger(n) || n < min || n > max) throw new InputError('Invalid batch bounds');
 return n;
}
function validTimestamp(value) {
 return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now() + 300000;
}
function validateRecheck(value, first) {
 if (!object(value) || !Number.isSafeInteger(value.displayedPrice) || value.displayedPrice !== first.displayedPrice ||
     value.sourceUrl !== first.sourceUrl || !validTimestamp(value.observedAt) || Date.parse(value.observedAt) <= Date.parse(first.observedAt) ||
     ['productId','itemId','vendorItemId'].some(key => (value[key] ?? null) !== (first[key] ?? null))) throw new InputError('Invalid second price check');
 return true;
}
function evidenceReason(product,basis,detail) {
 const card=detail.searchCard;
 if (!ordinaryPriceCondition(detail.priceCondition)) return 'CONDITIONAL_OR_UNVERIFIED_PRICE';
 if (!object(card)) return 'SEARCH_CARD_UNVERIFIED';
 if (card.priceCondition != null && !ordinaryPriceCondition(card.priceCondition)) return 'CONDITIONAL_OR_UNVERIFIED_PRICE';
 if (typeof detail.seller !== 'string' || !detail.seller.trim()) return 'SELLER_UNVERIFIED';
 if (card.seller != null && card.seller.trim() && card.seller !== detail.seller) return 'SELLER_MISMATCH';
 for (const field of ['productId','itemId','vendorItemId']) {
   if (typeof detail[field] !== 'string' || !detail[field].trim() || typeof card[field] !== 'string' || !card[field].trim()) return 'IDENTITY_UNVERIFIED';
   if (detail[field] !== card[field]) return 'IDENTITY_MISMATCH';
 }
 if (!Number.isSafeInteger(detail.shippingFee) || !Number.isSafeInteger(card.shippingFee)) return 'SHIPPING_UNVERIFIED';
 if (detail.displayedPrice !== card.displayedPrice || detail.shippingFee !== card.shippingFee) return 'OFFER_MISMATCH';
 if(Array.isArray(product.comparisonAliases)&&product.comparisonAliases.length&&comparisonNameCore(detail.title)!==comparisonNameCore(card.title))return 'OFFER_MISMATCH';
 if (!validateObservedQuantity(basis,card).valid) return 'SEARCH_CARD_QUANTITY_MISMATCH';
 const cardMatch=matchCandidate({...product,quantity:basis.targetQuantity},{...card,name:card.title});
 if (cardMatch.hardMismatch || cardMatch.score < 95) return 'SEARCH_CARD_PRODUCT_MISMATCH';
 return null;
}
function validateObservation(value, catalog) {
 if (!object(value) || !validSlug(value.slug) || !catalog.some(item => item.slug === value.slug)) throw new InputError('Invalid or unknown slug');
 if (typeof value.observationId !== 'string' || !/^[\w.-]{1,128}$/.test(value.observationId)) throw new InputError('Invalid observationId');
 if(value.failure !== undefined) {
  if(!failureCodes.includes(value.failure)||value.displayedPrice !== undefined||value.recheck !== undefined||!validCoupangUrl(value.sourceUrl)||!validTimestamp(value.observedAt)) throw new InputError('Invalid failure observation');
  return value;
 }
 for (const key of ['title','brand']) if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 2000) throw new InputError(`Invalid ${key}`);
 for (const key of ['spec','quantity','option','productId','itemId','vendorItemId','seller','priceCondition']) if (value[key] != null && (typeof value[key] !== 'string' || value[key].length > 2000)) throw new InputError(`Invalid ${key}`);
 if (!Number.isSafeInteger(value.displayedPrice) || value.displayedPrice <= 0) throw new InputError('Invalid price');
 if (value.comparisonQuantity !== undefined && (!Number.isSafeInteger(value.comparisonQuantity) || value.comparisonQuantity <= 0)) throw new InputError('Invalid comparison quantity');
 if (value.shippingFee != null && (!Number.isSafeInteger(value.shippingFee) || value.shippingFee < 0)) throw new InputError('Invalid shipping fee');
 if (value.searchCard !== undefined) {
   if (!object(value.searchCard)) throw new InputError('Invalid search card');
   for (const field of ['title','brand','spec','quantity','option','productId','itemId','vendorItemId','seller','priceCondition']) if (value.searchCard[field] != null && (typeof value.searchCard[field] !== 'string' || value.searchCard[field].length > 2000)) throw new InputError('Invalid search card');
   if (!Number.isSafeInteger(value.searchCard.displayedPrice) || value.searchCard.displayedPrice <= 0 || value.searchCard.shippingFee != null && (!Number.isSafeInteger(value.searchCard.shippingFee) || value.searchCard.shippingFee < 0)) throw new InputError('Invalid search card');
 }
 if (!validCoupangUrl(value.sourceUrl)) throw new InputError('Invalid Coupang URL');
 if (!validTimestamp(value.observedAt)) throw new InputError('Invalid observation timestamp');
 if (value.recheck !== undefined) validateRecheck(value.recheck,value);
 return value;
}
async function storedDecision(db, observationId) {
 const original = await db.prepare("SELECT id, status, reason, comparison_quantity, comparison_basis FROM price_history WHERE observation_id = ? AND entry_kind = 'OBSERVATION'").bind(observationId).first();
 if (!original) return null;
 const review = await db.prepare("SELECT status, reason FROM price_history WHERE original_history_id = ? AND entry_kind = 'REVIEW_DECISION' ORDER BY id LIMIT 1").bind(original.id).first();
 return {status:review?.status ?? original.status,reason:review?.reason ?? original.reason,originalStatus:original.status,comparisonQuantity:original.comparison_quantity,comparisonBasis:original.comparison_basis};
}
async function callTool(request,env,name,args) {
 if (!object(args)) throw new InputError('Arguments must be an object');
 if (!tools.some(tool=>tool.name===name)) throw new InputError('Unknown tool');
 if (name === 'review_price_observation') return performReview(request,env,args);
 const catalog = await loadCatalog(request,env);
 if (name === 'seed_price_queue') return {created:await seedPriceQueue(env.DB,catalog,bounded(args.offset,0,0,100000),bounded(args.limit,100,1,100))};
 if (name === 'get_price_batch') return {items:await claimPriceBatch(env.DB,catalog,new Date(),bounded(args.limit,20,1,20))};
 if (!Array.isArray(args.observations) || !args.observations.length || args.observations.length > 20) throw new InputError('Provide 1–20 observations');
 const observations = args.observations.map(value=>validateObservation(value,catalog));
 if (new Set(observations.map(value=>value.observationId)).size !== observations.length) throw new InputError('Duplicate observationId in batch');
 for (const observation of observations) {
   const prior = await storedDecision(env.DB,observation.observationId);
   if (prior?.originalStatus === 'REVERIFY' && observation.recheck !== undefined) throw new InputError('Use a new observationId for a second price check');
   if (prior?.originalStatus === 'ACCEPT' && prior.comparisonBasis !== comparisonBasisKey(catalog.find(item=>item.slug===observation.slug))) throw new InputError('Stored observation has a changed comparison basis');
 }
 const results = [];
 for (const observation of observations) {
   if(observation.failure) {
    const status=['BLOCKED','CAPTCHA','LOGIN_REQUIRED'].includes(observation.failure)?'BLOCKED':['NO_EXACT_MATCH','AMBIGUOUS_MATCH','IDENTITY_CHANGED','RECHECK_DISAGREED'].includes(observation.failure)?'REVIEW':'RETRY';
    await recordObservation(env.DB,observation,{status,reason:observation.failure},new Date());
    const persisted=await storedDecision(env.DB,observation.observationId);
    results.push({observationId:observation.observationId,status:persisted.status,reason:persisted.reason});continue;
   }
 const product = catalog.find(item=>item.slug===observation.slug);
   const basis = deriveComparisonBasis(product);
   const quantityCheck = validateObservedQuantity(basis,observation);
   const match = matchCandidate({...product,quantity:basis.targetQuantity},{...observation,name:observation.title});
   const offerReason=evidenceReason(product,basis,observation);
   if (!basis.eligible || !quantityCheck.valid || (observation.comparisonQuantity !== undefined && observation.comparisonQuantity !== basis.comparisonQuantity)) {
     match.hardMismatch=true;
     match.reasons.push(!basis.eligible ? basis.reason : quantityCheck.valid ? 'COMPARISON_QUANTITY_MISMATCH' : quantityCheck.reason);
   }
   const productMismatch=match.hardMismatch;
   if (offerReason) { match.hardMismatch=true; match.reasons.push(offerReason); }
   const basisKey=comparisonBasisKey(product);
   const current = await env.DB.prepare('SELECT displayed_price, comparison_quantity, comparison_basis FROM coupang_price_current WHERE product_slug = ?').bind(observation.slug).first();
   const changedBasis = current && (current.comparison_quantity !== basis.comparisonQuantity || current.comparison_basis !== basisKey);
   const baseline = changedBasis ? null : current?.displayed_price ?? (Number.isSafeInteger(product.referencePrice) && product.referencePrice > 0 && Number.isSafeInteger(product.referencePrice*basis.comparisonQuantity) ? product.referencePrice*basis.comparisonQuantity : null);
   const decision = changedBasis ? {status:'REVIEW',reason:'COMPARISON_BASIS_CHANGED'} : productMismatch ? decidePrice({match,observedPrice:observation.displayedPrice,previousPrice:baseline,reverified:observation.recheck !== undefined}) : offerReason ? {status:'REVIEW',reason:offerReason} : decidePrice({match,observedPrice:observation.displayedPrice,previousPrice:baseline,reverified:observation.recheck !== undefined});
   // A basis transition requires review, but is not itself invalid evidence.
   await recordObservation(env.DB,{...observation,comparisonQuantity:basis.eligible?basis.comparisonQuantity:null,comparisonBasis:basisKey,observedAt:new Date(observation.observedAt).toISOString(),matchScore:match.score,matchReasons:match.reasons,hardMismatch:match.hardMismatch,changePercent:baseline ? (observation.displayedPrice-baseline)/baseline*100 : null},decision,new Date());
   const persisted = await storedDecision(env.DB,observation.observationId);
   if (!persisted) throw new Error('Observation could not be read after storage');
   results.push({observationId:observation.observationId,status:persisted.status,reason:persisted.reason});
 }
 return {results};
}
export async function handleMcp(request,env) {
 if (request.method !== 'POST') return json({error:'Method not allowed'},405,{Allow:'POST'});
 if (!safeOrigin(request)) return json({error:'Forbidden'},403);
 let rpc;
 try { rpc = await readJson(request); } catch { return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON request'}},400); }
 if (!object(rpc) || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string' || !('id' in rpc) || !(rpc.id === null || typeof rpc.id === 'string' || typeof rpc.id === 'number')) return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}},400);
 const reply = (result,status=200) => json({jsonrpc:'2.0',id:rpc.id,result},status);
 if (rpc.method === 'server/discover') return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if (rpc.method === 'tools/list') return reply({tools});
 if (rpc.method !== 'tools/call') return json({jsonrpc:'2.0',id:rpc.id,error:{code:-32601,message:'Method not found'}},400);
 if (!isOwner(request,env)) return json({jsonrpc:'2.0',id:rpc.id,error:{code:-32001,message:'Forbidden'}},403);
 try {
   if (!object(rpc.params) || typeof rpc.params.name !== 'string') throw new InputError('Invalid tool call');
   return reply({content:[{type:'text',text:JSON.stringify(await callTool(request,env,rpc.params.name,rpc.params.arguments ?? {}))}]});
 } catch (error) {
   return reply({isError:true,content:[{type:'text',text:error instanceof InputError ? error.message : 'Price service unavailable'}]},error instanceof InputError ? 400 : 503);
 }
}
